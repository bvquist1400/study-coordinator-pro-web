import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { StudyKitTypeInsert, StudyKitTypeUpdate } from '@/types/database'

// GET /api/study-kit-types?study_id=...
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase
      .from('study_kit_types')
      .select('*')
      .eq('study_id', studyId)
      .order('name', { ascending: true })

    if (error) {
      logger.error('Failed to fetch study kit types', error as any, { studyId })
      return NextResponse.json({ error: 'Failed to fetch kit types' }, { status: 500 })
    }

    return NextResponse.json({ kitTypes: data || [] })
  } catch (error) {
    logger.error('API error in study kit types GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/study-kit-types
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

    const { study_id, name, description = null } = payload
    if (!study_id || !name) {
      return NextResponse.json({ error: 'study_id and name are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const insert: StudyKitTypeInsert = {
      study_id,
      name,
      description: description || null
    }

    const { data, error } = await (supabase as any)
      .from('study_kit_types')
      .insert(insert)
      .select()
      .single()

    if (error) {
      const isDuplicate = (error as any)?.code === '23505'
      if (isDuplicate) {
        return NextResponse.json({ error: 'A kit type with that name already exists for this study' }, { status: 409 })
      }
      logger.error('Failed to create study kit type', error as any, { study_id })
      return NextResponse.json({ error: 'Failed to create kit type' }, { status: 500 })
    }

    return NextResponse.json({ kitType: data }, { status: 201 })
  } catch (error) {
    logger.error('API error in study kit types POST', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/study-kit-types
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || !payload.id || !payload.study_id) {
      return NextResponse.json({ error: 'id and study_id are required' }, { status: 400 })
    }

    const { id, study_id, name, description, is_active } = payload

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const update: StudyKitTypeUpdate = {
      name,
      description: description ?? null,
      is_active
    }

    const { data, error } = await (supabase as any)
      .from('study_kit_types')
      .update(update)
      .eq('id', id)
      .eq('study_id', study_id)
      .select()
      .single()

    if (error) {
      const isDuplicate = (error as any)?.code === '23505'
      if (isDuplicate) {
        return NextResponse.json({ error: 'A kit type with that name already exists for this study' }, { status: 409 })
      }
      logger.error('Failed to update study kit type', error as any, { id, study_id })
      return NextResponse.json({ error: 'Failed to update kit type' }, { status: 500 })
    }

    return NextResponse.json({ kitType: data })
  } catch (error) {
    logger.error('API error in study kit types PUT', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/study-kit-types?id=...&study_id=...
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

    const { count, error: usageError } = await supabase
      .from('visit_kit_requirements')
      .select('id', { count: 'exact', head: true })
      .eq('kit_type_id', id)

    if (usageError) {
      logger.error('Failed to check kit type usage', usageError as any, { id })
      return NextResponse.json({ error: 'Failed to delete kit type' }, { status: 500 })
    }

    if ((count || 0) > 0) {
      return NextResponse.json({ error: 'Cannot delete kit type while it is still referenced by visit requirements' }, { status: 400 })
    }

    const { error } = await supabase
      .from('study_kit_types')
      .delete()
      .eq('id', id)
      .eq('study_id', studyId)

    if (error) {
      logger.error('Failed to delete study kit type', error as any, { id })
      return NextResponse.json({ error: 'Failed to delete kit type' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('API error in study kit types DELETE', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
