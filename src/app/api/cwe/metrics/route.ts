import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

const MAX_RECENT_WEEKS = 12

export async function GET(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const targetCoordinatorId = searchParams.get('coordinatorId') ?? auth.user.id

    const supabase = createSupabaseAdmin()

    const metricsQuery = supabase
      .from('coordinator_metrics')
      .select('id, coordinator_id, recorded_by, week_start, meeting_hours, screening_hours, screening_study_count, query_hours, query_study_count, notes, created_at, updated_at')
      .eq('coordinator_id', targetCoordinatorId)
      .order('week_start', { ascending: false })
      .limit(MAX_RECENT_WEEKS)

    const metricsResponse = await metricsQuery
    let data = metricsResponse.data as Array<Record<string, any>> | null
    let error = metricsResponse.error

    if (error?.code === '42703') {
      const legacy = await supabase
        .from('coordinator_metrics')
        .select('id, coordinator_id, week_start, screening_hours, query_hours, admin_hours, notes, created_at, updated_at')
        .eq('coordinator_id', targetCoordinatorId)
        .order('week_start', { ascending: false })
        .limit(MAX_RECENT_WEEKS)

      const legacyRows = (legacy.data ?? []) as Array<Record<string, any>>
      data = legacyRows.map((row) => ({
        ...row,
        meeting_hours: row.meeting_hours ?? row.admin_hours ?? 0,
        recorded_by: row.recorded_by ?? row.coordinator_id,
        screening_study_count: row.screening_study_count ?? 0,
        query_study_count: row.query_study_count ?? 0
      }))
      error = legacy.error
    }

    if (error) {
      logger.error('Failed to load coordinator metrics', error as any, { coordinatorId: targetCoordinatorId })
      return NextResponse.json({ error: 'Failed to load coordinator metrics' }, { status: 500 })
    }

    const normalizedMetrics = (data ?? []).map((row: any) => ({
      id: row.id,
      coordinatorId: row.coordinator_id,
      recordedBy: row.recorded_by ?? row.coordinator_id,
      weekStart: row.week_start,
      meetingHours: Number(row.meeting_hours ?? row.admin_hours ?? 0),
      screeningHours: Number(row.screening_hours ?? 0),
      screeningStudyCount: Number(row.screening_study_count ?? 0),
      queryHours: Number(row.query_hours ?? 0),
      queryStudyCount: Number(row.query_study_count ?? 0),
      notes: row.notes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))

    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('study_coordinators' as any)
      .select('id, study_id, role, joined_at, studies!inner(id, study_title, protocol_number)')
      .eq('coordinator_id', targetCoordinatorId)

    if (assignmentsError && assignmentsError.code !== '42P01') {
      logger.error('Failed to load coordinator assignments', assignmentsError as any, { coordinatorId: targetCoordinatorId })
      return NextResponse.json({ error: 'Failed to load coordinator assignments' }, { status: 500 })
    }

    const assignments = (assignmentRows ?? []).map((row: any) => ({
      id: row.id,
      studyId: row.study_id,
      role: row.role ?? null,
      joinedAt: row.joined_at,
      study: row.studies
        ? {
            id: row.studies.id,
            studyTitle: row.studies.study_title,
            protocolNumber: row.studies.protocol_number
          }
        : null
    }))

    return NextResponse.json({ coordinatorId: targetCoordinatorId, metrics: normalizedMetrics, assignments })
  } catch (error) {
    logger.error('Unexpected error loading coordinator metrics', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface MetricsPayload {
  coordinatorId?: string
  weekStart?: string
  meetingHours?: number
  screeningHours?: number
  screeningStudyCount?: number
  queryHours?: number
  queryStudyCount?: number
  notes?: string | null
}

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const normalizeHours = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Number(value.toFixed(2))
  }
  return fallback
}

const normalizeCount = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  return fallback
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const payload = (await request.json()) as MetricsPayload | null
    const targetCoordinatorId = payload?.coordinatorId ?? auth.user.id
    const weekStart = payload?.weekStart

    if (!weekStart) {
      return NextResponse.json({ error: 'weekStart is required' }, { status: 400 })
    }

    if (!isValidDate(weekStart)) {
      return NextResponse.json({ error: 'weekStart must be formatted as YYYY-MM-DD' }, { status: 400 })
    }

    const meetingHours = normalizeHours(payload?.meetingHours)
    const screeningHours = normalizeHours(payload?.screeningHours)
    const screeningStudies = normalizeCount(payload?.screeningStudyCount)
    const queryHours = normalizeHours(payload?.queryHours)
    const queryStudies = normalizeCount(payload?.queryStudyCount)
    const notes = typeof payload?.notes === 'string' ? payload?.notes : null

    const supabase = createSupabaseAdmin()

    const upsertResponse = await supabase
      .from('coordinator_metrics')
      .upsert(
        {
          coordinator_id: targetCoordinatorId,
          recorded_by: auth.user.id,
          week_start: weekStart,
          meeting_hours: meetingHours,
          screening_hours: screeningHours,
          screening_study_count: screeningStudies,
          query_hours: queryHours,
          query_study_count: queryStudies,
          notes
        },
        { onConflict: 'coordinator_id,week_start' }
      )
      .select('id, coordinator_id, recorded_by, week_start, meeting_hours, screening_hours, screening_study_count, query_hours, query_study_count, notes, created_at, updated_at')
      .single()
    let data = upsertResponse.data as Record<string, any> | null
    let error = upsertResponse.error

    if (error?.code === '42703') {
      const legacy = await supabase
        .from('coordinator_metrics')
        .upsert(
          {
            coordinator_id: targetCoordinatorId,
            week_start: weekStart,
            screening_hours: screeningHours,
            query_hours: queryHours,
            admin_hours: meetingHours,
            notes
          },
          { onConflict: 'coordinator_id,week_start' }
        )
        .select('id, coordinator_id, week_start, screening_hours, query_hours, admin_hours, notes, created_at, updated_at')
        .single()
      error = legacy.error
      const legacyData = legacy.data as Record<string, any> | null
      if (!error && legacyData) {
        data = {
          ...legacyData,
          meeting_hours: legacyData.meeting_hours ?? legacyData.admin_hours ?? meetingHours,
          screening_study_count: legacyData.screening_study_count ?? screeningStudies,
          query_study_count: legacyData.query_study_count ?? queryStudies,
          recorded_by: auth.user.id
        }
      } else {
        data = legacyData
      }
    }

    if (error) {
      logger.error('Failed to save coordinator metrics', error as any, {
        coordinatorId: targetCoordinatorId,
        weekStart
      })
      return NextResponse.json({ error: 'Failed to save coordinator metrics' }, { status: 500 })
    }

    const normalized = data
      ? {
          ...data,
          meeting_hours: data.meeting_hours ?? data.admin_hours ?? meetingHours,
          screening_study_count: data.screening_study_count ?? screeningStudies,
          query_study_count: data.query_study_count ?? queryStudies,
          recorded_by: data.recorded_by ?? auth.user.id
        }
      : null

    return NextResponse.json({ metric: normalized })
  } catch (error) {
    logger.error('Unexpected error saving coordinator metrics', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
