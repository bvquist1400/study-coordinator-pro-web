import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import type { StudyUpdate } from '@/types/database'

// GET /api/studies - Get all studies for authenticated user
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    // Resolve site memberships for user
    const { data: memberships, error: memberErr } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (memberErr) {
      console.error('Membership error:', memberErr)
      return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
    }

    const siteIds = ((memberships || []) as Array<{ site_id: string | null }>).map(m => m.site_id)

    // Optional site_id filter
    const { searchParams } = new URL(request.url)
    const filterSiteId = searchParams.get('site_id')

    // Fetch studies by membership; also include legacy rows owned by user (no site set)
    // Behavior:
    // - If site filter provided: require membership and return only that site's studies
    // - Else if user has memberships: return studies in those sites + legacy studies owned by user
    // - Else (no memberships): return only legacy studies owned by user
    if (filterSiteId) {
      if (!siteIds.includes(filterSiteId)) {
        return NextResponse.json({ error: 'Access denied for requested site' }, { status: 403 })
      }
      const { data: studies, error } = await supabase
        .from('studies')
        .select('*')
        .eq('site_id', filterSiteId)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
      }
      return NextResponse.json({ studies: studies || [] })
    }

    if (siteIds.length > 0) {
      const [withSiteRes, legacyRes] = await Promise.all([
        supabase
          .from('studies')
          .select('*')
          .in('site_id', siteIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('studies')
          .select('*')
          .is('site_id', null)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (withSiteRes.error) {
        console.error('Database error (withSite):', withSiteRes.error)
        return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
      }
      if (legacyRes.error) {
        console.error('Database error (legacy):', legacyRes.error)
        return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
      }
      const list = [...(withSiteRes.data || []), ...(legacyRes.data || [])]
      // Deduplicate by id and sort
      const map = new Map<string, any>()
      for (const s of list) map.set((s as any).id, s)
      const merged = Array.from(map.values()).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return NextResponse.json({ studies: merged })
    }

    // No memberships: only legacy user-owned studies
    const { data: legacyOnly, error } = await supabase
      .from('studies')
      .select('*')
      .is('site_id', null)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
    }
    return NextResponse.json({ studies: legacyOnly || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/studies - Create new study
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

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
      const m0 = ((memberships || []) as Array<{ site_id: string | null }>)
      siteId = m0.length > 0 ? m0[0].site_id : null
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
      const errCode = (error as { code?: string }).code
      if (errCode === '23505') { // Unique constraint violation
        return NextResponse.json({ error: 'Protocol number already exists' }, { status: 409 })
      }
      const details = (error as { message?: string; hint?: string }).message || (error as { message?: string; hint?: string }).hint || String(error)
      return NextResponse.json({ error: 'Failed to create study', details }, { status: 500 })
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
    const updateObject: Partial<StudyUpdate> & { updated_at: string } = { updated_at: new Date().toISOString() }
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

    const t: any = targetStudy
    if (t.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', t.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (t.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Update study
    const updateRes = await (supabase as any)
      .from('studies')
      .update(updateObject as StudyUpdate)
      .eq('id', id)
      .select()
      .single()
    let study = updateRes.data
    const error = updateRes.error

    if (error) {
      // Backward-compat: if protocol_version column doesn't exist in DB, retry without it
      const msg = (((error as { message?: string; hint?: string }).message || (error as { message?: string; hint?: string }).hint) || '').toString().toLowerCase()
      if ((msg.includes('protocol_version') && msg.includes('does not exist')) || (msg.includes('anchor_day') && msg.includes('does not exist'))) {
        try {
          const { protocol_version: _pv, anchor_day: _ad, ...fallback } = updateObject as Record<string, unknown>
          const retry = await (supabase as any)
            .from('studies')
            .update(fallback as StudyUpdate)
            .eq('id', id)
            .select()
            .single()
          if (retry.error) {
            console.error('Database retry error:', retry.error)
            const details = (retry.error as { message?: string; hint?: string }).message || (retry.error as { message?: string; hint?: string }).hint || String(retry.error)
            return NextResponse.json({ error: 'Failed to update study', details }, { status: 500 })
          }
          study = retry.data
        } catch {
          console.error('Database error:', error)
          const details = (error as { message?: string; hint?: string }).message || (error as { message?: string; hint?: string }).hint || String(error)
          return NextResponse.json({ error: 'Failed to update study', details }, { status: 500 })
        }
      } else {
        console.error('Database error:', error)
        const details = (error as { message?: string; hint?: string }).message || (error as { message?: string; hint?: string }).hint || String(error)
        return NextResponse.json({ error: 'Failed to update study', details }, { status: 500 })
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
