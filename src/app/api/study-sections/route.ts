import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import type { StudySection, StudySectionInsert, StudySectionUpdate } from '@/types/database'
import logger from '@/lib/logger'

// GET /api/study-sections?study_id=xxx
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    if (!studyId) return NextResponse.json({ error: 'study_id is required' }, { status: 400 })

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const { data, error } = await (supabase as any)
      .from('study_sections')
      .select('*')
      .eq('study_id', studyId)
      .order('order_index', { ascending: true })
      .order('code', { ascending: true })

    if (error) {
      logger.error('Error fetching study sections', error)
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 })
    }

    return NextResponse.json({ sections: data as StudySection[] })
  } catch (error) {
    logger.error('API error in study-sections GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/study-sections
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const body = await request.json()
    const { study_id, code, name, order_index, anchor_type, anchor_offset_days, dosing_frequency, compliance_threshold, is_active } = body || {}

    if (!study_id || !code) {
      return NextResponse.json({ error: 'study_id and code are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const insert: StudySectionInsert = {
      study_id,
      code: String(code).trim(),
      name: name ?? null,
      order_index: order_index ?? null,
      anchor_type: anchor_type ?? 'section_anchor_date',
      anchor_offset_days: anchor_offset_days ?? 0,
      dosing_frequency: dosing_frequency ?? null,
      compliance_threshold: compliance_threshold ?? null,
      is_active: is_active ?? true,
    }

    const { data, error } = await (supabase as any)
      .from('study_sections')
      .insert(insert)
      .select()
      .single()

    if (error) {
      logger.error('Insert error creating study section', error)
      return NextResponse.json({ error: 'Failed to create section', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ section: data as StudySection }, { status: 201 })
  } catch (error) {
    logger.error('API error in study-sections POST', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

