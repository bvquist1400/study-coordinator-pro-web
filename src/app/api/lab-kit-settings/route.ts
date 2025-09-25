import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import {
  LabKitSettingsError,
  applyLabKitSettingsPatch,
  fetchLabKitSettings,
  type LabKitSettingsPatch
} from '@/lib/lab-kits/settings-service'

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
    patch.defaults = source.defaults as LabKitSettingsPatch['defaults']
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
      return {
        id: typeof override.id === 'string' ? override.id : undefined,
        kitTypeId,
        minOnHand: override.minOnHand ?? override.min_on_hand,
        bufferDays: override.bufferDays ?? override.buffer_days,
        leadTimeDays: override.leadTimeDays ?? override.lead_time_days,
        autoOrderEnabled: override.autoOrderEnabled ?? override.auto_order_enabled,
        notes: override.notes === undefined ? undefined : (override.notes ?? null),
        metadata: override.metadata as LabKitSettingsPatch['overrides'][number]['metadata']
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
