import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/subjects/[id] - Get specific subject
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseAdmin()
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const resolvedParams = await params
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get subject first (no relationship dependency)
    const { data: subject, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', resolvedParams.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch subject' }, { status: 500 })
    }

    // Membership check via subject.study_id -> studies.site_id (robust even without FK metadata)
    const { data: studyRow, error: stErr } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', subject.study_id)
      .single()
    if (stErr || !studyRow) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    if (studyRow.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', studyRow.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (studyRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ subject })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/subjects/[id] - Update subject
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseAdmin()
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
    const resolvedParams = await params

    // Create update object with allowed fields
    const updateObject = {
      subject_number: updateData.subject_number,
      gender: updateData.gender,
      enrollment_date: updateData.enrollment_date,
      randomization_date: updateData.randomization_date,
      treatment_arm: updateData.treatment_arm,
      status: updateData.status,
      discontinuation_reason: updateData.discontinuation_reason,
      discontinuation_date: updateData.discontinuation_date,
      notes: updateData.notes,
      updated_at: new Date().toISOString()
    }

    // Remove undefined fields
    Object.keys(updateObject).forEach(key => {
      if (updateObject[key as keyof typeof updateObject] === undefined) {
        delete updateObject[key as keyof typeof updateObject]
      }
    })

    // Verify membership before update
    const { data: subRow, error: subErr } = await supabase
      .from('subjects')
      .select('study_id')
      .eq('id', resolvedParams.id)
      .single()
    if (subErr || !subRow) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const { data: st } = await supabase
      .from('studies')
      .select('site_id, user_id')
      .eq('id', subRow.study_id)
      .single()
    if (!st) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    if (st.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', st.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (st.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Update subject
    const { data: subject, error } = await supabase
      .from('subjects')
      .update(updateObject as unknown as never)
      .eq('id', resolvedParams.id)
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ 
          error: 'Subject number already exists in this study' 
        }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to update subject' }, { status: 500 })
    }

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or access denied' }, { status: 404 })
    }

    return NextResponse.json({ subject })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/subjects/[id] - Delete subject
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseAdmin()
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const resolvedParams = await params
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Check if subject has any visits before deleting
    const { data: visits, error: visitsError } = await supabase
      .from('subject_visits')
      .select('id')
      .eq('subject_id', resolvedParams.id)
      .limit(1)

    if (visitsError) {
      console.error('Error checking visits:', visitsError)
      return NextResponse.json({ error: 'Failed to verify subject deletion' }, { status: 500 })
    }

    if (visits && visits.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete subject with existing visits. Please remove visits first.' 
      }, { status: 409 })
    }

    // Verify membership before delete (reuse study from above check)
    const { data: subject, error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', resolvedParams.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to delete subject' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Subject deleted successfully', 
      subject 
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
