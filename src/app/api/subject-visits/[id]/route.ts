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

// GET /api/subject-visits/[id] - Get specific subject visit
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get specific subject visit
    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id) // Ensure user can only access their own data
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject visit not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch subject visit' }, { status: 500 })
    }

    return NextResponse.json({ subjectVisit })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/subject-visits/[id] - Update or upsert subject visit (for VisitCard)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const updateData = await request.json()

    // If this is an upsert (new visit), we need to create it
    if (updateData.id === params.id && updateData.study_id && updateData.visit_name && updateData.scheduled_date) {
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
        })
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to save subject visit' }, { status: 500 })
      }

      return NextResponse.json({ subjectVisit })
    } else {
      // Regular update of existing visit
      const { data: subjectVisit, error } = await supabase
        .from('subject_visits')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id)
        .eq('user_id', user.id) // Extra security check
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to update subject visit' }, { status: 500 })
      }

      if (!subjectVisit) {
        return NextResponse.json({ error: 'Subject visit not found or access denied' }, { status: 404 })
      }

      return NextResponse.json({ subjectVisit })
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/subject-visits/[id] - Delete specific subject visit
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Delete subject visit
    const { data: subjectVisit, error } = await supabase
      .from('subject_visits')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id) // Ensure user can only delete their own data
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