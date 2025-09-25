import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import {
  LabKitSettingsError,
  applyLabKitSettingsPatch,
  fetchLabKitSettings,
  type LabKitSettingsPatch
} from '@/lib/lab-kits/settings-service'
import type { Json } from '@/types/database'

function jsonError(message: string, status = 400, headers?: Record<string, string>) {
  return NextResponse.json({ error: message }, { status, headers })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateUser(request)
    if (auth.error || !auth.user) {
      return jsonError(auth.error || 'Unauthorized', auth.status || 401)
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId') || searchParams.get('study_id')
    if (!studyId) {
      return jsonError('studyId parameter is required.', 400)
    }

    const membership = await verifyStudyMembership(studyId, auth.user.id)
    if (!membership.success) {
      return jsonError(membership.error || 'Access denied.', membership.status || 403)
    }

    const supabase = createSupabaseAdmin()
    const snapshot = await fetchLabKitSettings(supabase, studyId)

    return NextResponse.json(snapshot, {
      headers: {
        ETag: snapshot.etag
      }
    })
  } catch (error) {
    if (error instanceof LabKitSettingsError) {
      return jsonError(error.message, error.status)
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-settings:GET unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}

function isValidJsonValue(value: unknown): value is Json {
  if (value === null) return true
  const valueType = typeof value
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isValidJsonValue)
  }
  if (valueType === 'object') {
    return Object.values(value as Record<string, unknown>).every(isValidJsonValue)
  }
  return false
}

function coerceNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    throw new LabKitSettingsError(`${field} must be a number.`)
  }
  return numeric
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  throw new LabKitSettingsError('autoOrderEnabled must be a boolean.')
}

function coerceNotes(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  throw new LabKitSettingsError('notes must be a string or null.')
}

function pickFirst(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }
  return undefined
}

function validatePatchBody(body: unknown): LabKitSettingsPatch {
  if (!body || typeof body !== 'object') {
    throw new LabKitSettingsError('Request body must be an object.')
  }

  const patch: LabKitSettingsPatch = {}
  const source = body as Record<string, unknown>

  if (source.defaults !== undefined) {
    if (!source.defaults || typeof source.defaults !== 'object') {
      throw new LabKitSettingsError('defaults must be an object if provided.')
    }
    const defaults = source.defaults as Record<string, unknown>
    const defaultsMetadataRaw = pickFirst(defaults, ['metadata'])
    if (defaultsMetadataRaw !== undefined && !isValidJsonValue(defaultsMetadataRaw)) {
      throw new LabKitSettingsError('defaults.metadata must be valid JSON.')
    }
    patch.defaults = {
      minOnHand: coerceNumber(pickFirst(defaults, ['minOnHand', 'min_on_hand']), 'defaults.minOnHand'),
      bufferDays: coerceNumber(pickFirst(defaults, ['bufferDays', 'buffer_days']), 'defaults.bufferDays'),
      leadTimeDays: coerceNumber(pickFirst(defaults, ['leadTimeDays', 'lead_time_days']), 'defaults.leadTimeDays'),
      autoOrderEnabled: coerceBoolean(pickFirst(defaults, ['autoOrderEnabled', 'auto_order_enabled'])),
      notes: coerceNotes(pickFirst(defaults, ['notes'])),
      metadata: defaultsMetadataRaw as Json | undefined,
      inventoryBufferDays: coerceNumber(pickFirst(defaults, ['inventoryBufferDays', 'inventory_buffer_days']), 'defaults.inventoryBufferDays'),
      inventoryBufferKits: coerceNumber(pickFirst(defaults, ['inventoryBufferKits', 'inventory_buffer_kits']), 'defaults.inventoryBufferKits')
    }
  }

  if (source.overrides !== undefined) {
    if (!Array.isArray(source.overrides)) {
      throw new LabKitSettingsError('overrides must be an array if provided.')
    }
    patch.overrides = source.overrides.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new LabKitSettingsError('Each override must be an object.')
      }
      const override = item as Record<string, unknown>
      const kitTypeId = typeof override.kitTypeId === 'string' ? override.kitTypeId : typeof override.kit_type_id === 'string' ? override.kit_type_id : undefined
      if (!kitTypeId) {
        throw new LabKitSettingsError('override.kitTypeId is required.')
      }
      const metadataRaw = pickFirst(override, ['metadata'])
      if (metadataRaw !== undefined && !isValidJsonValue(metadataRaw)) {
        throw new LabKitSettingsError('override.metadata must be valid JSON.')
      }
      return {
        id: typeof override.id === 'string' ? override.id : undefined,
        kitTypeId,
        minOnHand: coerceNumber(pickFirst(override, ['minOnHand', 'min_on_hand']), 'override.minOnHand'),
        bufferDays: coerceNumber(pickFirst(override, ['bufferDays', 'buffer_days']), 'override.bufferDays'),
        leadTimeDays: coerceNumber(pickFirst(override, ['leadTimeDays', 'lead_time_days']), 'override.leadTimeDays'),
        autoOrderEnabled: coerceBoolean(pickFirst(override, ['autoOrderEnabled', 'auto_order_enabled'])),
        notes: coerceNotes(pickFirst(override, ['notes'])),
        metadata: metadataRaw as Json | undefined
      }
    })
  }

  if (source.deleteOverrideIds !== undefined) {
    if (!Array.isArray(source.deleteOverrideIds)) {
      throw new LabKitSettingsError('deleteOverrideIds must be an array if provided.')
    }
    patch.deleteOverrideIds = source.deleteOverrideIds.filter((value) => typeof value === 'string') as string[]
  }

  return patch
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateUser(request)
    if (auth.error || !auth.user) {
      return jsonError(auth.error || 'Unauthorized', auth.status || 401)
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId') || searchParams.get('study_id')
    if (!studyId) {
      return jsonError('studyId parameter is required.', 400)
    }

    const membership = await verifyStudyMembership(studyId, auth.user.id)
    if (!membership.success) {
      return jsonError(membership.error || 'Access denied.', membership.status || 403)
    }

    const supabase = createSupabaseAdmin()
    const rawBody = await request.json().catch(() => ({}))
    const patchBody = validatePatchBody(rawBody)

    const current = await fetchLabKitSettings(supabase, studyId)
    const etagHeader = request.headers.get('if-match')
    const bodyEtag = typeof (rawBody as any)?.etag === 'string' ? (rawBody as any).etag as string : undefined
    const expectedEtag = etagHeader ?? bodyEtag

    if (expectedEtag && expectedEtag !== current.etag) {
      return jsonError('Settings are out of date. Refresh and try again.', 412, {
        ETag: current.etag
      })
    }

    const updated = await applyLabKitSettingsPatch(supabase, studyId, auth.user.id, patchBody)

    return NextResponse.json(updated, {
      headers: {
        ETag: updated.etag
      }
    })
  } catch (error) {
    if (error instanceof LabKitSettingsError) {
      return jsonError(error.message, error.status)
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-settings:PATCH unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}
