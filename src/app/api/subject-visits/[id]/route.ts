import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import { isWithinVisitWindow, getDaysFromScheduled } from '@/lib/visit-calculator'
import logger from '@/lib/logger'
import type { SubjectVisitInsert, SubjectVisitUpdate } from '@/types/database'

// GET /api/subject-visits/[id] - Get specific subject visit
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    const resolvedParams = await params
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    // Get specific subject visit with subject information
    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .select(`
        *,
        subjects!inner(subject_number, status)
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject visit not found' }, { status: 404 })
      }
      logger.error('Database error fetching subject visit', error)
      return NextResponse.json({ error: 'Failed to fetch subject visit' }, { status: 500 })
    }

    // Verify membership based on study_id if present, else via subject relationship
    const sv: any = subjectVisit
    if (sv.study_id) {
      const { data: study } = await supabase
        .from('studies')
        .select('site_id, user_id')
        .eq('id', sv.study_id)
        .single()
      if (!study) return NextResponse.json({ error: 'Study not found' }, { status: 404 })
      const st: any = study
      if (st.site_id) {
        const { data: member } = await supabase
          .from('site_members')
          .select('user_id')
          .eq('site_id', st.site_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      } else if (st.user_id !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Transform the data to include subject_number at the top level (cast for typing)
    const svRow = subjectVisit as any
    const transformedVisit: any = {
      ...svRow,
      subject_number: svRow.subjects.subject_number
    }
    delete transformedVisit.subjects

    return NextResponse.json({ visit: transformedVisit })
  } catch (error) {
    logger.error('API error in subject visit GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/subject-visits/[id] - Update or upsert subject visit (for VisitCard)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    const updateData = await request.json()
    const resolvedParams = await params

    // If this is an upsert (new visit), we need to create it
    if (updateData.id === resolvedParams.id && updateData.study_id && updateData.visit_name && updateData.visit_date) {
      // Verify user owns the study
      const { data: study, error: studyError } = await supabase
        .from('studies')
        .select('id')
        .eq('id', updateData.study_id)
        .eq('user_id', user.id)
        .single()

      if (studyError || !study) {
        return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
      }

      // Try to upsert the record
      const { data: subjectVisit, error } = await (supabase as any)
        .from('subject_visits')
        .upsert({
          ...updateData,
          user_id: user.id,
          updated_at: new Date().toISOString()
        } as SubjectVisitInsert)
        .select()
        .single()

      if (error) {
        logger.error('Database error upserting subject visit', error as any)
        return NextResponse.json({ error: 'Failed to save subject visit' }, { status: 500 })
      }

      return NextResponse.json({ visit: subjectVisit })
    } else {
      // Regular update of existing visit
      // Verify membership based on record
      const { data: existing } = await supabase
        .from('subject_visits')
        .select('study_id')
        .eq('id', resolvedParams.id)
        .single()
      if (!existing) {
        return NextResponse.json({ error: 'Subject visit not found' }, { status: 404 })
      }
      const { data: st } = await supabase
        .from('studies')
        .select('site_id, user_id')
        .eq('id', (existing as any).study_id)
        .single()
      if (!st) return NextResponse.json({ error: 'Study not found' }, { status: 404 })
      const srow: any = st
      if (srow.site_id) {
        const { data: member } = await supabase
          .from('site_members')
          .select('user_id')
          .eq('site_id', srow.site_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      } else if (srow.user_id !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      // Calculate visit compliance if marking completed (compare to target date = anchor + visit_day)
      let windowCalculation = {}
      if (updateData.status === 'completed' && updateData.visit_date) {
        // Fetch required context: visit info, schedule, subject, and study anchor
        const { data: visitInfo } = await supabase
          .from('subject_visits')
          .select('visit_date, study_id, subject_id, visit_schedule_id')
          .eq('id', resolvedParams.id)
          .single()

        if (visitInfo) {
          const actualDate = new Date(updateData.visit_date)

          // Default fallback values
          let targetDate: Date | null = null
          let windowBefore = 7
          let windowAfter = 7

          // Schedule windows and day offset
          const vi: any = visitInfo
          if (vi.visit_schedule_id) {
            const { data: vs } = await supabase
              .from('visit_schedules')
              .select('visit_day, window_before_days, window_after_days')
              .eq('id', vi.visit_schedule_id)
              .single()
            if (vs as any) {
              const vsAny: any = vs
              windowBefore = vsAny.window_before_days ?? windowBefore
              windowAfter = vsAny.window_after_days ?? windowAfter

              // Subject anchor date (use randomization_date as anchor) and study anchor_day (0 or 1)
              const [{ data: subjectRow }, { data: studyRow }] = await Promise.all([
                supabase.from('subjects').select('randomization_date').eq('id', vi.subject_id).single(),
                supabase.from('studies').select('anchor_day').eq('id', vi.study_id).single(),
              ])
              const subj: any = subjectRow
              const stAny: any = studyRow
              if (subj?.randomization_date) {
                const anchor = new Date(subj.randomization_date)
                const anchorOffset = (stAny?.anchor_day ?? 0) === 1 ? 1 : 0
                const t = new Date(anchor)
                t.setDate(t.getDate() + (vsAny.visit_day ?? 0) + anchorOffset)
                targetDate = t
              }
            }
          }

          // If target could not be computed, fallback to visit_date
          if (!targetDate) {
            targetDate = new Date(vi.visit_date)
          }

          windowCalculation = {
            days_from_scheduled: getDaysFromScheduled(actualDate, targetDate),
            is_within_window: isWithinVisitWindow(actualDate, targetDate, windowBefore, windowAfter)
          }
        }
      }

      const { data: subjectVisit, error } = await supabase
        .from('subject_visits')
        .update({
          ...updateData,
          ...windowCalculation,
          updated_at: new Date().toISOString()
        } as SubjectVisitUpdate)
        .eq('id', resolvedParams.id)
        .select()
        .single()

      if (error) {
        logger.error('Database error updating subject visit', error as any)
        return NextResponse.json({ error: 'Failed to update subject visit' }, { status: 500 })
      }

      if (!subjectVisit) {
        return NextResponse.json({ error: 'Subject visit not found or access denied' }, { status: 404 })
      }

      return NextResponse.json({ visit: subjectVisit })
    }
  } catch (error) {
    logger.error('API error in subject visit PUT', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/subject-visits/[id] - Delete specific subject visit
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    const resolvedParams = await params
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    // Delete subject visit
    // Verify membership on the record before delete
    const { data: existing } = await supabase
      .from('subject_visits')
      .select('study_id')
      .eq('id', resolvedParams.id)
      .single()
    if (!existing) {
      return NextResponse.json({ error: 'Subject visit not found' }, { status: 404 })
    }
    const { data: st } = await supabase
      .from('studies')
      .select('site_id, user_id')
      .eq('id', (existing as any).study_id)
      .single()
    if (!st) return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    const sdel: any = st
    if (sdel.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', sdel.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    } else if (sdel.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .delete()
      .eq('id', resolvedParams.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject visit not found' }, { status: 404 })
      }
      logger.error('Database error deleting subject visit', error as any)
      return NextResponse.json({ error: 'Failed to delete subject visit' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Subject visit deleted successfully', subjectVisit })
  } catch (error) {
    logger.error('API error in subject visit DELETE', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
