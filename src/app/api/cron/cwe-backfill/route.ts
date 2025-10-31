import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { computeAndStoreWorkloadSnapshots } from '@/lib/workload/snapshots'
import type { StudyMeta } from '@/lib/workload/computeWorkloads'
import { sendCronAlert } from '@/lib/alerts/cron'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: NextRequest) {
  const headerSecret = request.headers.get('x-cron-secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  const providedSecret = headerSecret ?? bearerSecret ?? null

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createSupabaseAdmin()

    const { data: studies, error } = await supabase
      .from('studies')
      .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, meeting_admin_points')

    if (error) {
      logger.error('Failed to load studies for cron backfill', error)
      await sendCronAlert('CWE backfill cron failed while loading studies', {
        error: error?.message ?? 'Unknown error',
        code: (error as any)?.code ?? null
      })
      return NextResponse.json({ error: 'Failed to load studies' }, { status: 500 })
    }

    const studyRows = (studies ?? []) as StudyMeta[]

    if (studyRows.length === 0) {
      return NextResponse.json({ ok: true, message: 'No studies to refresh' })
    }

    const workloads = await computeAndStoreWorkloadSnapshots({
      supabase,
      studyRows,
      ttlMinutes: 30
    })

    return NextResponse.json({
      ok: true,
      refreshed: workloads.length,
      studies: workloads.map((entry) => entry.studyId)
    })
  } catch (error) {
    logger.error('Cron CWE backfill failed', error as any)
    const message = error instanceof Error ? error.message : String(error)
    await sendCronAlert('CWE backfill cron failed', {
      error: message
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
