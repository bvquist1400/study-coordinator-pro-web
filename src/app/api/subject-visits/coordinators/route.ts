export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

interface CoordinatorAssignmentPayload {
  visitIds?: string[]
  coordinatorIds?: string[]
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const supabase = createSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const subjectId = searchParams.get('subjectId')

    if (!subjectId) {
      return NextResponse.json({ error: 'subjectId is required' }, { status: 400 })
    }

    const { data: subjectRow, error: subjectError } = await supabase
      .from('subjects')
      .select('id, study_id, studies(site_id, user_id)')
      .eq('id', subjectId)
      .single()

    if (subjectError || !subjectRow) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    const subject: any = subjectRow
    const studyMeta: any = subject.studies

    if (studyMeta?.site_id) {
      const { data: membership } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', studyMeta.site_id)
        .eq('user_id', auth.user.id)
        .maybeSingle()

      if (!membership && studyMeta.user_id !== auth.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (studyMeta?.user_id && studyMeta.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('subject_visit_coordinators' as any)
      .select(`
        subject_visit_id,
        coordinator_id,
        role,
        created_at,
        subject_visits!inner(subject_id),
        user_profiles:coordinator_id(full_name, email)
      `)
      .eq('subject_visits.subject_id', subjectId)

    if (assignmentsError) {
      logger.error('Failed to load visit coordinator assignments', assignmentsError as any, { subjectId })
      return NextResponse.json({ error: 'Failed to load coordinator assignments' }, { status: 500 })
    }

    const assignments = (assignmentRows ?? []).map((row: any) => ({
      visitId: row.subject_visit_id as string,
      coordinatorId: row.coordinator_id as string,
      role: row.role ?? null,
      assignedAt: row.created_at,
      name: row.user_profiles?.full_name ?? row.user_profiles?.email ?? 'Unknown coordinator',
      email: row.user_profiles?.email ?? null
    }))

    return NextResponse.json({ assignments })
  } catch (error) {
    logger.error('Unexpected error loading visit coordinator assignments', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const payload = (await request.json()) as CoordinatorAssignmentPayload | null
    const visitIds = Array.isArray(payload?.visitIds)
      ? payload!.visitIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const coordinatorIds = Array.isArray(payload?.coordinatorIds)
      ? payload!.coordinatorIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const uniqueCoordinatorIds = Array.from(new Set(coordinatorIds))

    if (visitIds.length === 0) {
      return NextResponse.json({ error: 'At least one visitId is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    const { data: visitRows, error: visitError } = await supabase
      .from('subject_visits')
      .select('id, study_id')
      .in('id', visitIds)

    if (visitError) {
      logger.error('Failed to load subject visits for coordinator assignment', visitError as any, { visitIds })
      return NextResponse.json({ error: 'Failed to load subject visits' }, { status: 500 })
    }

    if (!visitRows || visitRows.length === 0) {
      return NextResponse.json({ error: 'Subject visits not found' }, { status: 404 })
    }

    const uniqueStudyIds = Array.from(new Set((visitRows as Array<{ study_id: string | null }>).
      map((row) => row.study_id).
      filter((id): id is string => typeof id === 'string' && id.length > 0)))

    if (uniqueStudyIds.length !== 1) {
      return NextResponse.json({ error: 'Visits must belong to the same study' }, { status: 400 })
    }

    const studyId = uniqueStudyIds[0]

    const { data: studyRow, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', studyId)
      .single()

    if (studyError || !studyRow) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    const study: any = studyRow
    if (study.site_id) {
      const { data: membership } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', auth.user.id)
        .maybeSingle()

      if (!membership && study.user_id !== auth.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('subject_visit_coordinators' as any)
      .delete()
      .in('subject_visit_id', visitIds)

    if (deleteError) {
      logger.error('Failed to clear existing visit coordinator assignments', deleteError as any, { visitIds })
      return NextResponse.json({ error: 'Failed to update coordinator assignments' }, { status: 500 })
    }

    if (uniqueCoordinatorIds.length > 0) {
      const rows = visitIds.flatMap((visitId) =>
        uniqueCoordinatorIds.map((coordinatorId) => ({
          subject_visit_id: visitId,
          coordinator_id: coordinatorId,
          assigned_by: auth.user!.id
        }))
      )

      const { error: insertError } = await supabase
        .from('subject_visit_coordinators' as any)
        .insert(rows)

      if (insertError) {
        logger.error('Failed to insert visit coordinator assignments', insertError as any, { visitIds, coordinatorIds })
        return NextResponse.json({ error: 'Failed to update coordinator assignments' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('Unexpected error assigning visit coordinators', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
