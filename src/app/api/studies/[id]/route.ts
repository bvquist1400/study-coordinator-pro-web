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

// GET /api/studies/[id] - Get specific study
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

    // Get specific study
    const { data: study, error } = await supabase
      .from('studies')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id) // Ensure user can only access their own studies
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Study not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch study' }, { status: 500 })
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

    // Delete study (this will cascade to related records via foreign key constraints)
    const { data: study, error } = await supabase
      .from('studies')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id) // Ensure user can only delete their own studies
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