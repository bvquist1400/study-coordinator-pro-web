import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { recomputeLabKitRecommendations } from '@/lib/lab-kits/recommendation-engine'

const DEFAULT_STATUSES = ['enrolling', 'active'] as const

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function normalizeStudyStatuses(input: unknown): string[] {
  if (!input) return [...DEFAULT_STATUSES]
  if (Array.isArray(input)) {
    const filtered = input.filter((value) => typeof value === 'string' && value.trim().length > 0)
    return filtered.length > 0 ? filtered : [...DEFAULT_STATUSES]
  }
  if (typeof input === 'string') {
    const parts = input.split(',').map((value) => value.trim()).filter(Boolean)
    return parts.length > 0 ? parts : [...DEFAULT_STATUSES]
  }
  return [...DEFAULT_STATUSES]
}

export async function POST(request: NextRequest) {
  try {
    const jobToken = process.env.LAB_KIT_RECOMMENDATION_JOB_TOKEN
    if (!jobToken) {
      logger.error('recompute-all: missing LAB_KIT_RECOMMENDATION_JOB_TOKEN environment variable')
      return jsonError('Server misconfigured.', 500)
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${jobToken}`) {
      return jsonError('Unauthorized', 401)
    }

    const rawBody = await request.json().catch(() => ({}))
    const body = (rawBody && typeof rawBody === 'object') ? rawBody as Record<string, unknown> : {}

    const daysAheadRaw = body.daysAhead ?? body.days_ahead ?? body.days
    const daysAhead = typeof daysAheadRaw === 'number'
      ? daysAheadRaw
      : typeof daysAheadRaw === 'string'
        ? Number(daysAheadRaw)
        : undefined

    const statusFilter = normalizeStudyStatuses(body.studyStatuses ?? body.study_statuses ?? body.status)

    const supabase = createSupabaseAdmin()

    const { data: studyRows, error: studiesError } = await supabase
      .from('studies')
      .select('id, status')
      .in('status', statusFilter)

    if (studiesError || !Array.isArray(studyRows)) {
      logger.error('recompute-all: failed to load studies', studiesError, { statusFilter })
      return jsonError('Failed to load studies.', 500)
    }

    const studies = (studyRows as Array<{ id: string | null; status: string | null }>).
      filter((row) => typeof row.id === 'string')
      .map((row) => ({ id: row.id as string, status: row.status ?? null }))

    const results: Array<{
      studyId: string
      status: string
      created?: number
      updated?: number
      expired?: number
      error?: string
    }> = []

    let processed = 0
    let failures = 0
    let totalCreated = 0
    let totalUpdated = 0
    let totalExpired = 0

    for (const study of studies) {
      if (!study?.id) continue
      processed += 1
      try {
        const outcome = await recomputeLabKitRecommendations(supabase, study.id, {
          daysAhead
        })
        totalCreated += outcome.created
        totalUpdated += outcome.updated
        totalExpired += outcome.expired
        results.push({
          studyId: study.id,
          status: 'ok',
          created: outcome.created,
          updated: outcome.updated,
          expired: outcome.expired
        })
      } catch (error) {
        failures += 1
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error('recompute-all: failed to recompute study', err, { studyId: study.id })
        results.push({
          studyId: study.id,
          status: 'error',
          error: err.message
        })
      }
    }

    return NextResponse.json({
      processed,
      failures,
      totals: {
        created: totalCreated,
        updated: totalUpdated,
        expired: totalExpired
      },
      results
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('recompute-all: unexpected error', err)
    return jsonError('Internal server error', 500)
  }
}
