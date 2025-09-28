import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Json,
  LabKitRecommendation,
  LabKitRecommendationInsert,
  LabKitRecommendationUpdate,
  LabKitSetting
} from '@/types/database'
import logger from '@/lib/logger'
import { loadInventoryForecast } from '@/lib/lab-kits/forecast-service'

export type SupabaseAdminClient = SupabaseClient<Database>

interface StudySettingsRow {
  inventory_buffer_kits: number | null
}

interface OverrideSettings {
  minOnHand: number
  bufferDays: number
  leadTimeDays: number
  autoOrderEnabled: boolean
}

interface LoadedSettings {
  defaults: OverrideSettings
  overrides: Map<string, OverrideSettings>
  inventoryBufferKits: number
}

interface RecommendationCandidate {
  key: string
  kitTypeId: string
  reason: string
  reasonType: 'deficit' | 'buffer'
  recommendedQuantity: number
  windowStart: string | null
  windowEnd: string | null
  latestOrderDate: string | null
  confidence: number
  metadata: Json
}

interface RecomputeOptions {
  daysAhead?: number
}

interface RecomputeResult {
  studyId: string
  created: number
  updated: number
  expired: number
  recommendations: LabKitRecommendation[]
}

function getNumber(value: unknown, fallback = 0, { min = 0, max }: { min?: number; max?: number } = {}) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  let next = numeric
  if (Number.isFinite(min)) {
    next = Math.max(next, min)
  }
  if (Number.isFinite(max ?? NaN)) {
    next = Math.min(next, max as number)
  }
  return next
}

function safeMetadataStringify(value: Json): string {
  try {
    return JSON.stringify(value)
  } catch (error) {
    logger.warn('recommendation-engine: failed to stringify metadata snapshot', { error })
    return '{}'
  }
}

function extractReasonType(metadata: Json): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }
  const maybe = (metadata as Record<string, unknown>).reasonType
  return typeof maybe === 'string' ? maybe : null
}

async function loadSettings(supabase: SupabaseAdminClient, studyId: string): Promise<LoadedSettings> {
  const [{ data: settingRows, error: settingsError }, { data: studyRow, error: studyError }] = await Promise.all([
    supabase
      .from('lab_kit_settings')
      .select('kit_type_id, min_on_hand, buffer_days, lead_time_days, auto_order_enabled')
      .eq('study_id', studyId),
    supabase
      .from('studies')
      .select('inventory_buffer_kits')
      .eq('id', studyId)
      .single<StudySettingsRow>()
  ])

  if (settingsError) {
    logger.error('recommendation-engine: failed to load lab kit settings', settingsError, { studyId })
    throw settingsError
  }
  if (studyError) {
    logger.error('recommendation-engine: failed to load study buffer kits', studyError, { studyId })
    throw studyError
  }

  const rows = (settingRows as LabKitSetting[] | null | undefined) ?? []
  const defaultsRow = rows.find((row) => row.kit_type_id === null) ?? null
  const defaults: OverrideSettings = {
    minOnHand: getNumber(defaultsRow?.min_on_hand, 0, { min: 0, max: 500 }),
    bufferDays: getNumber(defaultsRow?.buffer_days, 0, { min: 0, max: 180 }),
    leadTimeDays: getNumber(defaultsRow?.lead_time_days, 0, { min: 0, max: 120 }),
    autoOrderEnabled: Boolean(defaultsRow?.auto_order_enabled ?? true)
  }

  const overrides = new Map<string, OverrideSettings>()
  for (const row of rows) {
    if (!row.kit_type_id) continue
    overrides.set(row.kit_type_id, {
      minOnHand: getNumber(row.min_on_hand, defaults.minOnHand, { min: 0, max: 500 }),
      bufferDays: getNumber(row.buffer_days, defaults.bufferDays, { min: 0, max: 180 }),
      leadTimeDays: getNumber(row.lead_time_days, defaults.leadTimeDays, { min: 0, max: 120 }),
      autoOrderEnabled: row.auto_order_enabled ?? defaults.autoOrderEnabled
    })
  }

  return {
    defaults,
    overrides,
    inventoryBufferKits: getNumber(studyRow?.inventory_buffer_kits, 0, { min: 0, max: 500 })
  }
}

function determineLeadTimeDate(baseDateISO: string | null, leadTimeDays: number, todayISO: string): string | null {
  if (!baseDateISO) return null
  const base = new Date(baseDateISO)
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() - Math.max(0, Math.floor(leadTimeDays)))
  const iso = base.toISOString().slice(0, 10)
  return iso < todayISO ? todayISO : iso
}

function buildCandidates(params: {
  forecast: Awaited<ReturnType<typeof loadInventoryForecast>>['forecast']
  context: Awaited<ReturnType<typeof loadInventoryForecast>>['context']
  settings: LoadedSettings
}): RecommendationCandidate[] {
  const { forecast, context, settings } = params
  const todayISO = context.todayISO
  const candidates: RecommendationCandidate[] = []

  const defaults = settings.defaults

  for (const item of forecast) {
    if (!item.kitTypeId) {
      continue
    }

    const override = settings.overrides.get(item.kitTypeId) ?? null
    const minOnHand = override?.minOnHand ?? defaults.minOnHand
    const bufferDays = override?.bufferDays ?? defaults.bufferDays ?? context.inventoryBufferDays
    const leadTimeDays = override?.leadTimeDays ?? defaults.leadTimeDays ?? 0

    const perDayDemand = item.kitsRequired > 0 && context.effectiveDaysAhead > 0
      ? item.kitsRequired / Math.max(1, context.effectiveDaysAhead)
      : 0

    const bufferFromDays = Math.ceil(perDayDemand * bufferDays)
    const targetBuffer = Math.max(bufferFromDays, minOnHand, settings.inventoryBufferKits, item.bufferKitsNeeded)

    const effectiveAvailable = item.kitsAvailable + item.pendingOrderQuantity
    const targetTotal = item.kitsRequired + targetBuffer
    const rawQuantity = targetTotal - effectiveAvailable
    const recommendedQuantity = Math.max(0, Math.ceil(rawQuantity))

    if (recommendedQuantity <= 0) {
      continue
    }

    const earliestVisit = item.upcomingVisits.length > 0 ? item.upcomingVisits[0].visit_date : null
    const lastVisit = item.upcomingVisits.length > 0 ? item.upcomingVisits[item.upcomingVisits.length - 1].visit_date : null

    const reasonType: RecommendationCandidate['reasonType'] = item.deficit > 0 ? 'deficit' : 'buffer'
    const reasonBase = reasonType === 'deficit'
      ? `Forecast deficit of ${item.deficit} kit${item.deficit === 1 ? '' : 's'} within ${context.effectiveDaysAhead} days.`
      : `Maintain buffer of ${targetBuffer} kit${targetBuffer === 1 ? '' : 's'} within ${context.effectiveDaysAhead} days.`
    const expiringNote = item.kitsExpiringSoon > 0
      ? ` ${item.kitsExpiringSoon} kit${item.kitsExpiringSoon === 1 ? '' : 's'} expire soon.`
      : ''
    const pendingNote = item.pendingOrderQuantity > 0
      ? ` Pending orders cover ${item.pendingOrderQuantity}.`
      : ''
    const reason = `${reasonBase}${expiringNote}${pendingNote}`.trim()

    const latestOrderDate = determineLeadTimeDate(earliestVisit, leadTimeDays, todayISO)

    const metadata = {
      reasonType,
      generatedAt: new Date().toISOString(),
      forecast: {
        kitsRequired: item.kitsRequired,
        kitsAvailable: item.kitsAvailable,
        pendingOrderQuantity: item.pendingOrderQuantity,
        kitsExpiringSoon: item.kitsExpiringSoon,
        bufferTarget: targetBuffer,
        perDayDemand,
        bufferDays,
        minOnHand,
        inventoryBufferKits: settings.inventoryBufferKits,
        leadTimeDays,
        autoOrderEnabled: override?.autoOrderEnabled ?? defaults.autoOrderEnabled
      }
    } satisfies Json

    candidates.push({
      key: `${item.kitTypeId}|${reasonType}`,
      kitTypeId: item.kitTypeId,
      reason,
      reasonType,
      recommendedQuantity,
      windowStart: earliestVisit,
      windowEnd: lastVisit,
      latestOrderDate,
      confidence: reasonType === 'deficit' ? 0.9 : 0.65,
      metadata
    })
  }

  return candidates
}

export async function recomputeLabKitRecommendations(
  supabase: SupabaseAdminClient,
  studyId: string,
  options: RecomputeOptions = {}
): Promise<RecomputeResult> {
  const daysAhead = Number.isFinite(options.daysAhead ?? NaN) ? Math.max(1, Math.min(180, Math.floor(options.daysAhead!))) : 45

  const { forecast, context } = await loadInventoryForecast(supabase, studyId, daysAhead)
  const settings = await loadSettings(supabase, studyId)

  const candidates = buildCandidates({ forecast, context, settings })

  const { data: existingRows, error: existingError } = await supabase
    .from('lab_kit_recommendations')
    .select('*')
    .eq('study_id', studyId)

  if (existingError) {
    logger.error('recommendation-engine: failed to load existing recommendations', existingError, { studyId })
    throw existingError
  }

  const existingNew = new Map<string, LabKitRecommendation>()
  const existingById = new Map<string, LabKitRecommendation>()

  for (const row of (existingRows ?? []) as LabKitRecommendation[]) {
    existingById.set(row.id, row)
    if (row.status !== 'new') continue
    const reasonType = extractReasonType(row.metadata as Json) ?? 'unknown'
    const key = `${row.kit_type_id ?? 'unknown'}|${reasonType}`
    existingNew.set(key, row)
  }

  const seenKeys = new Set<string>()
  let created = 0
  let updated = 0

  for (const candidate of candidates) {
    const existing = existingNew.get(candidate.key)
    const payload: LabKitRecommendationInsert = {
      study_id: studyId,
      kit_type_id: candidate.kitTypeId,
      status: 'new',
      recommended_quantity: candidate.recommendedQuantity,
      reason: candidate.reason,
      window_start: candidate.windowStart,
      window_end: candidate.windowEnd,
      latest_order_date: candidate.latestOrderDate,
      confidence: candidate.confidence,
      metadata: candidate.metadata
    }

    if (existing) {
      seenKeys.add(candidate.key)
      const shouldUpdate =
        existing.recommended_quantity !== candidate.recommendedQuantity ||
        existing.reason !== candidate.reason ||
        existing.window_start !== candidate.windowStart ||
        existing.window_end !== candidate.windowEnd ||
        existing.latest_order_date !== candidate.latestOrderDate ||
        existing.confidence !== candidate.confidence ||
        safeMetadataStringify(existing.metadata as Json) !== safeMetadataStringify(candidate.metadata)

      if (shouldUpdate) {
        const updatePayload: LabKitRecommendationUpdate = {
          recommended_quantity: candidate.recommendedQuantity,
          reason: candidate.reason,
          window_start: candidate.windowStart,
          window_end: candidate.windowEnd,
          latest_order_date: candidate.latestOrderDate,
          confidence: candidate.confidence,
          metadata: candidate.metadata
        }
        const { error: updateError } = await (supabase
          .from('lab_kit_recommendations') as any)
          .update(updatePayload)
          .eq('id', existing.id)

        if (updateError) {
          logger.error('recommendation-engine: failed to update recommendation', updateError, { studyId, recommendationId: existing.id })
          throw updateError
        }
        updated += 1
      }

      continue
    }

    const { error: insertError } = await (supabase
      .from('lab_kit_recommendations') as any)
      .insert(payload)

    if (insertError) {
      logger.error('recommendation-engine: failed to insert recommendation', insertError, { studyId, candidate })
      throw insertError
    }
    created += 1
  }

  const expiredIds: string[] = []
  for (const [key, row] of existingNew.entries()) {
    if (seenKeys.has(key)) continue
    expiredIds.push(row.id)
  }

  let expired = 0
  if (expiredIds.length > 0) {
    const { error: expireError } = await (supabase
      .from('lab_kit_recommendations') as any)
      .update({
        status: 'expired',
        dismissed_reason: 'Auto-expired: no longer needed',
        acted_at: new Date().toISOString()
      })
      .in('id', expiredIds)

    if (expireError) {
      logger.error('recommendation-engine: failed to expire recommendations', expireError, { studyId, expiredIds })
      throw expireError
    }
    expired = expiredIds.length
  }

  const refreshed = await loadLatestRecommendations(supabase, studyId)

  logger.info('recommendation-engine: recompute completed', {
    studyId,
    created,
    updated,
    expired
  })

  return {
    studyId,
    created,
    updated,
    expired,
    recommendations: refreshed
  }
}

async function loadLatestRecommendations(supabase: SupabaseAdminClient, studyId: string) {
  const { data, error } = await supabase
    .from('lab_kit_recommendations')
    .select('*')
    .eq('study_id', studyId)

  if (error) {
    logger.error('recommendation-engine: failed to refresh recommendations', error, { studyId })
    throw error
  }

  return (data ?? []) as LabKitRecommendation[]
}
