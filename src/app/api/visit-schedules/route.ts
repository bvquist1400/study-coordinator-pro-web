import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/visit-schedules?study_id=xxx - Get visit schedules for a study
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
    const studyId = searchParams.get('study_id')
    
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    // Verify membership for the study
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
    const supabase = createSupabaseAdmin()
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

    // Verify membership for the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', study_id)
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
          // Note: user_id column doesn't exist in database, but security is handled via study ownership verification
        })) as unknown as never)
        .select()

      if (insertError) {
        console.error('Insert error:', insertError)
        console.error('Error details:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        })
        console.error('Data being inserted:', visit_schedules.map(schedule => ({
          ...schedule,
          study_id
        })))
        return NextResponse.json({ 
          error: 'Failed to create visit schedules',
          details: insertError.message 
        }, { status: 500 })
      }

      console.log('Successfully saved visit schedules:', newSchedules)
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
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id, study_id, ...updateData } = await request.json()
    
    if (!id || !study_id) {
      return NextResponse.json({ error: 'Visit schedule ID and study_id are required' }, { status: 400 })
    }

    // Verify membership for the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', study_id)
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

    // Update visit schedule
    const { data: visitSchedule, error } = await supabase
      .from('visit_schedules')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      } as unknown as never)
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
