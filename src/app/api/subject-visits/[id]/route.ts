import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import { isWithinVisitWindow, getDaysFromScheduled, calculateVisitDate } from '@/lib/visit-calculator'
import { parseDateUTC } from '@/lib/date-utils'
import logger from '@/lib/logger'
import type { SubjectVisitInsert, SubjectVisitUpdate, VisitScheduleHistoryInsert } from '@/types/database'

// GET /api/subject-visits/[id] - Get specific subject visit
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    const visitId = params.id
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    // Get specific subject visit with subject information
    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .select(`
        *,
        subjects!inner(subject_number, status)
      `)
      .eq('id', visitId)
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
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    const rawUpdate = await request.json()
    const visitId = params.id

    // If this is an upsert (new visit), we need to create it
    if (rawUpdate.id === visitId && rawUpdate.study_id && rawUpdate.visit_name && rawUpdate.visit_date) {
      // Verify user owns the study
      const { data: study, error: studyError } = await supabase
        .from('studies')
        .select('id')
        .eq('id', rawUpdate.study_id)
        .eq('user_id', user.id)
        .single()

      if (studyError || !study) {
        return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
      }

      // Try to upsert the record
      const { data: subjectVisit, error } = await (supabase as any)
        .from('subject_visits')
        .upsert({
          ...rawUpdate,
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
        .select('study_id, visit_date')
        .eq('id', visitId)
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

      const previousVisitDate: string | null = (existing as any)?.visit_date || null
      const { reschedule_reason, ...updateData } = rawUpdate as Record<string, unknown>
      const updateFields = updateData as SubjectVisitUpdate

      // Calculate/clear visit timing fields based on status
      let windowCalculation: any = {}
      if (updateFields.status === 'completed' && updateFields.visit_date) {
        // Fetch required context: visit info, schedule, subject, and study anchor
        const { data: visitInfo } = await supabase
          .from('subject_visits')
          .select('visit_date, study_id, subject_id, visit_schedule_id, subject_section_id, studies(anchor_day)')
          .eq('id', visitId)
          .single()

        if (visitInfo) {
          const actualDate = new Date(updateFields.visit_date)

          // Default fallback values
          let targetDate: Date | null = null
          let windowBefore = 7
          let windowAfter = 7

          // Schedule windows and day offset based on study anchor_day
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

              // Subject anchor date: prefer the visit's subject_section anchor; else active assignment
              let anchorStr: string | null = null
              if (vi.subject_section_id) {
                const { data: assn } = await supabase
                  .from('subject_sections')
                  .select('anchor_date')
                  .eq('id', vi.subject_section_id)
                  .single()
                anchorStr = (assn as any)?.anchor_date || null
              } else {
                const { data: assn } = await supabase
                  .from('subject_sections')
                  .select('anchor_date')
                  .eq('subject_id', vi.subject_id)
                  .is('ended_at', null)
                  .maybeSingle()
                anchorStr = (assn as any)?.anchor_date || null
              }

              if (anchorStr) {
                // Prefer study-specific anchor day (0-based vs 1-based)
                const anchorDayValue = (visitInfo as any)?.studies?.anchor_day
                const anchorDay = typeof anchorDayValue === 'number' ? anchorDayValue : 0
                const scheduleDayRaw = typeof vsAny.visit_day === 'number' ? vsAny.visit_day : 0
                const normalizedVisitDay = anchorDay === 1 ? Math.max(scheduleDayRaw - 1, 0) : scheduleDayRaw
                // Use UTC-safe calculator with Day 0
                const base = parseDateUTC(anchorStr) || new Date(anchorStr)
                const calc = calculateVisitDate(
                  base as Date,
                  normalizedVisitDay,
                  'days',
                  0,
                  windowBefore,
                  windowAfter
                )
                targetDate = calc.scheduledDate
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
      } else if (updateFields.status === 'cancelled' || updateFields.status === 'missed') {
        // Ensure cancelled/missed do not retain timing flags
        windowCalculation = {
          days_from_scheduled: null,
          is_within_window: null
        }
      }

      const { data: subjectVisit, error } = await (supabase as any)
        .from('subject_visits')
        .update({
          ...updateFields,
          ...windowCalculation,
          updated_at: new Date().toISOString()
        } as SubjectVisitUpdate)
        .eq('id', visitId)
        .select()
        .single()

      if (error) {
        logger.error('Database error updating subject visit', error as any)
        return NextResponse.json({ error: 'Failed to update subject visit' }, { status: 500 })
      }

      if (updateFields.visit_date && previousVisitDate && updateFields.visit_date !== previousVisitDate) {
        try {
          await (supabase as any)
            .from('visit_schedule_history')
            .insert({
              visit_id: visitId,
              old_date: previousVisitDate,
              new_date: updateFields.visit_date,
              reason: typeof reschedule_reason === 'string' && reschedule_reason.trim() ? reschedule_reason.trim() : null,
              changed_by: user.id
            } as VisitScheduleHistoryInsert)
        } catch (historyError) {
          logger.error('Failed to record visit reschedule history', historyError as any)
        }
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
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    const visitId = params.id
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()

    // Delete subject visit
    // Verify membership on the record before delete
    const { data: existing } = await supabase
      .from('subject_visits')
      .select('study_id')
      .eq('id', visitId)
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
      .eq('id', visitId)
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
