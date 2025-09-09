import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
// Removed unused LabKitUpdate import
import logger from '@/lib/logger'

// GET /api/subject-visits?studyId|study_id=xxx&subjectId|subject_id=xxx&startDate=xxx&endDate=xxx&summary=true - Get subject visits
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

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

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Build query with join to get subject information and visit schedules (order by visit_date if available)
    let query = supabase
      .from('subject_visits')
      .select(`
        *,
        subjects!inner(subject_number, randomization_date),
        visit_schedules(visit_day, window_before_days, window_after_days),
        subject_sections(anchor_date)
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
      logger.error('Database error fetching subject visits', error as any)
      return NextResponse.json({ error: 'Failed to fetch subject visits' }, { status: 500 })
    }

    // Transform the data to include subject_number at the top level while preserving relationships
    const visitsRows = (rawVisits || []) as any[]
    const subjectVisits = visitsRows.map(v => ({
      ...v,
      subject_number: v.subjects.subject_number,
      subjects: { randomization_date: v.subjects.randomization_date },
      visit_schedules: v.visit_schedules,
      subject_sections: v.subject_sections || null,
    }))

    return NextResponse.json({ subjectVisits })
  } catch (error) {
    logger.error('API error in subject visits GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/subject-visits - Create new subject visit
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const visitData = await request.json()
    
    // Validate required fields (visit_date is required)
    if (!visitData.study_id || !visitData.subject_id || !visitData.visit_name || !visitData.visit_date) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id, subject_id, visit_name, visit_date' 
      }, { status: 400 })
    }

    const membership = await verifyStudyMembership(visitData.study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

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
      logger.error('Database error creating subject visit', error as any)
      return NextResponse.json({ error: 'Failed to create subject visit' }, { status: 500 })
    }

    // Removed: automatic transition to 'assigned'.

    return NextResponse.json({ visit: subjectVisit }, { status: 201 })
  } catch (error) {
    logger.error('API error in subject visits POST', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
