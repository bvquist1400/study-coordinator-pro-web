import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Json,
  LabKitRecommendation
} from '@/types/database'
import logger from '@/lib/logger'

export type SupabaseAdminClient = SupabaseClient<Database>

interface ProfileSummary {
  id: string
  fullName: string | null
  email: string | null
}

export interface LabKitRecommendationItem {
  id: string
  studyId: string
  kitTypeId: string | null
  kitTypeName: string | null
  status: 'new' | 'accepted' | 'dismissed' | 'expired'
  recommendedQuantity: number
  reason: string
  windowStart: string | null
  windowEnd: string | null
  latestOrderDate: string | null
  confidence: number | null
  metadata: Json
  dismissedReason: string | null
  actedBy: ProfileSummary | null
  actedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LabKitRecommendationList {
  studyId: string
  recommendations: LabKitRecommendationItem[]
  counts: Record<'new' | 'accepted' | 'dismissed' | 'expired', number>
}

export class LabKitRecommendationError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
    this.name = 'LabKitRecommendationError'
  }
}

function isJsonValue(value: unknown): value is Json {
  if (value === null) return true
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (t === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue)
  }
  return false
}

async function loadProfiles(supabase: SupabaseAdminClient, userIds: string[]): Promise<Map<string, ProfileSummary>> {
  if (userIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  if (error) {
    logger.warn('lab-kit-recommendations: failed to load profile summaries', { error, userIds })
    return new Map()
  }

  const map = new Map<string, ProfileSummary>()
  for (const row of data ?? []) {
    const id = (row as any)?.id
    if (typeof id === 'string') {
      map.set(id, {
        id,
        fullName: (row as any)?.full_name ?? null,
        email: (row as any)?.email ?? null
      })
    }
  }
  return map
}

function mapProfile(map: Map<string, ProfileSummary>, userId: string | null): ProfileSummary | null {
  if (!userId) return null
  return map.get(userId) ?? null
}

function mergeMetadata(existing: Json, incoming?: Json): Json {
  if (incoming === undefined) return existing
  if (!isJsonValue(incoming)) {
    throw new LabKitRecommendationError('Metadata must be valid JSON.')
  }

  if (typeof existing === 'object' && existing !== null && !Array.isArray(existing) && typeof incoming === 'object' && incoming !== null && !Array.isArray(incoming)) {
    return { ...(existing as Record<string, Json>), ...(incoming as Record<string, Json>) } as Json
  }

  return incoming
}

function serializeRecommendation(
  row: LabKitRecommendation,
  kitTypeName: string | null,
  profileMap: Map<string, ProfileSummary>
): LabKitRecommendationItem {
  return {
    id: row.id,
    studyId: row.study_id,
    kitTypeId: row.kit_type_id,
    kitTypeName,
    status: row.status,
    recommendedQuantity: row.recommended_quantity,
    reason: row.reason,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    latestOrderDate: row.latest_order_date,
    confidence: row.confidence ?? null,
    metadata: (row.metadata as Json) ?? ({} as Json),
    dismissedReason: row.dismissed_reason ?? null,
    actedBy: mapProfile(profileMap, row.acted_by ?? null),
    actedAt: row.acted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function fetchLabKitRecommendations(
  supabase: SupabaseAdminClient,
  studyId: string,
  options: { statuses?: Array<'new' | 'accepted' | 'dismissed' | 'expired'> } = {}
): Promise<LabKitRecommendationList> {
  const query = supabase
    .from('lab_kit_recommendations')
    .select('id, study_id, kit_type_id, status, recommended_quantity, reason, window_start, window_end, latest_order_date, confidence, metadata, dismissed_reason, acted_by, acted_at, created_at, updated_at')
    .eq('study_id', studyId)
    .order('created_at', { ascending: false })

  const statuses = options.statuses?.filter((status) => ['new', 'accepted', 'dismissed', 'expired'].includes(status)) as LabKitRecommendation['status'][] | undefined
  if (statuses && statuses.length > 0) {
    (query as any).in('status', statuses)
  }

  const { data, error } = await query

  if (error) {
    logger.error('lab-kit-recommendations: failed to load recommendations', { studyId, error })
    throw new LabKitRecommendationError('Unable to load lab kit recommendations.', 500)
  }

  const rows = (data ?? []) as LabKitRecommendation[]

  const kitTypeIds = Array.from(new Set(rows.map((row) => row.kit_type_id).filter((value): value is string => typeof value === 'string')))
  const { data: kitTypes, error: kitTypeError } = await supabase
    .from('study_kit_types')
    .select('id, name')
    .in('id', kitTypeIds.length > 0 ? kitTypeIds : ['00000000-0000-0000-0000-000000000000'])

  if (kitTypeError) {
    logger.warn('lab-kit-recommendations: failed to load kit type metadata', { studyId, error: kitTypeError })
  }

  const kitTypeMap = new Map<string, string | null>()
  for (const row of kitTypes ?? []) {
    const id = (row as any)?.id
    if (typeof id === 'string') {
      kitTypeMap.set(id, (row as any)?.name ?? null)
    }
  }

  const userIds = Array.from(new Set(rows.map((row) => row.acted_by).filter((value): value is string => typeof value === 'string')))
  const profileMap = await loadProfiles(supabase, userIds)

  const recommendations = rows.map((row) => serializeRecommendation(row, kitTypeMap.get(row.kit_type_id ?? '') ?? null, profileMap))

  const counts = recommendations.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { new: 0, accepted: 0, dismissed: 0, expired: 0 } as Record<'new' | 'accepted' | 'dismissed' | 'expired', number>
  )

  return {
    studyId,
    recommendations,
    counts
  }
}

export async function updateLabKitRecommendationStatus(
  supabase: SupabaseAdminClient,
  studyId: string,
  recommendationId: string,
  userId: string,
  payload: { action: 'accept' | 'dismiss'; reason?: string; metadata?: Json }
): Promise<LabKitRecommendationItem> {
  const { data: existingRow, error: fetchError } = await supabase
    .from('lab_kit_recommendations')
    .select('*')
    .eq('id', recommendationId)
    .eq('study_id', studyId)
    .single<LabKitRecommendation>()

  if (fetchError || !existingRow) {
    throw new LabKitRecommendationError('Recommendation not found.', 404)
  }

  if (existingRow.status !== 'new' && payload.action === 'dismiss') {
    throw new LabKitRecommendationError('Recommendation already actioned.', 409)
  }

  if (payload.action === 'accept' && existingRow.status === 'accepted') {
    throw new LabKitRecommendationError('Recommendation already accepted.', 409)
  }

  const mergedMetadata = mergeMetadata((existingRow.metadata as Json) ?? ({} as Json), payload.metadata)

  type RecommendationsTable = Database['public']['Tables']['lab_kit_recommendations']
  type RecommendationUpdate = RecommendationsTable['Update']

  let status: RecommendationUpdate['status']
  let dismissedReason: RecommendationUpdate['dismissed_reason']

  if (payload.action === 'accept') {
    status = 'accepted'
    dismissedReason = null
  } else {
    const reason = typeof payload.reason === 'string' && payload.reason.trim().length > 0 ? payload.reason.trim() : null
    if (!reason) {
      throw new LabKitRecommendationError('Dismiss reason is required.', 400)
    }
    status = 'dismissed'
    dismissedReason = reason
  }

  const updatePayload: RecommendationUpdate = {
    acted_by: userId,
    acted_at: new Date().toISOString(),
    metadata: mergedMetadata,
    status,
    dismissed_reason: dismissedReason
  }

  const { data: updatedRow, error: updateError } = await (supabase
    .from('lab_kit_recommendations') as any)
    .update(updatePayload)
    .eq('id', recommendationId)
    .eq('study_id', studyId)
    .select('*')
    .single<LabKitRecommendation>()

  if (updateError || !updatedRow) {
    logger.error('lab-kit-recommendations: failed to update recommendation', { studyId, recommendationId, error: updateError })
    throw new LabKitRecommendationError('Unable to update recommendation status.', 500)
  }

  const profileMap = await loadProfiles(supabase, updatedRow.acted_by ? [updatedRow.acted_by] : [])

  let kitTypeName: string | null = null
  if (updatedRow.kit_type_id) {
    const { data: kitTypeRow, error: kitTypeError } = await supabase
      .from('study_kit_types')
      .select('id, name')
      .eq('id', updatedRow.kit_type_id)
      .single<{ id: string; name: string | null }>()

    if (kitTypeError) {
      logger.warn('lab-kit-recommendations: failed to load kit type name for updated row', { studyId, recommendationId, error: kitTypeError })
    } else if (kitTypeRow) {
      kitTypeName = kitTypeRow.name ?? null
    }
  }

  return serializeRecommendation(updatedRow, kitTypeName, profileMap)
}
