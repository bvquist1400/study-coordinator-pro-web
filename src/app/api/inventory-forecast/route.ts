import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { Study, LabKitAlertDismissalUpdate } from '@/types/database'

const BUFFER_THRESHOLD = 2
const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_SNOOZE_DAYS = 7

interface ForecastUpcomingVisit {
  visit_date: string
  subject_number: string | null
  visit_name: string | null
  quantity_required: number
}

interface ForecastRequirementBreakdown {
  requirementId: string
  visitScheduleId: string
  visitName: string
  visitNumber: number | string | null
  quantityPerVisit: number
  isOptional: boolean
  visitsScheduled: number
  kitsRequired: number
  upcomingVisits: ForecastUpcomingVisit[]
}

interface ForecastPendingOrder {
  id: string
  quantity: number
  vendor: string | null
  expectedArrival: string | null
  status: 'pending' | 'received' | 'cancelled'
  isOverdue: boolean
  notes: string | null
  createdAt: string
  createdBy: string | null
  receivedDate: string | null
}

interface InventoryForecastItem {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  visitName: string
  optional: boolean
  visitsScheduled: number
  kitsRequired: number
  requiredWithBuffer: number
  kitsAvailable: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
  upcomingVisits: ForecastUpcomingVisit[]
  requirements: ForecastRequirementBreakdown[]
  originalDeficit: number
  pendingOrderQuantity: number
  pendingOrders: ForecastPendingOrder[]
  bufferKitsNeeded: number
  bufferMeta: {
    source: 'kit-specific' | 'study-default' | 'none'
    appliedDays: number | null
    minCount: number | null
    targetKits: number
    dailyBurnRate: number
    deliveryDays: number
  }
  baselineTarget: number
  dynamicCushion: number
  deliveryDaysApplied: number
  recommendedOrderQty: number
  riskScore: number
  riskLevel: 'high' | 'medium' | 'low'
  riskFactors: Array<{ type: string; score: number; detail: string }>
}

interface ForecastSummary {
  totalVisitsScheduled: number
  criticalIssues: number
  warnings: number
  highRisk: number
  mediumRisk: number
  daysAhead: number
  baseWindowDays: number
  inventoryBufferDays: number
  visitWindowBufferDays: number
  deliveryDaysDefault: number
}

type KitTypeRow = { id: string; name: string | null; is_active: boolean | null; buffer_days: number | null; buffer_count: number | null; delivery_days: number | null }
type RequirementRow = {
  id: string
  visit_schedule_id: string
  kit_type_id: string | null
  quantity: number | null
  is_optional: boolean | null
  study_kit_types?: { id: string; name: string | null; is_active: boolean | null } | null
}

type SubjectVisitRow = {
  id: string
  visit_date: string
  visit_schedule_id: string | null
  visit_name: string | null
  subjects: { subject_number: string | null } | null
}

type VisitScheduleRow = { id: string; visit_name: string | null; visit_number: number | string | null }

type LabKitRow = {
  id: string
  kit_type_id: string | null
  kit_type: string | null
  status: string
  expiration_date: string | null
}

type LabKitOrderRow = {
  id: string
  study_id: string
  kit_type_id: string | null
  quantity: number
  vendor: string | null
  expected_arrival: string | null
  status: 'pending' | 'received' | 'cancelled'
  notes: string | null
  created_by: string | null
  created_at: string
  received_date: string | null
}

const severityWeight: Record<InventoryForecastItem['status'], number> = {
  critical: 0,
  warning: 1,
  ok: 2
}

const riskWeight: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

function isoDateRange(daysAhead: number) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const future = new Date(today)
  future.setUTCDate(future.getUTCDate() + daysAhead)
  return {
    today,
    todayISO: today.toISOString().slice(0, 10),
    future,
    futureISO: future.toISOString().slice(0, 10)
  }
}

function withinExpiryWindow(expiration: string | null, reference: Date, cutoff: Date): boolean {
  if (!expiration) return false
  const expDate = new Date(expiration)
  if (Number.isNaN(expDate.getTime())) return false
  return expDate >= reference && expDate <= cutoff
}

function daysUntilVisit(dateISO: string, reference: Date): number {
  const dt = new Date(dateISO)
  if (Number.isNaN(dt.getTime())) return Number.POSITIVE_INFINITY
  const diff = dt.getTime() - reference.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const daysParam = Number.parseInt(searchParams.get('days') || `${DEFAULT_WINDOW_DAYS}`, 10)
    const daysAhead = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 180) : DEFAULT_WINDOW_DAYS

    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

   const supabase = createSupabaseAdmin()

type StudyBufferSettings = Pick<Study, 'inventory_buffer_days' | 'visit_window_buffer_days' | 'delivery_days_default'>
const { data: studySettings, error: studySettingsError } = await supabase
  .from('studies')
  .select('inventory_buffer_days, visit_window_buffer_days, delivery_days_default')
  .eq('id', studyId)
  .single<StudyBufferSettings>()

if (studySettingsError) {
  logger.error('inventory-forecast: failed to load study buffer settings', studySettingsError, { studyId })
  return NextResponse.json({ error: 'Failed to load study settings' }, { status: 500 })
}


    const inventoryBufferDays = Math.max(0, Math.min(120, (studySettings?.inventory_buffer_days ?? 0)))
    const visitWindowBufferDays = Math.max(0, Math.min(60, (studySettings?.visit_window_buffer_days ?? 0)))
    const deliveryDaysDefault = Math.max(0, Math.min(120, (studySettings?.delivery_days_default ?? 5)))
    const effectiveDaysAhead = Math.min(daysAhead + visitWindowBufferDays, 180)

    const { today, todayISO, futureISO } = isoDateRange(effectiveDaysAhead)
    const expiryCutoff = new Date(today)
    const expiryWindowDays = Math.max(1, Math.min(effectiveDaysAhead, DEFAULT_WINDOW_DAYS))
    expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + expiryWindowDays)

    const [{ data: kitTypeRows, error: kitTypeError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
      supabase
        .from('study_kit_types')
        .select('id, name, is_active, buffer_days, buffer_count, delivery_days')
        .eq('study_id', studyId),
      supabase
        .from('visit_schedules')
        .select('id, visit_name, visit_number')
        .eq('study_id', studyId)
    ])

    if (kitTypeError) {
      logger.error('inventory-forecast: failed to load study kit types', kitTypeError, { studyId })
      return NextResponse.json({ error: 'Failed to load kit types' }, { status: 500 })
    }
    if (scheduleError) {
      logger.error('inventory-forecast: failed to load visit schedules', scheduleError, { studyId })
      return NextResponse.json({ error: 'Failed to load visit schedules' }, { status: 500 })
    }

    const kitTypes = (kitTypeRows || []) as KitTypeRow[]
    const schedules = (scheduleRows || []) as VisitScheduleRow[]
    const scheduleById = new Map<string, VisitScheduleRow>()
    for (const schedule of schedules) {
      scheduleById.set(schedule.id, schedule)
    }

    const kitTypeById = new Map<string, KitTypeRow>()
    const kitTypeKeyByName = new Map<string, string>()
    for (const kitType of kitTypes) {
      kitTypeById.set(kitType.id, kitType)
      const nameKey = normalizeName(kitType.name)
      if (nameKey) {
        kitTypeKeyByName.set(nameKey, kitType.id)
      }
    }

    const { data: requirementRows, error: requirementsError } = await supabase
      .from('visit_kit_requirements')
      .select('id, visit_schedule_id, kit_type_id, quantity, is_optional, study_kit_types(id, name, is_active)')
      .eq('study_id', studyId)

    if (requirementsError) {
      logger.error('inventory-forecast: failed to load visit kit requirements', requirementsError, { studyId })
      return NextResponse.json({ error: 'Failed to load kit requirements' }, { status: 500 })
    }

    const requirements = (requirementRows || []).map((row) => ({
      ...row,
      study_kit_types:
        row.study_kit_types && 'id' in row.study_kit_types
          ? row.study_kit_types
          : null
    })) as RequirementRow[]
    if (requirements.length === 0) {
      const summary: ForecastSummary = {
        totalVisitsScheduled: 0,
        criticalIssues: 0,
        warnings: 0,
        highRisk: 0,
        mediumRisk: 0,
        daysAhead: effectiveDaysAhead,
        baseWindowDays: daysAhead,
        inventoryBufferDays,
        visitWindowBufferDays,
        deliveryDaysDefault
      }
      return NextResponse.json({ forecast: [] as InventoryForecastItem[], summary })
    }

    const entryByKey = new Map<string, InventoryForecastItem>()
    const keyByKitTypeId = new Map<string, string>()
    const keyByName = new Map<string, string>()

    const ensureEntry = (kitTypeId: string | null, fallbackName: string): InventoryForecastItem => {
      const normalizedName = normalizeName(fallbackName) || 'uncategorized kit'
      const key = kitTypeId ?? `name:${normalizedName}`
      const existing = entryByKey.get(key)
      if (existing) return existing

      const entry: InventoryForecastItem = {
        key,
        kitTypeId,
        kitTypeName: fallbackName,
        visitName: fallbackName,
        optional: true,
        visitsScheduled: 0,
        kitsRequired: 0,
        requiredWithBuffer: 0,
        kitsAvailable: 0,
        kitsExpiringSoon: 0,
        deficit: 0,
        status: 'ok',
        upcomingVisits: [],
        requirements: [],
        originalDeficit: 0,
        pendingOrderQuantity: 0,
        pendingOrders: [],
        bufferKitsNeeded: 0,
        bufferMeta: {
          source: 'none',
          appliedDays: null,
          minCount: null,
          targetKits: 0,
          dailyBurnRate: 0,
          deliveryDays: 0
        },
        baselineTarget: 0,
        dynamicCushion: 0,
        deliveryDaysApplied: 0,
        recommendedOrderQty: 0,
        riskScore: 0,
        riskLevel: 'low',
        riskFactors: []
      }

      entryByKey.set(key, entry)
      if (kitTypeId) {
        keyByKitTypeId.set(kitTypeId, key)
      }
      if (normalizedName) {
        keyByName.set(normalizedName, key)
      }
      return entry
    }

    for (const requirement of requirements) {
      const schedule = scheduleById.get(requirement.visit_schedule_id) || null
      const linkedKitType = requirement.kit_type_id ? kitTypeById.get(requirement.kit_type_id) || null : null
      const kitTypeName = linkedKitType?.name
        ?? requirement.study_kit_types?.name
        ?? 'Uncategorized kit'

      const entry = ensureEntry(requirement.kit_type_id, kitTypeName || 'Uncategorized kit')

      const breakdown: ForecastRequirementBreakdown = {
        requirementId: requirement.id,
        visitScheduleId: requirement.visit_schedule_id,
        visitName: schedule?.visit_name ?? 'Unscheduled Visit',
        visitNumber: schedule?.visit_number ?? null,
        quantityPerVisit: Math.max(1, requirement.quantity ?? 1),
        isOptional: !!requirement.is_optional,
        visitsScheduled: 0,
        kitsRequired: 0,
        upcomingVisits: []
      }

      entry.requirements.push(breakdown)
    }

    const { data: subjectVisitRows, error: visitsError } = await supabase
      .from('subject_visits')
      .select('id, visit_date, visit_schedule_id, visit_name, subjects(subject_number)')
      .eq('study_id', studyId)
      .eq('status', 'scheduled')
      .gte('visit_date', todayISO)
      .lte('visit_date', futureISO)

    if (visitsError) {
      logger.error('inventory-forecast: failed to load upcoming subject visits', visitsError, { studyId })
      return NextResponse.json({ error: 'Failed to load upcoming visits' }, { status: 500 })
    }

    const normalizedSubjectVisits = (subjectVisitRows || []).map((row) => ({
      ...row,
      subjects:
        row.subjects && typeof row.subjects === 'object' && 'subject_number' in row.subjects
          ? row.subjects
          : null
    })) as SubjectVisitRow[]

    const visitsBySchedule = new Map<string, SubjectVisitRow[]>()
    for (const row of normalizedSubjectVisits) {
      if (!row.visit_schedule_id) continue
      if (!visitsBySchedule.has(row.visit_schedule_id)) {
        visitsBySchedule.set(row.visit_schedule_id, [])
      }
      visitsBySchedule.get(row.visit_schedule_id)!.push(row)
    }

    for (const entry of entryByKey.values()) {
      for (const breakdown of entry.requirements) {
        const scheduledVisits = visitsBySchedule.get(breakdown.visitScheduleId) || []
        breakdown.visitsScheduled = scheduledVisits.length
        breakdown.kitsRequired = breakdown.visitsScheduled * breakdown.quantityPerVisit
        breakdown.upcomingVisits = scheduledVisits.map(visit => ({
          visit_date: visit.visit_date,
          subject_number: visit.subjects?.subject_number ?? null,
          visit_name: visit.visit_name ?? breakdown.visitName,
          quantity_required: breakdown.quantityPerVisit
        }))

        entry.visitsScheduled += breakdown.visitsScheduled
        entry.kitsRequired += breakdown.kitsRequired
        entry.upcomingVisits.push(...breakdown.upcomingVisits)
        if (!breakdown.isOptional) {
          entry.optional = false
        }
      }
    }

    const { data: kitRows, error: kitError } = await supabase
      .from('lab_kits')
      .select('id, kit_type_id, kit_type, status, expiration_date')
      .eq('study_id', studyId)
      .in('status', ['available', 'assigned', 'pending_shipment', 'shipped', 'expired'])

    if (kitError) {
      logger.error('inventory-forecast: failed to load lab kits', kitError, { studyId })
      return NextResponse.json({ error: 'Failed to load lab kits' }, { status: 500 })
    }

    let expiringSoonCount = 0
    let earliestExpiringDate: string | null = null

    for (const kit of (kitRows || []) as LabKitRow[]) {
      const kitTypeId = kit.kit_type_id
      let key = kitTypeId ? keyByKitTypeId.get(kitTypeId) : undefined

      if (!key) {
        const fallbackNameKey = normalizeName(kit.kit_type)
        if (fallbackNameKey) {
          key = keyByName.get(fallbackNameKey)
        }
      }

      if (!key) {
        continue // Kit does not align with any requirement entry
      }

      const entry = entryByKey.get(key)
      if (!entry) continue

      if (kit.status === 'available') {
        entry.kitsAvailable += 1
        if (withinExpiryWindow(kit.expiration_date, today, expiryCutoff)) {
          entry.kitsExpiringSoon += 1
          expiringSoonCount += 1
          if (kit.expiration_date) {
            if (!earliestExpiringDate || kit.expiration_date < earliestExpiringDate) {
              earliestExpiringDate = kit.expiration_date
            }
          }
        }
      }
    }

    const { data: orderRows, error: orderError } = await supabase
      .from('lab_kit_orders')
      .select('id, study_id, kit_type_id, quantity, vendor, expected_arrival, status, notes, created_by, created_at, received_date')
      .eq('study_id', studyId)

    if (orderError) {
      logger.error('inventory-forecast: failed to load lab kit orders', orderError, { studyId })
      return NextResponse.json({ error: 'Failed to load lab kit orders' }, { status: 500 })
    }

    const ordersByKey = new Map<string, { totalPending: number; orders: ForecastPendingOrder[] }>()

    for (const row of (orderRows || []) as LabKitOrderRow[]) {
      const kitTypeId = row.kit_type_id
      if (!kitTypeId) continue

      let key = keyByKitTypeId.get(kitTypeId)
      if (!key) {
        const kitType = kitTypeById.get(kitTypeId)
        if (kitType) {
          const entry = ensureEntry(kitTypeId, kitType.name || 'Uncategorized kit')
          key = entry.key
        }
      }
      if (!key) continue

      const isPending = row.status === 'pending'
      const expectedArrival = row.expected_arrival
      const isOverdue = isPending && !!expectedArrival && expectedArrival < todayISO

      if (!ordersByKey.has(key)) {
        ordersByKey.set(key, { totalPending: 0, orders: [] })
      }
      const bucket = ordersByKey.get(key)!

      if (isPending) {
        bucket.totalPending += row.quantity
      }

      bucket.orders.push({
        id: row.id,
        quantity: row.quantity,
        vendor: row.vendor ?? null,
        expectedArrival,
        status: row.status,
        isOverdue,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        createdBy: row.created_by ?? null,
        receivedDate: row.received_date ?? null
      })
    }

    const forecast: InventoryForecastItem[] = []

    for (const entry of entryByKey.values()) {
      entry.upcomingVisits.sort((a, b) => a.visit_date.localeCompare(b.visit_date))
      entry.requirements.sort((a, b) => b.kitsRequired - a.kitsRequired)

      const orderBucket = ordersByKey.get(entry.key)
      if (orderBucket) {
        entry.pendingOrderQuantity = orderBucket.totalPending
        entry.pendingOrders = orderBucket.orders.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1
          if (a.status !== 'pending' && b.status === 'pending') return 1
          const aDate = a.expectedArrival || a.createdAt
          const bDate = b.expectedArrival || b.createdAt
          return aDate.localeCompare(bDate)
        })
      } else {
        entry.pendingOrderQuantity = 0
        entry.pendingOrders = []
      }

      const kitTypeInfo = entry.kitTypeId ? kitTypeById.get(entry.kitTypeId) ?? null : null
      const kitBufferDaysRaw = kitTypeInfo?.buffer_days
      const kitBufferCountRaw = kitTypeInfo?.buffer_count
      const kitDeliveryDaysRaw = kitTypeInfo?.delivery_days

      const appliedDaysRaw = kitBufferDaysRaw !== null && kitBufferDaysRaw !== undefined
        ? kitBufferDaysRaw
        : inventoryBufferDays

      const safetyDays = appliedDaysRaw && Number.isFinite(appliedDaysRaw)
        ? Math.max(0, Math.min(120, appliedDaysRaw))
        : 0

      const deliveryDaysApplied = kitDeliveryDaysRaw !== null && kitDeliveryDaysRaw !== undefined
        ? Math.max(0, Math.min(120, kitDeliveryDaysRaw))
        : deliveryDaysDefault

      const minCountRaw = kitBufferCountRaw !== null && kitBufferCountRaw !== undefined
        ? kitBufferCountRaw
        : 0
      const minCount = Math.max(0, Math.min(999, minCountRaw))

      const dailyBurnRate = entry.kitsRequired > 0 && effectiveDaysAhead > 0
        ? entry.kitsRequired / Math.max(1, effectiveDaysAhead)
        : 0

      const cushionFromSafety = safetyDays > 0 && dailyBurnRate > 0
        ? Math.ceil(dailyBurnRate * safetyDays)
        : 0

      const cushionFromDelivery = deliveryDaysApplied > 0 && dailyBurnRate > 0
        ? Math.ceil(dailyBurnRate * deliveryDaysApplied)
        : 0

      const bufferFromDays = cushionFromSafety + cushionFromDelivery
      const bufferKitsNeeded = Math.max(bufferFromDays, minCount)
      const bufferSource: 'kit-specific' | 'study-default' | 'none' =
        (kitBufferDaysRaw !== null && kitBufferDaysRaw !== undefined) || (kitBufferCountRaw !== null && kitBufferCountRaw !== undefined) || (kitDeliveryDaysRaw !== null && kitDeliveryDaysRaw !== undefined)
          ? 'kit-specific'
          : inventoryBufferDays > 0 || deliveryDaysDefault > 0
            ? 'study-default'
            : 'none'

      entry.bufferKitsNeeded = bufferKitsNeeded
      entry.requiredWithBuffer = entry.kitsRequired + bufferKitsNeeded
      entry.baselineTarget = Math.max(entry.kitsRequired, minCount)
      entry.dynamicCushion = Math.max(0, bufferFromDays)
      entry.deliveryDaysApplied = deliveryDaysApplied
      entry.bufferMeta = {
        source: bufferSource,
        appliedDays: safetyDays > 0 ? safetyDays : null,
        minCount: minCount > 0 ? minCount : null,
        targetKits: bufferKitsNeeded,
        dailyBurnRate,
        deliveryDays: deliveryDaysApplied
      }

      entry.originalDeficit = Math.max(0, entry.requiredWithBuffer - entry.kitsAvailable)
      entry.deficit = Math.max(0, entry.requiredWithBuffer - (entry.kitsAvailable + entry.pendingOrderQuantity))

      const usableKits = Math.max(0, entry.kitsAvailable - entry.kitsExpiringSoon)
      const coverageAfterPending = usableKits + entry.pendingOrderQuantity
      entry.recommendedOrderQty = Math.max(0, entry.requiredWithBuffer - coverageAfterPending)

      const slackAfterPending = (entry.kitsAvailable + entry.pendingOrderQuantity) - entry.requiredWithBuffer
      const slackAfterExpiry = coverageAfterPending - entry.requiredWithBuffer

      if (entry.deficit > 0) {
        entry.status = entry.optional ? 'warning' : 'critical'
      } else if (entry.originalDeficit > 0 && entry.pendingOrderQuantity > 0) {
        entry.status = 'warning'
      } else if (entry.requiredWithBuffer === 0) {
        entry.status = entry.kitsExpiringSoon > 0 ? 'warning' : 'ok'
      } else if (slackAfterPending <= BUFFER_THRESHOLD || entry.kitsExpiringSoon > 0 || slackAfterExpiry <= 0) {
        entry.status = 'warning'
      } else {
        entry.status = 'ok'
      }

      const riskFactors: Array<{ type: string; score: number; detail: string }> = []

      if (entry.deficit > 0) {
        riskFactors.push({ type: 'deficit', score: Math.min(60, 40 + entry.deficit * 5), detail: `Short ${entry.deficit} kits even after pending orders` })
      } else if (entry.originalDeficit > 0) {
        riskFactors.push({ type: 'covered', score: 25, detail: 'Pending orders cover an upcoming shortage' })
      }

      if (entry.kitsExpiringSoon > 0) {
        riskFactors.push({ type: 'expiry', score: Math.min(20, entry.kitsExpiringSoon * 4), detail: `${entry.kitsExpiringSoon} kits expiring soon` })
      }

      const surgeWindow = Math.max(7, deliveryDaysApplied || 0)
      let surgeQuantity = 0
      for (const upcoming of entry.upcomingVisits) {
        const diffDays = daysUntilVisit(upcoming.visit_date, today)
        if (diffDays <= surgeWindow) {
          surgeQuantity += upcoming.quantity_required
        }
      }
      if (surgeQuantity > 0) {
        riskFactors.push({ type: 'surge', score: Math.min(25, surgeQuantity * 3), detail: `${surgeQuantity} kits needed in next ${surgeWindow}d` })
      }

      if (deliveryDaysApplied > 0) {
        riskFactors.push({ type: 'delivery', score: Math.min(15, deliveryDaysApplied), detail: `${deliveryDaysApplied}d delivery time` })
      }

      if (slackAfterExpiry < 0) {
        riskFactors.push({ type: 'expiry_slack', score: 15, detail: 'Coverage relies on kits expiring soon' })
      }

      entry.riskFactors = riskFactors
      const riskScore = Math.min(100, riskFactors.reduce((sum, factor) => sum + factor.score, 0))
      entry.riskScore = riskScore
      entry.riskLevel = entry.deficit > 0 || riskScore >= 70 ? 'high' : (riskScore >= 40 || entry.recommendedOrderQty > 0 ? 'medium' : 'low')

      forecast.push(entry)
    }

    forecast.sort((a, b) => {
      const riskDiff = riskWeight[a.riskLevel] - riskWeight[b.riskLevel]
      if (riskDiff !== 0) return riskDiff
      const scoreDiff = b.riskScore - a.riskScore
      if (scoreDiff !== 0) return scoreDiff
      const severityDiff = severityWeight[a.status] - severityWeight[b.status]
      if (severityDiff !== 0) return severityDiff
      const deficitDiff = b.deficit - a.deficit
      if (deficitDiff !== 0) return deficitDiff
      return b.visitsScheduled - a.visitsScheduled
    })

    const summary: ForecastSummary = {
      totalVisitsScheduled: forecast.reduce((sum, item) => sum + item.visitsScheduled, 0),
      criticalIssues: forecast.filter(item => item.status === 'critical').length,
      warnings: forecast.filter(item => item.status === 'warning').length,
      highRisk: forecast.filter(item => item.riskLevel === 'high').length,
      mediumRisk: forecast.filter(item => item.riskLevel === 'medium').length,
      daysAhead: effectiveDaysAhead,
      baseWindowDays: daysAhead,
      inventoryBufferDays,
      visitWindowBufferDays,
      deliveryDaysDefault
    }

    const supplyDeficitMetrics = forecast.reduce(
      (acc, item) => {
        const deficit = Math.max(0, item.deficit)
        if (deficit > 0) {
          acc.total += deficit
          acc.count += 1
          acc.max = Math.max(acc.max, deficit)
        }
        return acc
      },
      { total: 0, count: 0, max: 0 }
    )

    const suggestedOrderMetrics = forecast.reduce(
      (acc, item) => {
        if (item.recommendedOrderQty > 0) {
          acc.count += 1
          acc.totalQty += item.recommendedOrderQty
        }
        return acc
      },
      { count: 0, totalQty: 0 }
    )

    const lowBufferMetrics = forecast.reduce(
      (acc, item) => {
        const slack = (item.kitsAvailable + item.pendingOrderQuantity) - item.requiredWithBuffer
        if (item.deficit <= 0 && slack >= 0 && item.status === 'warning') {
          acc.count += 1
          acc.minSlack = Math.min(acc.minSlack, slack)
        }
        return acc
      },
      { count: 0, minSlack: Number.POSITIVE_INFINITY }
    )

    const alertMetrics = {
      supplyDeficit: {
        totalDeficit: supplyDeficitMetrics.total,
        maxDeficit: supplyDeficitMetrics.max,
        count: supplyDeficitMetrics.count
      },
      lowBuffer: {
        count: lowBufferMetrics.count,
        minSlack: Number.isFinite(lowBufferMetrics.minSlack) ? lowBufferMetrics.minSlack : null
      },
      expiringSoon: {
        count: expiringSoonCount,
        earliestExpiryDate: earliestExpiringDate
      },
      suggestedOrders: suggestedOrderMetrics
    }

    const { data: dismissalRows, error: dismissalError } = await supabase
      .from('lab_kit_alert_dismissals')
      .select('id, alert_id, conditions, snooze_until, dismissed_at')
      .eq('study_id', studyId)
      .eq('user_id', user.id)
      .is('restored_at', null)

    if (dismissalError) {
      logger.error('inventory-forecast: failed to load alert dismissals', dismissalError, { studyId, userId: user.id })
      return NextResponse.json({ error: 'Failed to load alert state' }, { status: 500 })
    }

    const activeAlerts = new Set<string>()
    const metadata: Array<{ alertId: string; snoozeUntil: string | null }> = []
    const autoRestoredAlerts: string[] = []

    const now = new Date()
    const restoreUpdates: Array<{ id: string; rule: string }> = []

    const nowIso = new Date().toISOString()
    if (Array.isArray(dismissalRows)) {
      for (const row of dismissalRows as any[]) {
        const alertId = row.alert_id as string
        const conditions = (row.conditions || {}) as Record<string, any>
        const snoozeUntil = typeof row.snooze_until === 'string' ? row.snooze_until : null
        const dismissedAt = typeof row.dismissed_at === 'string' ? row.dismissed_at : null

        let shouldRestore = false
        let restoreRule = ''

        if (snoozeUntil) {
          const snoozeDate = new Date(snoozeUntil)
          if (!Number.isNaN(snoozeDate.getTime()) && snoozeDate <= now) {
            shouldRestore = true
            restoreRule = 'snooze_expired'
          }
        }

        if (!shouldRestore) {
          switch (alertId) {
            case 'supplyDeficit': {
              const previousDeficit = Number(conditions?.deficit ?? 0)
              const currentDeficit = alertMetrics.supplyDeficit.totalDeficit
              if (currentDeficit >= previousDeficit * 1.5 && currentDeficit > previousDeficit) {
                shouldRestore = true
                restoreRule = 'supply_deficit_increase'
              } else if (currentDeficit >= 10 && previousDeficit < 10) {
                shouldRestore = true
                restoreRule = 'supply_deficit_threshold'
              }
              break
            }
            case 'expiringSoon': {
              const prevCount = Number(conditions?.kitsExpiringSoon ?? 0)
              const prevEarliest = typeof conditions?.earliestExpiryDate === 'string' ? conditions.earliestExpiryDate : null
              const currentCount = alertMetrics.expiringSoon.count
              if (currentCount >= prevCount * 2 && currentCount > prevCount) {
                shouldRestore = true
                restoreRule = 'expiring_count_increase'
              } else if (alertMetrics.expiringSoon.earliestExpiryDate && prevEarliest) {
                const prevDate = new Date(prevEarliest)
                const currentDate = new Date(alertMetrics.expiringSoon.earliestExpiryDate)
                if (!Number.isNaN(prevDate.getTime()) && !Number.isNaN(currentDate.getTime())) {
                  const prevDays = Math.floor((prevDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  const currentDays = Math.floor((currentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  if (currentDays < prevDays - 2) {
                    shouldRestore = true
                    restoreRule = 'expiring_window_shorter'
                  }
                }
              }
              break
            }
            default: {
              // For other alerts, rely on snooze window only
              if (!snoozeUntil && dismissedAt) {
                const dismissedDate = new Date(dismissedAt)
                if (!Number.isNaN(dismissedDate.getTime())) {
                  const daysElapsed = Math.floor((now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24))
                  if (daysElapsed >= DEFAULT_SNOOZE_DAYS) {
                    shouldRestore = true
                    restoreRule = 'default_window'
                  }
                }
              }
              break
            }
          }
        }

        if (shouldRestore) {
          restoreUpdates.push({ id: row.id as string, rule: restoreRule })
          autoRestoredAlerts.push(alertId)
        } else {
          activeAlerts.add(alertId)
          metadata.push({ alertId, snoozeUntil })
        }
      }
    }

    if (restoreUpdates.length > 0) {
      await Promise.all(
        restoreUpdates.map(update => {
          const payload: LabKitAlertDismissalUpdate = {
            auto_restore_rule: update.rule,
            restored_at: nowIso,
            updated_at: nowIso
          }
          return (supabase as any)
            .from('lab_kit_alert_dismissals')
            .update(payload)
            .eq('id', update.id)
        })
      )
    }

    return NextResponse.json({
      forecast,
      summary,
      dismissedAlerts: Array.from(activeAlerts),
      dismissedMetadata: metadata,
      autoRestoredAlerts,
      alertMetrics
    })
  } catch (error) {
    logger.error('inventory-forecast: unexpected error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
