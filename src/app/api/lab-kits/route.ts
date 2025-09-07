import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/lab-kits?studyId=xxx&status=xxx&summary=true - Get lab kits
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    const statusParam = searchParams.get('status')
    // 'summary' parameter is accepted but not used in this endpoint
    
    if (!studyId) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Auto-expire kits whose expiration_date has passed
    try {
      const today = new Date()
      today.setUTCHours(0,0,0,0)
      const todayISO = today.toISOString().slice(0,10)
      await supabase
        .from('lab_kits')
        // @ts-expect-error string[] for in filter
        .update({ status: 'expired' })
        .lt('expiration_date', todayISO)
        .in('status', ['available','assigned','used','pending_shipment'])
        .eq('study_id', studyId)
    } catch {}

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
    if (statusParam) {
      query = query.eq('status', statusParam)
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
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const kitData = await request.json()
    
    // Validate required fields
    if (!kitData.study_id || !kitData.accession_number || !kitData.kit_type) {
      return NextResponse.json({ 
        error: 'Missing required fields: study_id, accession_number, kit_type' 
      }, { status: 400 })
    }

    const membership = await verifyStudyMembership(kitData.study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Check for global duplicate accession number
    const { data: existingKit } = await supabase
      .from('lab_kits')
      .select('id')
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
