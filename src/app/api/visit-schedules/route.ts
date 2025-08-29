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

// GET /api/visit-schedules?study_id=xxx - Get visit schedules for a study
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

    // Get visit schedules for the study
    const { data: visitSchedules, error } = await supabase
      .from('visit_schedules')
      .select('*')
      .eq('study_id', studyId)
      .order('visit_number')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch visit schedules' }, { status: 500 })
    }

    return NextResponse.json({ visitSchedules })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/visit-schedules - Create or replace visit schedules for a study
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

    const { study_id, visit_schedules } = await request.json()
    
    if (!study_id || !visit_schedules || !Array.isArray(visit_schedules)) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id and visit_schedules array' 
      }, { status: 400 })
    }

    // Verify user owns the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id')
      .eq('id', study_id)
      .eq('user_id', user.id)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
    }

    // Use a transaction to replace visit schedules
    // First, delete existing schedules
    const { error: deleteError } = await supabase
      .from('visit_schedules')
      .delete()
      .eq('study_id', study_id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to clear existing visit schedules' }, { status: 500 })
    }

    // Then, insert new schedules
    if (visit_schedules.length > 0) {
      const { data: newSchedules, error: insertError } = await supabase
        .from('visit_schedules')
        .insert(visit_schedules.map(schedule => ({
          ...schedule,
          study_id // Ensure study_id is set
        })))
        .select()

      if (insertError) {
        console.error('Insert error:', insertError)
        return NextResponse.json({ error: 'Failed to create visit schedules' }, { status: 500 })
      }

      return NextResponse.json({ visitSchedules: newSchedules }, { status: 201 })
    }

    return NextResponse.json({ visitSchedules: [] }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/visit-schedules - Update a specific visit schedule
export async function PUT(request: NextRequest) {
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

    const { id, study_id, ...updateData } = await request.json()
    
    if (!id || !study_id) {
      return NextResponse.json({ error: 'Visit schedule ID and study_id are required' }, { status: 400 })
    }

    // Verify user owns the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id')
      .eq('id', study_id)
      .eq('user_id', user.id)
      .single()

    if (studyError || !study) {
      return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
    }

    // Update visit schedule
    const { data: visitSchedule, error } = await supabase
      .from('visit_schedules')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('study_id', study_id) // Extra security check
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update visit schedule' }, { status: 500 })
    }

    if (!visitSchedule) {
      return NextResponse.json({ error: 'Visit schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ visitSchedule })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}