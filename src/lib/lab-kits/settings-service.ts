import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Json,
  LabKitSetting,
  LabKitSettingHistoryInsert,
  LabKitSettingInsert,
  Study,
  StudyUpdate
} from '@/types/database'
import logger from '@/lib/logger'

export type SupabaseAdminClient = SupabaseClient<Database>

interface ProfileSummary {
  id: string
  fullName: string | null
  email: string | null
}

export interface LabKitSettingsDefaults {
  id: string | null
  minOnHand: number
  bufferDays: number
  leadTimeDays: number
  autoOrderEnabled: boolean
  notes: string | null
  metadata: Json
  updatedAt: string | null
  updatedBy: ProfileSummary | null
  inventoryBufferDays: number
  inventoryBufferKits: number
}

export interface LabKitSettingsOverride {
  id: string
  kitTypeId: string
  kitTypeName: string | null
  minOnHand: number
  bufferDays: number
  leadTimeDays: number
  autoOrderEnabled: boolean
  notes: string | null
  metadata: Json
  updatedAt: string
  updatedBy: ProfileSummary | null
}

export interface LabKitSettingsSnapshot {
  studyId: string
  defaults: LabKitSettingsDefaults
  overrides: LabKitSettingsOverride[]
  updatedAt: string
  etag: string
}

export interface LabKitSettingsPatch {
  defaults?: Partial<{
    minOnHand: number
    bufferDays: number
    leadTimeDays: number
    autoOrderEnabled: boolean
    notes: string | null
    metadata: Json
    inventoryBufferDays: number
    inventoryBufferKits: number
  }>
  overrides?: Array<{
    id?: string
    kitTypeId: string
    minOnHand?: number
    bufferDays?: number
    leadTimeDays?: number
    autoOrderEnabled?: boolean
    notes?: string | null
    metadata?: Json
  }>
  deleteOverrideIds?: string[]
}

export class LabKitSettingsError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
    this.name = 'LabKitSettingsError'
  }
}

const MAX_BUFFER_DAYS = 180
const MAX_BUFFER_KITS = 500
const MAX_LEAD_TIME_DAYS = 120
const MAX_MIN_ON_HAND = 500

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

function sanitizeInteger(value: unknown, fallback: number, { min = 0, max }: { min?: number; max?: number } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(parsed)) {
    let next = Math.floor(parsed)
    if (Number.isFinite(min)) {
      next = Math.max(next, min)
    }
    if (Number.isFinite(max ?? NaN)) {
      next = Math.min(next, max as number)
    }
    return next
  }
  return fallback
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return fallback
}

function sanitizeMetadata(value: unknown): Json {
  if (value === undefined) return {} as Json
  if (!isJsonValue(value)) {
    throw new LabKitSettingsError('Metadata must be valid JSON.')
  }
  return value as Json
}

async function loadProfileSummaries(supabase: SupabaseAdminClient, userIds: string[]): Promise<Map<string, ProfileSummary>> {
  if (userIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  if (error) {
    logger.warn('lab-kit-settings: failed to load profile summaries', { error, userIds })
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

function computeEtag(source: { studyId: string; studyUpdatedAt: string | null; settings: Pick<LabKitSetting, 'id' | 'updated_at'>[] }) {
  const hash = createHash('sha256')
  hash.update(source.studyId)
  hash.update('|')
  hash.update(source.studyUpdatedAt ?? '0')
  for (const row of source.settings.sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update('|')
    hash.update(row.id)
    hash.update(':')
    hash.update(row.updated_at ?? '0')
  }
  return hash.digest('hex')
}

function mapProfile(profileMap: Map<string, ProfileSummary>, userId: string | null): ProfileSummary | null {
  if (!userId) return null
  return profileMap.get(userId) ?? null
}

export async function fetchLabKitSettings(
  supabase: SupabaseAdminClient,
  studyId: string
): Promise<LabKitSettingsSnapshot> {
  const { data: studyRow, error: studyError } = await supabase
    .from('studies')
    .select('id, inventory_buffer_days, inventory_buffer_kits, updated_at')
    .eq('id', studyId)
    .single<Pick<Study, 'id' | 'inventory_buffer_days' | 'inventory_buffer_kits' | 'updated_at'>>()

  if (studyError || !studyRow) {
    logger.error('lab-kit-settings: failed to load study', { studyId, error: studyError })
    throw new LabKitSettingsError('Unable to load study settings.', 500)
  }

  const { data: settingsRows, error: settingsError } = await supabase
    .from('lab_kit_settings')
    .select('id, study_id, kit_type_id, min_on_hand, buffer_days, lead_time_days, auto_order_enabled, notes, metadata, updated_by, created_at, updated_at')
    .eq('study_id', studyId)

  if (settingsError) {
    logger.error('lab-kit-settings: failed to load settings rows', { studyId, error: settingsError })
    throw new LabKitSettingsError('Unable to load lab kit settings.', 500)
  }

  const rows = (settingsRows ?? []) as LabKitSetting[]

  const { data: kitTypes, error: kitTypeError } = await supabase
    .from('study_kit_types')
    .select('id, name')
    .eq('study_id', studyId)

  if (kitTypeError) {
    logger.warn('lab-kit-settings: failed to load kit type metadata', { studyId, error: kitTypeError })
  }

  const kitTypeMap = new Map<string, string | null>()
  for (const row of kitTypes ?? []) {
    const id = (row as any)?.id
    if (typeof id === 'string') {
      kitTypeMap.set(id, (row as any)?.name ?? null)
    }
  }

  const userIds = Array.from(new Set(rows.map((row) => row.updated_by).filter((value): value is string => typeof value === 'string')))
  const profileMap = await loadProfileSummaries(supabase, userIds)

  const defaultRow = rows.find((row) => row.kit_type_id === null) || null
  const overrides = rows.filter((row) => row.kit_type_id !== null)

  const defaults: LabKitSettingsDefaults = {
    id: defaultRow?.id ?? null,
    minOnHand: defaultRow?.min_on_hand ?? 0,
    bufferDays: defaultRow?.buffer_days ?? 0,
    leadTimeDays: defaultRow?.lead_time_days ?? 0,
    autoOrderEnabled: defaultRow?.auto_order_enabled ?? false,
    notes: defaultRow?.notes ?? null,
    metadata: (defaultRow?.metadata as Json) ?? ({} as Json),
    updatedAt: defaultRow?.updated_at ?? null,
    updatedBy: mapProfile(profileMap, defaultRow?.updated_by ?? null),
    inventoryBufferDays: studyRow.inventory_buffer_days ?? 0,
    inventoryBufferKits: studyRow.inventory_buffer_kits ?? 0
  }

  const overridesSerialized: LabKitSettingsOverride[] = overrides
    .map((row) => ({
      id: row.id,
      kitTypeId: row.kit_type_id as string,
      kitTypeName: kitTypeMap.get(row.kit_type_id as string) ?? null,
      minOnHand: row.min_on_hand,
      bufferDays: row.buffer_days,
      leadTimeDays: row.lead_time_days,
      autoOrderEnabled: row.auto_order_enabled,
      notes: row.notes ?? null,
      metadata: (row.metadata as Json) ?? ({} as Json),
      updatedAt: row.updated_at,
      updatedBy: mapProfile(profileMap, row.updated_by ?? null)
    }))
    .sort((a, b) => a.kitTypeName?.localeCompare(b.kitTypeName ?? '') ?? 0)

  const mostRecentSetting = rows.reduce<string | null>((latest, row) => {
    if (!latest) return row.updated_at
    return latest > row.updated_at ? latest : row.updated_at
  }, null)

  const updatedAt = [studyRow.updated_at ?? null, mostRecentSetting].filter(Boolean).sort().pop() ?? new Date().toISOString()

  const etag = computeEtag({
    studyId,
    studyUpdatedAt: studyRow.updated_at ?? null,
    settings: rows.map((row) => ({ id: row.id, updated_at: row.updated_at }))
  })

  return {
    studyId,
    defaults,
    overrides: overridesSerialized,
    updatedAt,
    etag
  }
}

function buildHistoryEntry(params: {
  action: 'create' | 'update' | 'delete'
  studyId: string
  userId: string
  settingsId: string | null
  kitTypeId: string | null
  changes: Json
}): LabKitSettingHistoryInsert {
  return {
    action: params.action,
    study_id: params.studyId,
    settings_id: params.settingsId,
    kit_type_id: params.kitTypeId,
    changed_by: params.userId,
    changes: params.changes
  }
}

export async function applyLabKitSettingsPatch(
  supabase: SupabaseAdminClient,
  studyId: string,
  userId: string,
  patch: LabKitSettingsPatch
): Promise<LabKitSettingsSnapshot> {
  const { defaults, overrides = [], deleteOverrideIds = [] } = patch

  const { data: existingRows, error: existingError } = await supabase
    .from('lab_kit_settings')
    .select('id, study_id, kit_type_id, min_on_hand, buffer_days, lead_time_days, auto_order_enabled, notes, metadata, updated_by, created_at, updated_at')
    .eq('study_id', studyId)

  if (existingError) {
    logger.error('lab-kit-settings: failed to load existing settings before patch', { studyId, error: existingError })
    throw new LabKitSettingsError('Unable to modify lab kit settings.', 500)
  }

  const existing = new Map<string, LabKitSetting>()
  let defaultRow: LabKitSetting | null = null
  for (const row of (existingRows ?? []) as LabKitSetting[]) {
    existing.set(row.id, row)
    if (row.kit_type_id === null) {
      defaultRow = row
    }
  }

  const history: LabKitSettingHistoryInsert[] = []

  if (defaults) {
    const sanitizedDefaults = {
      min_on_hand: sanitizeInteger(defaults.minOnHand, defaultRow?.min_on_hand ?? 0, { min: 0, max: MAX_MIN_ON_HAND }),
      buffer_days: sanitizeInteger(defaults.bufferDays, defaultRow?.buffer_days ?? 0, { min: 0, max: MAX_BUFFER_DAYS }),
      lead_time_days: sanitizeInteger(defaults.leadTimeDays, defaultRow?.lead_time_days ?? 0, { min: 0, max: MAX_LEAD_TIME_DAYS }),
      auto_order_enabled: sanitizeBoolean(defaults.autoOrderEnabled, defaultRow?.auto_order_enabled ?? false),
      notes: defaults.notes === undefined ? defaultRow?.notes ?? null : (defaults.notes ?? null),
      metadata: defaults.metadata === undefined ? (defaultRow?.metadata as Json) ?? ({} as Json) : sanitizeMetadata(defaults.metadata)
    }

    const studyUpdate: Partial<Study> = {}
    if (defaults.inventoryBufferDays !== undefined) {
      studyUpdate.inventory_buffer_days = sanitizeInteger(defaults.inventoryBufferDays, 0, { min: 0, max: MAX_BUFFER_DAYS })
    }
    if (defaults.inventoryBufferKits !== undefined) {
      studyUpdate.inventory_buffer_kits = sanitizeInteger(defaults.inventoryBufferKits, 0, { min: 0, max: MAX_BUFFER_KITS })
    }

    if (Object.keys(studyUpdate).length > 0) {
    const { error: studyUpdateError } = await (supabase
      .from('studies') as any)
      .update(studyUpdate as StudyUpdate)
      .eq('id', studyId)

      if (studyUpdateError) {
        logger.error('lab-kit-settings: failed to update study defaults', { studyId, error: studyUpdateError })
        throw new LabKitSettingsError('Unable to update study defaults.', 500)
      }
    }

    if (defaultRow) {
      const { data: updatedRowsRaw, error: updateError } = await (supabase
        .from('lab_kit_settings') as any)
        .update({
          ...sanitizedDefaults,
          updated_by: userId
        })
        .eq('id', defaultRow.id)
        .eq('study_id', studyId)
        .is('kit_type_id', null)
        .select('*')
        .single()

      if (updateError || !updatedRowsRaw) {
        logger.error('lab-kit-settings: failed to update default settings row', { studyId, error: updateError })
        throw new LabKitSettingsError('Unable to update default lab kit settings.', 500)
      }

      const updatedRows = updatedRowsRaw as LabKitSetting

      history.push(
        buildHistoryEntry({
          action: 'update',
          studyId,
          userId,
          settingsId: updatedRows.id,
          kitTypeId: null,
          changes: {
            before: defaultRow,
            after: updatedRows
          } as Json
        })
      )

      existing.set(updatedRows.id, updatedRows)
      defaultRow = updatedRows
    } else {
      const insertPayload: LabKitSettingInsert = {
        study_id: studyId,
        kit_type_id: null,
        ...sanitizedDefaults,
        updated_by: userId
      }

      const { data: insertedRowsRaw, error: insertError } = await (supabase
        .from('lab_kit_settings') as any)
        .insert(insertPayload)
        .select('*')
        .single()

      if (insertError || !insertedRowsRaw) {
        logger.error('lab-kit-settings: failed to create default settings row', { studyId, error: insertError })
        throw new LabKitSettingsError('Unable to create default lab kit settings.', 500)
      }

      const insertedRows = insertedRowsRaw as LabKitSetting

      history.push(
        buildHistoryEntry({
          action: 'create',
          studyId,
          userId,
          settingsId: insertedRows.id,
          kitTypeId: null,
          changes: { after: insertedRows } as Json
        })
      )

      existing.set(insertedRows.id, insertedRows)
      defaultRow = insertedRows
    }
  }

  for (const override of overrides) {
    const kitTypeId = typeof override.kitTypeId === 'string' && override.kitTypeId.trim().length > 0 ? override.kitTypeId : null
    if (!kitTypeId) {
      throw new LabKitSettingsError('kitTypeId is required for overrides.')
    }

    const sanitized = {
      min_on_hand: sanitizeInteger(override.minOnHand, 0, { min: 0, max: MAX_MIN_ON_HAND }),
      buffer_days: sanitizeInteger(override.bufferDays, 0, { min: 0, max: MAX_BUFFER_DAYS }),
      lead_time_days: sanitizeInteger(override.leadTimeDays, 0, { min: 0, max: MAX_LEAD_TIME_DAYS }),
      auto_order_enabled: sanitizeBoolean(override.autoOrderEnabled, false),
      notes: override.notes === undefined ? null : override.notes,
      metadata: override.metadata === undefined ? ({} as Json) : sanitizeMetadata(override.metadata)
    }

    if (override.id) {
      const existingRow = existing.get(override.id)
      if (!existingRow || existingRow.study_id !== studyId || existingRow.kit_type_id === null) {
        throw new LabKitSettingsError('Override not found for this study.', 404)
      }

      const payload = {
        ...sanitized,
        notes: override.notes === undefined ? existingRow.notes ?? null : override.notes ?? null,
        metadata: override.metadata === undefined ? existingRow.metadata : sanitized.metadata,
        updated_by: userId,
        kit_type_id: kitTypeId
      }

      const { data: updatedRowsRaw, error: updateError } = await (supabase
        .from('lab_kit_settings') as any)
        .update(payload)
        .eq('id', override.id)
        .eq('study_id', studyId)
        .select('*')
        .single()

      if (updateError || !updatedRowsRaw) {
        logger.error('lab-kit-settings: failed to update override', { studyId, overrideId: override.id, error: updateError })
        throw new LabKitSettingsError('Unable to update lab kit override.', 500)
      }

      const updatedRows = updatedRowsRaw as LabKitSetting

      history.push(
        buildHistoryEntry({
          action: 'update',
          studyId,
          userId,
          settingsId: updatedRows.id,
          kitTypeId: kitTypeId,
          changes: {
            before: existingRow,
            after: updatedRows
          } as Json
        })
      )

      existing.set(updatedRows.id, updatedRows)
    } else {
      const insertPayload: LabKitSettingInsert = {
        study_id: studyId,
        kit_type_id: kitTypeId,
        ...sanitized,
        notes: sanitized.notes,
        metadata: sanitized.metadata,
        updated_by: userId
      }

      const { data: insertedRowsRaw, error: insertError } = await (supabase
        .from('lab_kit_settings') as any)
        .insert(insertPayload)
        .select('*')
        .single()

      if (insertError || !insertedRowsRaw) {
        logger.error('lab-kit-settings: failed to create override', { studyId, kitTypeId, error: insertError })
        throw new LabKitSettingsError('Unable to create lab kit override.', 500)
      }

      const insertedRows = insertedRowsRaw as LabKitSetting

      history.push(
        buildHistoryEntry({
          action: 'create',
          studyId,
          userId,
          settingsId: insertedRows.id,
          kitTypeId,
          changes: { after: insertedRows } as Json
        })
      )

      existing.set(insertedRows.id, insertedRows)
    }
  }

  for (const overrideId of deleteOverrideIds) {
    if (!overrideId) continue
    const existingRow = existing.get(overrideId)
    if (!existingRow || existingRow.kit_type_id === null) {
      continue
    }

    const { data: deletedRows, error: deleteError } = await supabase
      .from('lab_kit_settings')
      .delete()
      .eq('id', overrideId)
      .eq('study_id', studyId)
      .select('*')
      .single<LabKitSetting>()

    if (deleteError) {
      logger.error('lab-kit-settings: failed to delete override', { studyId, overrideId, error: deleteError })
      throw new LabKitSettingsError('Unable to delete lab kit override.', 500)
    }

    if (deletedRows) {
      history.push(
        buildHistoryEntry({
          action: 'delete',
          studyId,
          userId,
          settingsId: deletedRows.id,
          kitTypeId: deletedRows.kit_type_id ?? null,
          changes: { before: deletedRows } as Json
        })
      )
    }
  }

  if (history.length > 0) {
    const { error: historyError } = await (supabase
      .from('lab_kit_settings_history') as any)
      .insert(history as LabKitSettingHistoryInsert[])
    if (historyError) {
      logger.warn('lab-kit-settings: failed to record history entries', { studyId, error: historyError })
    }
  }

  return fetchLabKitSettings(supabase, studyId)
}
