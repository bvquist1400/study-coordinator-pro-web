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

    const statusParam = searchParams.getAll('status')
    const statuses = statusParam.length > 0 ? (statusParam as Array<'new' | 'accepted' | 'dismissed' | 'expired'>) : undefined

    const supabase = createSupabaseAdmin()
    const list = await fetchLabKitRecommendations(supabase, studyId, { statuses })
    return NextResponse.json(list)
  } catch (error) {
    if (error instanceof LabKitRecommendationError) {
      return jsonError(error.message, error.status)
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-recommendations:GET unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}

interface RecommendationActionBody {
  id?: string
  action?: 'accept' | 'dismiss'
  reason?: string | null
  metadata?: Json
  refresh?: boolean
}

function validateActionBody(body: unknown): RecommendationActionBody {
  if (!body || typeof body !== 'object') {
    throw new LabKitRecommendationError('Request body must be an object.')
  }
  const source = body as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id : undefined
  const action = source.action === 'accept' || source.action === 'dismiss' ? (source.action as 'accept' | 'dismiss') : undefined
  if (!id) {
    throw new LabKitRecommendationError('id is required.')
  }
  if (!action) {
    throw new LabKitRecommendationError('action must be "accept" or "dismiss".')
  }

  const reason = typeof source.reason === 'string' ? source.reason : undefined
  const metadata = source.metadata as Json | undefined
  const refresh = source.refresh === true

  return { id, action, reason: reason ?? null, metadata, refresh }
}

export async function POST(request: NextRequest) {
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

    const body = validateActionBody(await request.json().catch(() => ({})))
    const supabase = createSupabaseAdmin()

    const updated = await updateLabKitRecommendationStatus(
      supabase,
      studyId,
      body.id!,
      auth.user.id,
      {
        action: body.action!,
        reason: body.reason ?? undefined,
        metadata: body.metadata
      }
    )

    const response: Record<string, unknown> = {
      recommendation: updated
    }

    if (body.refresh) {
      const list = await fetchLabKitRecommendations(supabase, studyId)
      response.recommendations = list.recommendations
      response.counts = list.counts
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof LabKitRecommendationError) {
      return jsonError(error.message, error.status)
    }
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-recommendations:POST unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}
