import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/lab-kits?studyId=xxx&status=xxx&summary=true - Get lab kits
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
    const studyId = searchParams.get('studyId')
    const status = searchParams.get('status')
    // 'summary' parameter is accepted but not used in this endpoint
    
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

    // Build query with optional join to visit_schedules
    let query = supabase
      .from('lab_kits')
      .select(`
        *,
        visit_schedules(visit_name, visit_number)
      `)
      .eq('study_id', studyId)
      .order('created_at', { ascending: false })

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status)
    }

    const { data: labKits, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch lab kits' }, { status: 500 })
    }

    return NextResponse.json({ labKits: labKits || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/lab-kits - Create new lab kit
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

    const kitData = await request.json()
    
    // Validate required fields
    if (!kitData.study_id || !kitData.accession_number || !kitData.kit_type) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id, accession_number, kit_type' 
      }, { status: 400 })
    }

    // Verify user membership on the study
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', kitData.study_id)
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

    // Check for duplicate accession number within the study
    const { data: existingKit } = await supabase
      .from('lab_kits')
      .select('id')
      .eq('study_id', kitData.study_id)
      .eq('accession_number', kitData.accession_number)
      .maybeSingle()

    if (existingKit) {
      return NextResponse.json({ 
        error: 'A lab kit with this accession number already exists in this study' 
      }, { status: 409 })
    }

    // Insert lab kit
    const { data: labKit, error } = await supabase
      .from('lab_kits')
      .insert({
        ...kitData,
        status: kitData.status || 'available'
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create lab kit' }, { status: 500 })
    }

    return NextResponse.json({ labKit }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
