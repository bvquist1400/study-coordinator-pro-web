import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// GET /api/subject-sections?subject_id=...&study_id=...
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin() as any

    const { searchParams } = new URL(request.url)
    const subjectId = searchParams.get('subject_id')
    const studyId = searchParams.get('study_id')
    if (!subjectId || !studyId) {
      return NextResponse.json({ error: 'subject_id and study_id are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const { data, error } = await supabase
      .from('subject_sections')
      .select('id, subject_id, study_section_id, anchor_date, ended_at, study_sections(code, name, order_index)')
      .eq('subject_id', subjectId)
      .order('started_at', { ascending: true })

    if (error) {
      logger.error('Error fetching subject sections', error)
      return NextResponse.json({ error: 'Failed to fetch subject sections' }, { status: 500 })
    }

    return NextResponse.json({ sections: data || [] })
  } catch (error) {
    logger.error('API error in subject-sections GET', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

