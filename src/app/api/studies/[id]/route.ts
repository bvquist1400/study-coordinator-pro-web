import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/studies/[id] - Get specific study
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

    // Get specific study
    const { data: study, error } = await supabase
      .from('studies')
      .select('*')
      .eq('id', resolvedParams.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Study not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch study' }, { status: 500 })
    }

    // Verify membership or legacy ownership
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

    return NextResponse.json({ study })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/studies/[id] - Delete specific study
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

    // Verify membership before delete
    const { data: studyRow, error: studyErr } = await supabase
      .from('studies')
      .select('site_id, user_id')
      .eq('id', resolvedParams.id)
      .single()
    if (studyErr || !studyRow) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }
    if (studyRow.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', studyRow.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    } else if (studyRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete study (this will cascade to related records via foreign key constraints)
    const { data: study, error } = await supabase
      .from('studies')
      .delete()
      .eq('id', resolvedParams.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Study not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to delete study' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Study deleted successfully', study })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
