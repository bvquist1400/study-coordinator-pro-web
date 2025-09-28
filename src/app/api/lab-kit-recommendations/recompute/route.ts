import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { recomputeLabKitRecommendations } from '@/lib/lab-kits/recommendation-engine'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
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
    const studyId = typeof body.studyId === 'string' ? body.studyId : typeof body.study_id === 'string' ? body.study_id : null
    if (!studyId) {
      return jsonError('studyId is required.', 400)
    }

    const membership = await verifyStudyMembership(studyId, auth.user.id)
    if (!membership.success) {
      return jsonError(membership.error || 'Access denied.', membership.status || 403)
    }

    const daysAheadRaw = body.daysAhead ?? body.days_ahead ?? body.days
    const daysAhead = typeof daysAheadRaw === 'number'
      ? daysAheadRaw
      : typeof daysAheadRaw === 'string'
        ? Number(daysAheadRaw)
        : undefined

    const supabase = createSupabaseAdmin()
    const result = await recomputeLabKitRecommendations(supabase, studyId, {
      daysAhead
    })

    return NextResponse.json(result)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('lab-kit-recommendations:recompute unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}
