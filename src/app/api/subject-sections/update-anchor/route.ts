import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// PATCH /api/subject-sections/update-anchor
// Body: { subject_section_id: uuid, anchor_date: YYYY-MM-DD }
export async function PATCH(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin() as any

    const { subject_section_id, anchor_date } = await request.json()
    if (!subject_section_id || !anchor_date) {
      return NextResponse.json({ error: 'subject_section_id and anchor_date are required' }, { status: 400 })
    }

    // Load subject_section -> subject -> study for membership and context
    const { data: ss, error: ssErr } = await supabase
      .from('subject_sections')
      .select('id, subject_id, study_section_id, anchor_date')
      .eq('id', subject_section_id)
      .single()
    if (ssErr || !ss) return NextResponse.json({ error: 'Subject section not found' }, { status: 404 })

    const { data: subj, error: subjErr } = await supabase
      .from('subjects')
      .select('id, study_id')
      .eq('id', ss.subject_id)
      .single()
    if (subjErr || !subj) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })

    const { data: study, error: studyErr } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', subj.study_id)
      .single()
    if (studyErr || !study) return NextResponse.json({ error: 'Study not found' }, { status: 404 })

    // Authorization: site member or owner
    if ((study as any).site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', (study as any).site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    } else if ((study as any).user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Update anchor_date
    const { error: updErr } = await supabase
      .from('subject_sections')
      .update({ anchor_date, updated_at: new Date().toISOString() })
      .eq('id', subject_section_id)
    if (updErr) {
      logger.error('Failed to update anchor_date', updErr)
      return NextResponse.json({ error: 'Failed to update section anchor' }, { status: 500 })
    }

    // Recompute planned dates for templates and update pending visits in this section
    const { data: templates, error: tErr } = await supabase
      .from('visit_schedules')
      .select('id, visit_day, section_id, study_id')
      .or(`section_id.eq.${ss.study_section_id},section_id.is.null`)
      .eq('study_id', subj.study_id)
    if (tErr) {
      logger.error('Failed to load templates for reschedule', tErr)
    } else {
      for (const t of templates || []) {
        const dt = new Date(anchor_date + 'T00:00:00Z')
        const vd = Number((t as any).visit_day || 0)
        dt.setUTCDate(dt.getUTCDate() + vd)
        const newDate = dt.toISOString().slice(0, 10)
        await supabase
          .from('subject_visits')
          .update({ visit_date: newDate, updated_at: new Date().toISOString() })
          .eq('subject_id', ss.subject_id)
          .eq('subject_section_id', ss.id)
          .eq('visit_schedule_id', (t as any).id)
          .eq('status', 'scheduled')
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('API error in subject-sections/update-anchor', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
