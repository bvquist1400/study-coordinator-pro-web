import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { VisitKitRequirementInsert, VisitKitRequirementUpdate } from '@/types/database'

// GET /api/visit-kit-requirements?study_id=...&visit_schedule_id=...
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const visitScheduleId = searchParams.get('visit_schedule_id')

    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    let query = supabase
      .from('visit_kit_requirements')
      .select('*, study_kit_types(id, name, description, is_active)')
      .eq('study_id', studyId)
      .order('created_at', { ascending: true })

    if (visitScheduleId) {
      query = query.eq('visit_schedule_id', visitScheduleId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to fetch visit kit requirements', error as any, { studyId, visitScheduleId })
      return NextResponse.json({ error: 'Failed to fetch visit kit requirements' }, { status: 500 })
    }

    return NextResponse.json({ requirements: data || [] })
  } catch (error) {
    logger.error('API error in visit kit requirements GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/visit-kit-requirements - create a requirement
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const { study_id, visit_schedule_id, kit_type_id, quantity = 1, is_optional = false, notes = null } = payload

    if (!study_id || !visit_schedule_id || !kit_type_id) {
      return NextResponse.json({ error: 'study_id, visit_schedule_id, and kit_type_id are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const { data: kitType } = await supabase
      .from('study_kit_types')
      .select('id, study_id, name, description, is_active')
      .eq('id', kit_type_id)
      .single()

    if (!kitType || (kitType as any).study_id !== study_id) {
      return NextResponse.json({ error: 'Kit type not found for this study' }, { status: 400 })
    }

    const insert: VisitKitRequirementInsert = {
      study_id,
      visit_schedule_id,
      kit_type_id,
      quantity,
      is_optional,
      notes
    }

    const { data, error } = await (supabase as any)
      .from('visit_kit_requirements')
      .insert(insert)
      .select('*, study_kit_types(id, name, description, is_active)')
      .single()

    if (error) {
      logger.error('Failed to create visit kit requirement', error as any, { study_id, visit_schedule_id })
      return NextResponse.json({ error: 'Failed to create visit kit requirement' }, { status: 500 })
    }

    return NextResponse.json({ requirement: data }, { status: 201 })
  } catch (error) {
    logger.error('API error in visit kit requirements POST', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/visit-kit-requirements - update requirement
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || !payload.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { id, study_id, visit_schedule_id, kit_type_id, quantity, is_optional, notes } = payload

    if (!study_id) {
      return NextResponse.json({ error: 'study_id is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    if (kit_type_id) {
      const { data: kitType } = await supabase
        .from('study_kit_types')
        .select('id, study_id')
        .eq('id', kit_type_id)
        .single()
      if (!kitType || (kitType as any).study_id !== study_id) {
        return NextResponse.json({ error: 'Kit type not found for this study' }, { status: 400 })
      }
    }
    const update: VisitKitRequirementUpdate = {
      visit_schedule_id,
      kit_type_id,
      quantity,
      is_optional,
      notes,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await (supabase as any)
      .from('visit_kit_requirements')
      .update(update)
      .eq('id', id)
      .select('*, study_kit_types(id, name, description, is_active)')
      .single()

    if (error) {
      logger.error('Failed to update visit kit requirement', error as any, { id })
      return NextResponse.json({ error: 'Failed to update visit kit requirement' }, { status: 500 })
    }

    return NextResponse.json({ requirement: data })
  } catch (error) {
    logger.error('API error in visit kit requirements PUT', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/visit-kit-requirements?id=...
export async function DELETE(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const studyId = searchParams.get('study_id')

    if (!id || !studyId) {
      return NextResponse.json({ error: 'id and study_id are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const { error } = await supabase
      .from('visit_kit_requirements')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Failed to delete visit kit requirement', error as any, { id })
      return NextResponse.json({ error: 'Failed to delete visit kit requirement' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('API error in visit kit requirements DELETE', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
