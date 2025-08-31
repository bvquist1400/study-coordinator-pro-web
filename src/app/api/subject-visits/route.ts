import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/subject-visits?studyId|study_id=xxx&subjectId|subject_id=xxx&startDate=xxx&endDate=xxx&summary=true - Get subject visits
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId') || searchParams.get('study_id')
    const subjectId = searchParams.get('subjectId') || searchParams.get('subject_id')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    // Accept but do not use summary param for now
    searchParams.get('summary')
    
    if (!studyId) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    // Verify user membership on the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', studyId)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    if (study.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Build query with join to get subject information and visit schedules (order by visit_date if available)
    let query = supabase
      .from('subject_visits')
      .select(`
        *,
        subjects!inner(subject_number, randomization_date),
        visit_schedules(visit_day, window_before_days, window_after_days)
      `)
      .eq('study_id', studyId)
      .order('visit_date', { ascending: true })

    // Filter by subject if provided
    if (subjectId) {
      query = query.eq('subject_id', subjectId)
    }

    // Filter by date range if provided
    if (startDate) {
      query = query.gte('visit_date', startDate)
    }
    if (endDate) {
      query = query.lte('visit_date', endDate)
    }

    const { data: rawVisits, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch subject visits' }, { status: 500 })
    }

    // Transform the data to include subject_number at the top level while preserving relationships
    const subjectVisits = rawVisits?.map(visit => ({
      ...visit,
      subject_number: visit.subjects.subject_number,
      // Keep the subjects and visit_schedules objects for window calculation
      subjects: {
        randomization_date: visit.subjects.randomization_date
      },
      visit_schedules: visit.visit_schedules
    })) || []

    return NextResponse.json({ subjectVisits })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/subject-visits - Create new subject visit
export async function POST(request: NextRequest) {
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

    const visitData = await request.json()
    
    // Validate required fields (visit_date is required)
    if (!visitData.study_id || !visitData.subject_id || !visitData.visit_name || !visitData.visit_date) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id, subject_id, visit_name, visit_date' 
      }, { status: 400 })
    }

    // Verify user membership on the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', visitData.study_id)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    if (study.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Insert subject visit with user ID
    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .insert({
        ...visitData,
        visit_date: visitData.visit_date,
        user_id: user.id,
        status: visitData.status || 'scheduled'
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create subject visit' }, { status: 500 })
    }

    // If a lab kit was assigned, update its status to 'assigned'
    if (visitData.lab_kit_id) {
      const { error: kitError } = await supabase
        .from('lab_kits')
        .update({ 
          status: 'assigned',
          visit_schedule_id: visitData.visit_schedule_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', visitData.lab_kit_id)
        .eq('study_id', visitData.study_id) // Ensure kit belongs to same study

      if (kitError) {
        console.error('Failed to update lab kit status:', kitError)
        // Don't fail the visit creation, just log the error
      }
    }

    return NextResponse.json({ visit: subjectVisit }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
