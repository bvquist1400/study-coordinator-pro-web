import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import logger from '@/lib/logger'

const BUFFER_THRESHOLD = 2
const DEFAULT_WINDOW_DAYS = 30

export interface ForecastUpcomingVisit {
  visit_date: string
  subject_number: string | null
  visit_name: string | null
  quantity_required: number
}

export interface ForecastRequirementBreakdown {
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

export interface ForecastPendingOrder {
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

export interface InventoryForecastItem {
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
}

export interface ForecastSummary {
  totalVisitsScheduled: number
  criticalIssues: number
  warnings: number
  daysAhead: number
  baseWindowDays: number
  inventoryBufferDays: number
  visitWindowBufferDays: number
}

export interface InventoryForecastResult {
  forecast: InventoryForecastItem[]
  summary: ForecastSummary
  context: {
    todayISO: string
    futureISO: string
    effectiveDaysAhead: number
    expiryCutoffISO: string
    expiryWindowDays: number
    inventoryBufferDays: number
    visitWindowBufferDays: number
    kitTypeNames: Record<string, string | null>
  }
}

export class ForecastServiceError extends Error {
  constructor(public message: string, public status = 500, public details?: unknown) {
    super(message)
    this.name = 'ForecastServiceError'
  }
}

type KitTypeRow = { id: string; name: string | null; is_active: boolean | null }
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

export async function loadInventoryForecast(
  supabase: SupabaseClient<Database>,
  studyId: string,
  daysAhead: number
): Promise<InventoryForecastResult> {
  const days = Number.isFinite(daysAhead) && daysAhead > 0 ? Math.min(daysAhead, 180) : DEFAULT_WINDOW_DAYS

  const { data: studySettings, error: studySettingsError } = await supabase
    .from('studies')
    .select('inventory_buffer_days, visit_window_buffer_days')
    .eq('id', studyId)
    .single<{ inventory_buffer_days: number | null; visit_window_buffer_days: number | null }>()

  if (studySettingsError) {
    logger.error('inventory-forecast: failed to load study buffer settings', studySettingsError, { studyId })
    throw new ForecastServiceError('Failed to load study settings', 500, studySettingsError)
  }

  const inventoryBufferDays = Math.max(0, Math.min(120, (studySettings?.inventory_buffer_days ?? 0)))
  const visitWindowBufferDays = Math.max(0, Math.min(60, (studySettings?.visit_window_buffer_days ?? 0)))
  const effectiveDaysAhead = Math.min(days + visitWindowBufferDays, 180)

  const { today, todayISO, futureISO } = isoDateRange(effectiveDaysAhead)
  const expiryCutoff = new Date(today)
  const expiryWindowDays = Math.max(1, Math.min(effectiveDaysAhead, DEFAULT_WINDOW_DAYS))
  expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + expiryWindowDays)

  const [{ data: kitTypeRows, error: kitTypeError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
    supabase
      .from('study_kit_types')
      .select('id, name, is_active')
      .eq('study_id', studyId),
    supabase
      .from('visit_schedules')
      .select('id, visit_name, visit_number')
      .eq('study_id', studyId)
  ])

  if (kitTypeError) {
    logger.error('inventory-forecast: failed to load study kit types', kitTypeError, { studyId })
    throw new ForecastServiceError('Failed to load kit types', 500, kitTypeError)
  }
  if (scheduleError) {
    logger.error('inventory-forecast: failed to load visit schedules', scheduleError, { studyId })
    throw new ForecastServiceError('Failed to load visit schedules', 500, scheduleError)
  }

  const kitTypes = (kitTypeRows || []) as KitTypeRow[]
  const kitTypeNames: Record<string, string | null> = {}
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
    kitTypeNames[kitType.id] = kitType.name ?? null
  }

  const { data: requirementRows, error: requirementsError } = await supabase
    .from('visit_kit_requirements')
    .select('id, visit_schedule_id, kit_type_id, quantity, is_optional, study_kit_types(id, name, is_active)')
    .eq('study_id', studyId)

  if (requirementsError) {
    logger.error('inventory-forecast: failed to load visit kit requirements', requirementsError, { studyId })
    throw new ForecastServiceError('Failed to load kit requirements', 500, requirementsError)
  }

  const requirements = (requirementRows || []) as RequirementRow[]
  if (requirements.length === 0) {
    const summary: ForecastSummary = {
      totalVisitsScheduled: 0,
      criticalIssues: 0,
      warnings: 0,
      daysAhead: effectiveDaysAhead,
      baseWindowDays: days,
      inventoryBufferDays,
      visitWindowBufferDays
    }
    return {
      forecast: [] as InventoryForecastItem[],
      summary,
      context: {
        todayISO,
        futureISO,
        effectiveDaysAhead,
        expiryCutoffISO: expiryCutoff.toISOString().slice(0, 10),
        expiryWindowDays,
        inventoryBufferDays,
        visitWindowBufferDays,
        kitTypeNames
      }
    }
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
      bufferKitsNeeded: 0
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
    throw new ForecastServiceError('Failed to load upcoming visits', 500, visitsError)
  }

  const visitsBySchedule = new Map<string, SubjectVisitRow[]>()
  for (const row of (subjectVisitRows || []) as SubjectVisitRow[]) {
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
    .in('status', ['available', 'assigned'])

  if (kitError) {
    logger.error('inventory-forecast: failed to load lab kits', kitError, { studyId })
    throw new ForecastServiceError('Failed to load lab kits', 500, kitError)
  }

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
      continue
    }

    const entry = entryByKey.get(key)
    if (!entry) continue

    if (kit.status === 'available') {
      entry.kitsAvailable += 1
      if (withinExpiryWindow(kit.expiration_date, today, expiryCutoff)) {
        entry.kitsExpiringSoon += 1
      }
    }
  }

  const { data: orderRows, error: orderError } = await supabase
    .from('lab_kit_orders')
    .select('id, study_id, kit_type_id, quantity, vendor, expected_arrival, status, notes, created_by, created_at, received_date')
    .eq('study_id', studyId)

  if (orderError) {
    logger.error('inventory-forecast: failed to load lab kit orders', orderError, { studyId })
    throw new ForecastServiceError('Failed to load lab kit orders', 500, orderError)
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

    const bufferKitsNeeded = inventoryBufferDays > 0 && effectiveDaysAhead > 0
      ? Math.max(0, Math.ceil((entry.kitsRequired / Math.max(1, effectiveDaysAhead)) * inventoryBufferDays))
      : 0

    entry.bufferKitsNeeded = bufferKitsNeeded
    entry.requiredWithBuffer = entry.kitsRequired + bufferKitsNeeded

    entry.originalDeficit = Math.max(0, entry.requiredWithBuffer - entry.kitsAvailable)
    entry.deficit = Math.max(0, entry.requiredWithBuffer - (entry.kitsAvailable + entry.pendingOrderQuantity))

    const slackAfterPending = (entry.kitsAvailable + entry.pendingOrderQuantity) - entry.requiredWithBuffer

    if (entry.deficit > 0) {
      entry.status = entry.optional ? 'warning' : 'critical'
    } else if (entry.originalDeficit > 0 && entry.pendingOrderQuantity > 0) {
      entry.status = 'warning'
    } else if (entry.requiredWithBuffer === 0) {
      entry.status = entry.kitsExpiringSoon > 0 ? 'warning' : 'ok'
    } else if (slackAfterPending <= BUFFER_THRESHOLD || entry.kitsExpiringSoon > 0) {
      entry.status = 'warning'
    } else {
      entry.status = 'ok'
    }

    forecast.push(entry)
  }

  forecast.sort((a, b) => {
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
    daysAhead: effectiveDaysAhead,
    baseWindowDays: days,
    inventoryBufferDays,
    visitWindowBufferDays
  }

  return {
    forecast,
    summary,
    context: {
      todayISO,
      futureISO,
      effectiveDaysAhead,
      expiryCutoffISO: expiryCutoff.toISOString().slice(0, 10),
      expiryWindowDays,
      inventoryBufferDays,
      visitWindowBufferDays,
      kitTypeNames
    }
  }
}

export type { InventoryForecastItem as ForecastItem }
