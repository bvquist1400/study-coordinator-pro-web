import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import { isWithinVisitWindow, getDaysFromScheduled } from '@/lib/visit-calculator'

// GET /api/subject-visits/[id] - Get specific subject visit
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const resolvedParams = await params
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

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
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch subject visit' }, { status: 500 })
    }

    // Verify membership based on study_id if present, else via subject relationship
    if (subjectVisit.study_id) {
      const { data: study } = await supabase
        .from('studies')
        .select('site_id, user_id')
        .eq('id', subjectVisit.study_id)
        .single()
      if (!study) return NextResponse.json({ error: 'Study not found' }, { status: 404 })
      if (study.site_id) {
        const { data: member } = await supabase
          .from('site_members')
          .select('user_id')
          .eq('site_id', study.site_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      } else if (study.user_id !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Transform the data to include subject_number at the top level
    const transformedVisit = {
      ...subjectVisit,
      subject_number: subjectVisit.subjects.subject_number
    }
    delete transformedVisit.subjects

    return NextResponse.json({ visit: transformedVisit })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/subject-visits/[id] - Update or upsert subject visit (for VisitCard)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

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
      const { data: subjectVisit, error } = await supabase
        .from('subject_visits')
        .upsert({
          ...updateData,
          user_id: user.id,
          updated_at: new Date().toISOString()
        } as unknown as never)
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
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
        .eq('id', existing.study_id)
        .single()
      if (!st) return NextResponse.json({ error: 'Study not found' }, { status: 404 })
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
          if (visitInfo.visit_schedule_id) {
            const { data: vs } = await supabase
              .from('visit_schedules')
              .select('visit_day, window_before_days, window_after_days')
              .eq('id', visitInfo.visit_schedule_id)
              .single()
            if (vs) {
              windowBefore = vs.window_before_days ?? windowBefore
              windowAfter = vs.window_after_days ?? windowAfter

              // Subject anchor date (use randomization_date as anchor) and study anchor_day (0 or 1)
              const [{ data: subjectRow }, { data: studyRow }] = await Promise.all([
                supabase.from('subjects').select('randomization_date').eq('id', visitInfo.subject_id).single(),
                supabase.from('studies').select('anchor_day').eq('id', visitInfo.study_id).single(),
              ])
              if (subjectRow?.randomization_date) {
                const anchor = new Date(subjectRow.randomization_date)
                const anchorOffset = (studyRow?.anchor_day ?? 0) === 1 ? 1 : 0
                const t = new Date(anchor)
                t.setDate(t.getDate() + (vs.visit_day ?? 0) + anchorOffset)
                targetDate = t
              }
            }
          }

          // If target could not be computed, fallback to visit_date
          if (!targetDate) {
            targetDate = new Date(visitInfo.visit_date)
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
        } as unknown as never)
        .eq('id', resolvedParams.id)
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to update subject visit' }, { status: 500 })
      }

      if (!subjectVisit) {
        return NextResponse.json({ error: 'Subject visit not found or access denied' }, { status: 404 })
      }

      return NextResponse.json({ visit: subjectVisit })
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/subject-visits/[id] - Delete specific subject visit
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const resolvedParams = await params
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

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
      .eq('id', existing.study_id)
      .single()
    if (!st) return NextResponse.json({ error: 'Study not found' }, { status: 404 })
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
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to delete subject visit' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Subject visit deleted successfully', subjectVisit })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
