import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import {
  LabKitRecommendationError,
  fetchLabKitRecommendations,
  updateLabKitRecommendationStatus
} from '@/lib/lab-kits/recommendation-service'
import type { Json } from '@/types/database'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function parseStatuses(searchParams: URLSearchParams) {
  const raw = searchParams.getAll('status')
  if (raw.length === 0) {
    const single = searchParams.get('statuses') || searchParams.get('status')
    if (single) {
      raw.push(...single.split(',').map((value) => value.trim()))
    }
  }
  return raw
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is 'new' | 'accepted' | 'dismissed' | 'expired' =>
      value === 'new' || value === 'accepted' || value === 'dismissed' || value === 'expired'
    )
}

function isValidJsonValue(value: unknown): value is Json {
  if (value === null) return true
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return true
  if (Array.isArray(value)) {
    return value.every(isValidJsonValue)
  }
  if (type === 'object') {
    return Object.values(value as Record<string, unknown>).every(isValidJsonValue)
  }
  return false
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

    const statuses = parseStatuses(searchParams)
    const supabase = createSupabaseAdmin()
    const payload = await fetchLabKitRecommendations(supabase, studyId, { statuses })

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof LabKitRecommendationError) {
      return jsonError(error.message, error.status)
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-recommendations:GET unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser(request)
    if (auth.error || !auth.user) {
      return jsonError(auth.error || 'Unauthorized', auth.status || 401)
    }

    const rawBody = await request.json().catch(() => ({}))
    if (!rawBody || typeof rawBody !== 'object') {
      return jsonError('Request body must be an object.', 400)
    }

    const body = rawBody as Record<string, unknown>
    const studyIdRaw = body.studyId ?? body.study_id
    if (typeof studyIdRaw !== 'string' || studyIdRaw.trim().length === 0) {
      return jsonError('studyId is required.', 400)
    }
    const studyId = studyIdRaw.trim()

    const membership = await verifyStudyMembership(studyId, auth.user.id)
    if (!membership.success) {
      return jsonError(membership.error || 'Access denied.', membership.status || 403)
    }

    const recommendationId = typeof body.recommendationId === 'string' ? body.recommendationId.trim() :
      typeof body.recommendation_id === 'string' ? body.recommendation_id.trim() : ''
    if (!recommendationId) {
      return jsonError('recommendationId is required.', 400)
    }

    const actionRaw = typeof body.action === 'string' ? body.action.trim().toLowerCase() : null
    if (actionRaw !== 'accept' && actionRaw !== 'dismiss') {
      return jsonError('action must be either "accept" or "dismiss".', 400)
    }

    const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : undefined
    if (actionRaw === 'dismiss' && (!reasonRaw || reasonRaw.length === 0)) {
      return jsonError('reason is required when dismissing a recommendation.', 400)
    }

    let metadata: Json | undefined
    if (Object.prototype.hasOwnProperty.call(body, 'metadata')) {
      if (!isValidJsonValue(body.metadata)) {
        return jsonError('metadata must be valid JSON.', 400)
      }
      metadata = body.metadata as Json
    }

    const supabase = createSupabaseAdmin()
    const updated = await updateLabKitRecommendationStatus(supabase, studyId, recommendationId, auth.user.id, {
      action: actionRaw,
      reason: reasonRaw,
      metadata
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof LabKitRecommendationError) {
      return jsonError(error.message, error.status)
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-recommendations:POST unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}
