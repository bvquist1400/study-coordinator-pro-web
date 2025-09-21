import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin, verifyStudyMembership } from '@/lib/api/auth'
import logger from '@/lib/logger'

interface VisitScheduleHistoryRow {
  visit_id: string
  old_date: string | null
  new_date: string | null
  reason: string | null
  changed_at: string | null
}

interface VisitSummary {
  id: string
  study_id: string
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const supabase = createSupabaseAdmin()
    const { visit_ids: visitIds } = await request.json().catch(() => ({ visit_ids: [] as string[] })) as { visit_ids: string[] }

    if (!Array.isArray(visitIds) || visitIds.length === 0) {
      return NextResponse.json({ history: [] })
    }

    const { data: visitSummaries, error: visitLookupError } = await supabase
      .from('subject_visits')
      .select('id, study_id')
      .in('id', visitIds)

    if (visitLookupError) {
      logger.error('Failed to lookup visits for reschedule history', visitLookupError)
      return NextResponse.json({ error: 'Failed to lookup visit permissions' }, { status: 500 })
    }

    const visits = (visitSummaries || []) as VisitSummary[]
    if (visits.length === 0) {
      return NextResponse.json({ history: [] })
    }

    const uniqueStudyIds = Array.from(new Set(visits.map(v => v.study_id).filter(Boolean)))

    for (const studyId of uniqueStudyIds) {
      const membership = await verifyStudyMembership(studyId, user.id)
      if (!membership.success) {
        return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
      }
    }

    const { data: historyRows, error: historyError } = await supabase
      .from('visit_schedule_history')
      .select('visit_id, old_date, new_date, reason, changed_at')
      .in('visit_id', visitIds)
      .order('changed_at', { ascending: false })

    if (historyError) {
      logger.error('Failed to fetch visit reschedule history', historyError)
      return NextResponse.json({ error: 'Failed to fetch reschedule history' }, { status: 500 })
    }

    return NextResponse.json({ history: (historyRows || []) as VisitScheduleHistoryRow[] })
  } catch (error) {
    logger.error('API error in visit-schedule-history POST', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
