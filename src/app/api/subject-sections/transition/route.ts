import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// POST /api/subject-sections/transition
// Body: { subject_id: uuid, to_section_id: uuid, anchor_date: string(YYYY-MM-DD), end_reason?: string, cancel_policy?: 'cancel_all'|'keep' }
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin() as any

    const { subject_id, to_section_id, anchor_date, end_reason, cancel_policy } = await request.json()
    if (!subject_id || !to_section_id || !anchor_date) {
      return NextResponse.json({ error: 'subject_id, to_section_id, and anchor_date are required' }, { status: 400 })
    }

    // Resolve study_id via subject and verify membership
    const { data: subjectRow, error: subjErr } = await (supabase as any)
      .from('subjects')
      .select('id, study_id')
      .eq('id', subject_id)
      .single()
    if (subjErr || !subjectRow) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const studyId = subjectRow.study_id
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Day 0 semantics: anchor date is Day 0
    const anchorDay = 0

    // Find current active subject_section
    const { data: activeSec } = await (supabase as any)
      .from('subject_sections')
      .select('id')
      .eq('subject_id', subject_id)
      .is('ended_at', null)
      .limit(1)
      .single()

    // Close current active section, if any
    if (activeSec?.id) {
      await (supabase as any)
        .from('subject_sections')
        .update({ ended_at: new Date().toISOString(), status: 'completed', transition_reason: end_reason || null })
        .eq('id', activeSec.id)

      // Cancel remaining scheduled visits in previous section (simple policy)
      if ((cancel_policy ?? 'cancel_all') === 'cancel_all') {
        await (supabase as any)
          .from('subject_visits')
          .update({ status: 'cancelled' })
          .eq('subject_id', subject_id)
          .eq('subject_section_id', activeSec.id)
          .eq('status', 'scheduled')
      }
    }

    // Create new subject_section
    const { data: newSubjSec, error: newSecErr } = await (supabase as any)
      .from('subject_sections')
      .insert({
        subject_id,
        study_section_id: to_section_id,
        anchor_date,
        status: 'active',
        started_at: new Date().toISOString()
      })
      .select('id')
      .single()
    if (newSecErr || !newSubjSec) {
      logger.error('Failed to create subject_section', newSecErr)
      return NextResponse.json({ error: 'Failed to create subject section' }, { status: 500 })
    }

    // Generate planned visits from visit_schedules for the target section
    const { data: schedules, error: schErr } = await (supabase as any)
      .from('visit_schedules')
      .select('id, visit_name, visit_day, window_before_days, window_after_days')
      .eq('study_id', studyId)
      .eq('section_id', to_section_id)
      .order('visit_day', { ascending: true })
    if (schErr) {
      logger.error('Failed to load section schedules', schErr)
      return NextResponse.json({ error: 'Failed to load section visit templates' }, { status: 500 })
    }

    // Compute scheduled dates
    const base = new Date(anchor_date + 'T00:00:00Z')
    const addDays = (d: number) => {
      const dt = new Date(base)
      dt.setUTCDate(dt.getUTCDate() + d)
      return dt.toISOString().slice(0, 10)
    }
    const toInsert = (schedules || []).map((s: any) => ({
      study_id: studyId,
      subject_id,
      subject_section_id: newSubjSec.id,
      visit_schedule_id: s.id,
      visit_name: s.visit_name,
      visit_date: addDays((s.visit_day ?? 0) - anchorDay),
      status: 'scheduled' as const,
      is_within_window: null,
      days_from_scheduled: null
    }))

    if (toInsert.length > 0) {
      const { error: insErr } = await (supabase as any).from('subject_visits').insert(toInsert)
      if (insErr) logger.error('Failed inserting generated visits', insErr)
    }

    return NextResponse.json({ new_subject_section_id: newSubjSec.id, generated_visits: toInsert.length })
  } catch (error) {
    logger.error('API error in subject-sections/transition', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
