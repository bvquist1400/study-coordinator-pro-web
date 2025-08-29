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

// GET /api/studies - Get all studies for authenticated user
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

    // Get user's studies
    const { data: studies, error } = await supabase
      .from('studies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
    }

    return NextResponse.json({ studies })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/studies - Create new study
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

    const studyData = await request.json()
    
    // Validate required fields
    if (!studyData.protocol_number || !studyData.study_title || !studyData.sponsor || !studyData.principal_investigator) {
      return NextResponse.json({ 
        error: 'Missing required fields: protocol_number, study_title, sponsor, principal_investigator' 
      }, { status: 400 })
    }

    // Insert study with user ID
    const { data: study, error } = await supabase
      .from('studies')
      .insert({
        ...studyData,
        user_id: user.id,
        // Convert string numbers to actual numbers
        target_enrollment: studyData.target_enrollment ? parseInt(studyData.target_enrollment) : null,
        compliance_threshold: studyData.compliance_threshold ? parseInt(studyData.compliance_threshold) : 80,
        visit_window_days: studyData.visit_window_days || 7
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ error: 'Protocol number already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create study' }, { status: 500 })
    }

    return NextResponse.json({ study }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/studies - Update existing study
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

    const { id, ...updateData } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'Study ID is required' }, { status: 400 })
    }

    // Update study (RLS will ensure user can only update their own studies)
    const { data: study, error } = await supabase
      .from('studies')
      .update({
        ...updateData,
        // Convert string numbers to actual numbers
        target_enrollment: updateData.target_enrollment ? parseInt(updateData.target_enrollment) : null,
        compliance_threshold: updateData.compliance_threshold ? parseInt(updateData.compliance_threshold) : 80,
        visit_window_days: updateData.visit_window_days || 7,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id) // Extra security check
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update study' }, { status: 500 })
    }

    if (!study) {
      return NextResponse.json({ error: 'Study not found or access denied' }, { status: 404 })
    }

    return NextResponse.json({ study })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}