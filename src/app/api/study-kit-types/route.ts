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

    const { study_id, name, description = null, buffer_days = null, buffer_count = null, delivery_days = null } = payload
    if (!study_id || !name) {
      return NextResponse.json({ error: 'study_id and name are required' }, { status: 400 })
    }

    const parsedBufferDays = buffer_days === null || buffer_days === undefined || buffer_days === ''
      ? null
      : Number(buffer_days)
    const parsedBufferCount = buffer_count === null || buffer_count === undefined || buffer_count === ''
      ? null
      : Number(buffer_count)
    const parsedDeliveryDays = delivery_days === null || delivery_days === undefined || delivery_days === ''
      ? null
      : Number(delivery_days)

    if (parsedBufferDays !== null && (!Number.isFinite(parsedBufferDays) || parsedBufferDays < 0 || parsedBufferDays > 120)) {
      return NextResponse.json({ error: 'buffer_days must be between 0 and 120' }, { status: 400 })
    }

    if (parsedBufferCount !== null && (!Number.isInteger(parsedBufferCount) || parsedBufferCount < 0 || parsedBufferCount > 999)) {
      return NextResponse.json({ error: 'buffer_count must be between 0 and 999' }, { status: 400 })
    }

    if (parsedDeliveryDays !== null && (!Number.isFinite(parsedDeliveryDays) || parsedDeliveryDays < 0 || parsedDeliveryDays > 120)) {
      return NextResponse.json({ error: 'delivery_days must be between 0 and 120' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const insert: StudyKitTypeInsert = {
      study_id,
      name,
      description: description || null,
      buffer_days: parsedBufferDays,
      buffer_count: parsedBufferCount,
      delivery_days: parsedDeliveryDays
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
      return NextResponse.json({ error: 'Failed to create kit type', detail: (error as any)?.message ?? null }, { status: 500 })
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

    const { id, study_id, name, description, is_active, buffer_days = undefined, buffer_count = undefined, delivery_days = undefined } = payload

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const update: StudyKitTypeUpdate = {}

    if (typeof name === 'string') update.name = name
    if (description !== undefined) update.description = description ?? null
    if (typeof is_active === 'boolean') update.is_active = is_active

    if (buffer_days !== undefined) {
      const parsed = buffer_days === null || buffer_days === '' ? null : Number(buffer_days)
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 120)) {
        return NextResponse.json({ error: 'buffer_days must be between 0 and 120' }, { status: 400 })
      }
      update.buffer_days = parsed
    }

    if (buffer_count !== undefined) {
      const parsed = buffer_count === null || buffer_count === '' ? null : Number(buffer_count)
      if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 999)) {
        return NextResponse.json({ error: 'buffer_count must be between 0 and 999' }, { status: 400 })
      }
      update.buffer_count = parsed
    }

    if (delivery_days !== undefined) {
      const parsed = delivery_days === null || delivery_days === '' ? null : Number(delivery_days)
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 120)) {
        return NextResponse.json({ error: 'delivery_days must be between 0 and 120' }, { status: 400 })
      }
      update.delivery_days = parsed
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided for update' }, { status: 400 })
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
      return NextResponse.json({ error: 'Failed to update kit type', detail: (error as any)?.message ?? null }, { status: 500 })
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
