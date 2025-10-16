import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import type { StudySection, StudySectionUpdate } from '@/types/database'
import logger from '@/lib/logger'

async function getSectionStudyId(supabase: any, id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('study_sections')
    .select('study_id')
    .eq('id', id)
    .single()
  if (error) return null
  return data?.study_id ?? null
}

// PUT /api/study-sections/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()
    const { id } = params

    const studyId = await getSectionStudyId(supabase, id)
    if (!studyId) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const body = await request.json()
    const update: StudySectionUpdate = {
      code: body.code,
      name: body.name,
      order_index: body.order_index,
      anchor_type: body.anchor_type,
      anchor_offset_days: body.anchor_offset_days,
      dosing_frequency: body.dosing_frequency,
      compliance_threshold: body.compliance_threshold,
      is_active: body.is_active,
      updated_at: new Date().toISOString() as any,
    }

    const { data, error } = await (supabase as any)
      .from('study_sections')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Update error for study section', error)
      return NextResponse.json({ error: 'Failed to update section', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ section: data as StudySection })
  } catch (error) {
    logger.error('API error in study-sections PUT', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/study-sections/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()
    const { id } = params

    const studyId = await getSectionStudyId(supabase, id)
    if (!studyId) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const { error } = await (supabase as any)
      .from('study_sections')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Delete error for study section', error)
      return NextResponse.json({ error: 'Failed to delete section', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('API error in study-sections DELETE', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
