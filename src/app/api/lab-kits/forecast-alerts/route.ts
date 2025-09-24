import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { ForecastServiceError, loadInventoryForecast, type ForecastItem } from '@/lib/lab-kits/forecast-service'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100
const DEFAULT_DAYS = 30
const DEFAULT_PENDING_AGING_DAYS = 7
const DEFAULT_SHIPPED_AGING_DAYS = 10

interface LabKitRecord {
  id: string
  accession_number: string | null
  kit_type_id: string | null
  kit_type: string | null
  status: string
  expiration_date: string | null
  updated_at: string | null
  created_at: string | null
}

function clampLimit(limit: number | null | undefined) {
  if (!Number.isFinite(limit ?? NaN)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Number(limit)))
}

function parseNumber(param: string | null, fallback: number) {
  if (!param) return fallback
  const parsed = Number.parseInt(param, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function toStartOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function diffInDays(from: Date, to: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.floor((from.getTime() - to.getTime()) / msPerDay)
}

function resolveKitTypeName(kit: LabKitRecord, kitTypeNames: Record<string, string | null>) {
  if (kit.kit_type_id && kitTypeNames[kit.kit_type_id] !== undefined) {
    return kitTypeNames[kit.kit_type_id] ?? kit.kit_type ?? null
  }
  return kit.kit_type ?? null
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId') || searchParams.get('study_id')
    if (!studyId) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const limit = clampLimit(Number.parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10))
    const daysAhead = parseNumber(searchParams.get('days'), DEFAULT_DAYS)
    const expiringDays = parseNumber(searchParams.get('expiringDays'), DEFAULT_DAYS)
    const pendingAgingDays = parseNumber(searchParams.get('pendingAgingDays'), DEFAULT_PENDING_AGING_DAYS)
    const shippedAgingDays = parseNumber(searchParams.get('shippedAgingDays'), DEFAULT_SHIPPED_AGING_DAYS)

    const supabase = createSupabaseAdmin()
    const { forecast, summary: forecastSummary, context } = await loadInventoryForecast(supabase, studyId, daysAhead)

    const { data: kitRows, error: kitError } = await supabase
      .from('lab_kits')
      .select('id, accession_number, kit_type_id, kit_type, status, expiration_date, updated_at, created_at')
      .eq('study_id', studyId)

    if (kitError) {
      logger.error('forecast-alerts: failed to load lab kits', kitError, { studyId })
      return NextResponse.json({ error: 'Failed to load lab kit data' }, { status: 500 })
    }

    const kitTypeNames = context.kitTypeNames || {}
    const kits = (kitRows || []) as LabKitRecord[]

    const now = toStartOfDay(new Date())
    const expiryCutoff = new Date(now)
    expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + expiringDays)

    const expiringSoon = kits.filter((kit) => {
      if (kit.status !== 'available' || !kit.expiration_date) return false
      const expiration = new Date(kit.expiration_date)
      if (Number.isNaN(expiration.getTime())) return false
      return expiration >= now && expiration <= expiryCutoff
    })

    const expired = kits.filter((kit) => kit.status === 'expired')

    const pendingAging = kits.filter((kit) => {
      if (kit.status !== 'pending_shipment') return false
      const reference = kit.updated_at ? new Date(kit.updated_at) : kit.created_at ? new Date(kit.created_at) : null
      if (!reference) return false
      return diffInDays(now, reference) >= pendingAgingDays
    })

    const shippedStuck = kits.filter((kit) => {
      if (kit.status !== 'shipped') return false
      const reference = kit.updated_at ? new Date(kit.updated_at) : kit.created_at ? new Date(kit.created_at) : null
      if (!reference) return false
      return diffInDays(now, reference) >= shippedAgingDays
    })

    const supplyDeficit = forecast.filter((item) => {
      const original = item.originalDeficit ?? item.deficit
      const pending = item.pendingOrderQuantity ?? 0
      return original > 0 || pending > 0
    })
    const activeSupplyDeficit = supplyDeficit.filter((item) => item.deficit > 0)

    const lowBuffer = forecast.filter((item) => {
      if (item.deficit > 0) return false
      const buffer = item.kitsAvailable - item.kitsRequired
      return buffer <= 2
    })

    const serializeSupplyDeficit = (item: ForecastItem) => ({
      key: item.key,
      kitTypeId: item.kitTypeId,
      kitTypeName: item.kitTypeName,
      deficit: item.deficit,
      originalDeficit: item.originalDeficit,
      pendingOrderQuantity: item.pendingOrderQuantity,
      pendingOrders: item.pendingOrders.slice(0, 5).map((order) => ({
        id: order.id,
        quantity: order.quantity,
        vendor: order.vendor,
        expectedArrival: order.expectedArrival,
        status: order.status,
        isOverdue: order.isOverdue,
        createdAt: order.createdAt
      })),
      kitsAvailable: item.kitsAvailable,
      kitsRequired: item.kitsRequired,
      requiredWithBuffer: item.requiredWithBuffer,
      bufferKitsNeeded: item.bufferKitsNeeded,
      optional: item.optional,
      status: item.status
    })

    const serializeKit = (kit: LabKitRecord) => {
      const reference = kit.updated_at ? new Date(kit.updated_at) : kit.created_at ? new Date(kit.created_at) : null
      return {
        id: kit.id,
        accessionNumber: kit.accession_number,
        kitTypeId: kit.kit_type_id,
        kitTypeName: resolveKitTypeName(kit, kitTypeNames),
        status: kit.status,
        expirationDate: kit.expiration_date,
        updatedAt: kit.updated_at,
        createdAt: kit.created_at,
        daysInStatus: reference ? diffInDays(now, reference) : null,
        daysUntilExpiration: kit.expiration_date ? diffInDays(new Date(kit.expiration_date), now) * -1 : null
      }
    }

    const serializeLowBuffer = (item: ForecastItem) => ({
      key: item.key,
      kitTypeId: item.kitTypeId,
      kitTypeName: item.kitTypeName,
      buffer: item.kitsAvailable - item.kitsRequired,
      kitsAvailable: item.kitsAvailable,
      kitsRequired: item.kitsRequired,
      requiredWithBuffer: item.requiredWithBuffer,
      pendingOrderQuantity: item.pendingOrderQuantity,
      bufferKitsNeeded: item.bufferKitsNeeded,
      status: item.status
    })

    const applyLimit = <T,>(items: T[]) => ({
      total: items.length,
      items: items.slice(0, limit),
      hasMore: items.length > limit
    })

    const coveredSupplyDeficitCount = supplyDeficit.length - activeSupplyDeficit.length
    const groups = {
      supplyDeficit: {
        severity: activeSupplyDeficit.length > 0 ? ('critical' as const) : ('warning' as const),
        active: activeSupplyDeficit.length,
        total: supplyDeficit.length,
        ...applyLimit(supplyDeficit.map(serializeSupplyDeficit))
      },
      expiringSoon: {
        severity: 'warning' as const,
        ...applyLimit(expiringSoon.map(serializeKit))
      },
      pendingShipment: {
        severity: 'warning' as const,
        ...applyLimit(pendingAging.map(serializeKit))
      },
      shippedWithoutDelivery: {
        severity: 'warning' as const,
        ...applyLimit(shippedStuck.map(serializeKit))
      },
      lowBuffer: {
        severity: 'warning' as const,
        ...applyLimit(lowBuffer.map(serializeLowBuffer))
      },
      expired: {
        severity: 'info' as const,
        ...applyLimit(expired.map(serializeKit))
      }
    }

    const summary = {
      total: activeSupplyDeficit.length + coveredSupplyDeficitCount + expiringSoon.length + pendingAging.length + shippedStuck.length + lowBuffer.length + expired.length,
      bySeverity: {
        critical: activeSupplyDeficit.length,
        warning: coveredSupplyDeficitCount + expiringSoon.length + pendingAging.length + shippedStuck.length + lowBuffer.length,
        info: expired.length
      }
    }

    return NextResponse.json({
      summary,
      groups,
      meta: {
        limit,
        daysAhead,
        expiringDays,
        pendingAgingDays,
        shippedAgingDays
      },
      forecastSummary
    })
  } catch (error) {
    if (error instanceof ForecastServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    logger.error('forecast-alerts: unexpected error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
