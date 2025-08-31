import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/studies - Get all studies for authenticated user
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

    // Resolve site memberships for user
    const { data: memberships, error: memberErr } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (memberErr) {
      console.error('Membership error:', memberErr)
      return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
    }

    const siteIds = (memberships || []).map(m => m.site_id)

    // Optional site_id filter
    const { searchParams } = new URL(request.url)
    const filterSiteId = searchParams.get('site_id')

    // Fetch studies by membership; also include legacy rows owned by user (no site set)
    let query = supabase
      .from('studies')
      .select('*')
      .order('created_at', { ascending: false })

    if (filterSiteId) {
      // If filter provided, ensure user is member of that site
      if (!siteIds.includes(filterSiteId)) {
        return NextResponse.json({ error: 'Access denied for requested site' }, { status: 403 })
      }
      query = query.eq('site_id', filterSiteId)
    } else if (siteIds.length > 0) {
      query = query.in('site_id', siteIds)
    }

    const { data: studies, error } = await query

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
    const supabase = createSupabaseAdmin()
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

    // Determine site_id: provided or first membership (if any)
    let siteId: string | null = studyData.site_id || null
    if (!siteId) {
      const { data: memberships } = await supabase
        .from('site_members')
        .select('site_id')
        .eq('user_id', user.id)
        .limit(1)
      siteId = memberships && memberships.length > 0 ? memberships[0].site_id : null
    }

    // Insert study with site and created_by (keep user_id for legacy/audit)
    const { data: study, error } = await supabase
      .from('studies')
      .insert({
        ...studyData,
        user_id: user.id,
        site_id: siteId,
        created_by: user.id,
        // Convert string numbers to actual numbers
        target_enrollment: studyData.target_enrollment ? parseInt(studyData.target_enrollment) : null,
        compliance_threshold: studyData.compliance_threshold ? parseInt(studyData.compliance_threshold) : 80,
        visit_window_days: studyData.visit_window_days || 7,
        anchor_day: studyData.anchor_day ? parseInt(studyData.anchor_day) : 0
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      if ((error as any).code === '23505') { // Unique constraint violation
        return NextResponse.json({ error: 'Protocol number already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create study', details: (error as any).message || (error as any).hint || String(error) }, { status: 500 })
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
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id, ...updateData } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'Study ID is required' }, { status: 400 })
    }

    // Build update object only with provided fields (avoid touching non-existent columns)
    const updateObject: Record<string, any> = { updated_at: new Date().toISOString() }
    if (typeof updateData.protocol_number !== 'undefined') updateObject.protocol_number = updateData.protocol_number
    if (typeof updateData.study_title !== 'undefined') updateObject.study_title = updateData.study_title
    if (typeof updateData.protocol_version !== 'undefined') updateObject.protocol_version = updateData.protocol_version
    if (typeof updateData.sponsor !== 'undefined') updateObject.sponsor = updateData.sponsor
    if (typeof updateData.principal_investigator !== 'undefined') updateObject.principal_investigator = updateData.principal_investigator
    if (typeof updateData.phase !== 'undefined') updateObject.phase = updateData.phase
    if (typeof updateData.indication !== 'undefined') updateObject.indication = updateData.indication
    if (typeof updateData.status !== 'undefined') updateObject.status = updateData.status
    if (typeof updateData.start_date !== 'undefined') updateObject.start_date = updateData.start_date
    if (typeof updateData.end_date !== 'undefined') updateObject.end_date = updateData.end_date
    if (typeof updateData.target_enrollment !== 'undefined') updateObject.target_enrollment = updateData.target_enrollment ? parseInt(updateData.target_enrollment) : null
    if (typeof updateData.compliance_threshold !== 'undefined') updateObject.compliance_threshold = updateData.compliance_threshold ? parseInt(updateData.compliance_threshold) : 80
    if (typeof updateData.visit_window_days !== 'undefined') updateObject.visit_window_days = updateData.visit_window_days
    if (typeof updateData.anchor_day !== 'undefined') updateObject.anchor_day = updateData.anchor_day ? parseInt(updateData.anchor_day) : 0
    if (typeof updateData.dosing_frequency !== 'undefined') updateObject.dosing_frequency = updateData.dosing_frequency
    if (typeof updateData.notes !== 'undefined') updateObject.notes = updateData.notes

    // Verify membership before update
    const { data: targetStudy, error: targetErr } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', id)
      .single()

    if (targetErr || !targetStudy) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    if (targetStudy.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', targetStudy.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (targetStudy.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Update study
    let { data: study, error } = await supabase
      .from('studies')
      .update(updateObject as unknown as never) // Type assertion for update object
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // Backward-compat: if protocol_version column doesn't exist in DB, retry without it
      const msg = ((error as any).message || (error as any).hint || '').toString().toLowerCase()
      if ((msg.includes('protocol_version') && msg.includes('does not exist')) || (msg.includes('anchor_day') && msg.includes('does not exist'))) {
        try {
          const { protocol_version, anchor_day, ...fallback } = updateObject as any
          const retry = await supabase
            .from('studies')
            .update(fallback as unknown as never)
            .eq('id', id)
            .select()
            .single()
          if (retry.error) {
            console.error('Database retry error:', retry.error)
            return NextResponse.json({ error: 'Failed to update study', details: (retry.error as any).message || (retry.error as any).hint || String(retry.error) }, { status: 500 })
          }
          study = retry.data
        } catch (e) {
          console.error('Database error:', error)
          return NextResponse.json({ error: 'Failed to update study', details: (error as any).message || (error as any).hint || String(error) }, { status: 500 })
        }
      } else {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to update study', details: (error as any).message || (error as any).hint || String(error) }, { status: 500 })
      }
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
