import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// GET /api/subject-visits/[id]/prefill-returns - Suggest bottles to return for this visit
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const { id } = await params
    const supabase = createSupabaseAdmin()

    // Load visit to determine subject and study
    const { data: visit, error: vErr } = await supabase
      .from('subject_visits')
      .select('id, subject_id, study_id, visit_date')
      .eq('id', id)
      .single()

    if (vErr || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    }

    // Verify membership to the study
    const membership = await verifyStudyMembership((visit as any).study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    // Find previous visit
    const { data: prevVisits, error: prevErr } = await supabase
      .from('subject_visits')
      .select('id, visit_date')
      .eq('subject_id', (visit as any).subject_id)
      .lt('visit_date', (visit as any).visit_date)
      .order('visit_date', { ascending: false })
      .limit(1)

    if (prevErr) {
      logger.error('prefill-returns prev visit error', prevErr as any)
    }
    const prev = (prevVisits || [])[0]

    // Prefer bottles dispensed at previous visit and not yet returned
    let candidates: Array<{ ip_id: string; dispensed_count: number | null }> = []
    if (prev) {
      const { data: byPrev, error: byPrevErr } = await supabase
        .from('drug_compliance')
        .select('ip_id, dispensed_count')
        .eq('subject_id', (visit as any).subject_id)
        .eq('dispensed_visit_id', prev.id)
        .is('return_visit_id', null)
      if (byPrevErr) {
        logger.error('prefill-returns byPrev error', byPrevErr as any)
      } else if (byPrev) {
        candidates = byPrev as any
      }
    }

    // Fallback: all outstanding unreturned bottles
    if (candidates.length === 0) {
      const { data: anyUnreturned, error: anyErr } = await supabase
        .from('drug_compliance')
        .select('ip_id, dispensed_count')
        .eq('subject_id', (visit as any).subject_id)
        .is('return_visit_id', null)
      if (anyErr) {
        logger.error('prefill-returns anyErr', anyErr as any)
      } else if (anyUnreturned) {
        candidates = anyUnreturned as any
      }
    }

    return NextResponse.json({
      candidates: candidates.map(c => ({ ip_id: c.ip_id, suggested_return_count: 0 }))
    })
  } catch (e) {
    logger.error('prefill-returns error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

