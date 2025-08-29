import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Server-side Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// GET /api/subject-visits?study_id=xxx&subject_id=xxx - Get subject visits
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const subjectId = searchParams.get('subject_id')
    
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    // Verify user owns the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id')
      .eq('id', studyId)
      .eq('user_id', user.id)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
    }

    // Build query
    let query = supabase
      .from('subject_visits')
      .select('*')
      .eq('study_id', studyId)
      .eq('user_id', user.id) // Extra security
      .order('scheduled_date')

    // Filter by subject if provided
    if (subjectId) {
      query = query.eq('subject_id', subjectId)
    }

    const { data: subjectVisits, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch subject visits' }, { status: 500 })
    }

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const visitData = await request.json()
    
    // Validate required fields
    if (!visitData.study_id || !visitData.subject_id || !visitData.visit_name || !visitData.scheduled_date) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id, subject_id, visit_name, scheduled_date' 
      }, { status: 400 })
    }

    // Verify user owns the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id')
      .eq('id', visitData.study_id)
      .eq('user_id', user.id)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
    }

    // Insert subject visit with user ID
    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .insert({
        ...visitData,
        user_id: user.id,
        status: visitData.status || 'scheduled'
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create subject visit' }, { status: 500 })
    }

    return NextResponse.json({ subjectVisit }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}