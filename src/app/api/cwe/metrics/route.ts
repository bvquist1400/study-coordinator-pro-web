import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

const MAX_RECENT_WEEKS = 12

interface MetricsBreakdownPayload {
  studyId?: string
  study_id?: string
  meetingHours?: unknown
  screeningHours?: unknown
  queryHours?: unknown
  notes?: unknown
}

interface MetricsBreakdownRow {
  id: string
  studyId: string
  weekStart: string
  meetingHours: number
  screeningHours: number
  queryHours: number
  notes: string | null
  updatedAt: string | null
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

const sanitizeBreakdownEntries = (entries: unknown): Array<{
  studyId: string
  meetingHours: number
  screeningHours: number
  queryHours: number
  notes: string | null
}> => {
  if (!Array.isArray(entries)) return []

  const sanitized: Array<{
    studyId: string
    meetingHours: number
    screeningHours: number
    queryHours: number
    notes: string | null
  }> = []

  for (const entry of entries as MetricsBreakdownPayload[]) {
    if (!entry || typeof entry !== 'object') continue
    const studyId = typeof entry.studyId === 'string'
      ? entry.studyId
      : typeof entry.study_id === 'string'
      ? entry.study_id
      : null
    if (!studyId) continue

    const meeting = toNumber(entry.meetingHours)
    const screening = toNumber(entry.screeningHours)
    const query = toNumber(entry.queryHours)
    const notesRaw = typeof entry.notes === 'string' ? entry.notes : null
    const notes = notesRaw ? notesRaw.trim() : null

    const meetingHours = meeting !== null && meeting >= 0 ? Number(meeting.toFixed(2)) : 0
    const screeningHours = screening !== null && screening >= 0 ? Number(screening.toFixed(2)) : 0
    const queryHours = query !== null && query >= 0 ? Number(query.toFixed(2)) : 0

    if (meetingHours === 0 && screeningHours === 0 && queryHours === 0 && (!notes || notes.length === 0)) {
      continue
    }

    sanitized.push({
      studyId,
      meetingHours,
      screeningHours,
      queryHours,
      notes: notes && notes.length > 0 ? notes : null
    })
  }

  return sanitized
}

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

    let breakdownRows: Array<Record<string, any>> | null = null
    let breakdownError: any = null

    try {
      const breakdownResponse = await supabase
        .from('coordinator_metrics_notes' as any)
        .select('id, coordinator_id, study_id, week_start, meeting_hours, screening_hours, query_hours, notes, updated_at')
        .eq('coordinator_id', targetCoordinatorId)
        .order('week_start', { ascending: false })
        .limit(50)

      breakdownRows = breakdownResponse.data as Array<Record<string, any>> | null
      breakdownError = breakdownResponse.error
    } catch (err) {
      breakdownError = err
    }

    if (breakdownError?.code === '42P01') {
      breakdownRows = []
      breakdownError = null
    }

    if (breakdownError) {
      logger.warn('Failed to load coordinator metrics breakdown', {
        error: breakdownError as any,
        coordinatorId: targetCoordinatorId
      })
    }

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

    const breakdowns: MetricsBreakdownRow[] = (breakdownRows ?? []).map((row: any) => ({
      id: row.id,
      studyId: row.study_id,
      weekStart: row.week_start,
      meetingHours: Number(row.meeting_hours ?? 0),
      screeningHours: Number(row.screening_hours ?? 0),
      queryHours: Number(row.query_hours ?? 0),
      notes: row.notes ?? null,
      updatedAt: row.updated_at ?? null
    }))

    return NextResponse.json({ coordinatorId: targetCoordinatorId, metrics: normalizedMetrics, assignments, breakdowns })
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
  breakdown?: MetricsBreakdownPayload[]
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
    const breakdownEntries = sanitizeBreakdownEntries(payload?.breakdown ?? [])

    const rpcResult = await (supabase as any).rpc('save_coordinator_metrics_with_breakdown', {
      p_coordinator_id: targetCoordinatorId,
      p_recorded_by: auth.user.id,
      p_week_start: weekStart,
      p_meeting_hours: meetingHours,
      p_screening_hours: screeningHours,
      p_screening_study_count: screeningStudies,
      p_query_hours: queryHours,
      p_query_study_count: queryStudies,
      p_notes: notes,
      p_breakdown: breakdownEntries
    })

    let metricRow = rpcResult.data as Record<string, any> | null
    const rpcError = rpcResult.error

    if (rpcError && !['42883', '42P01', '42703'].includes(rpcError.code ?? '')) {
      logger.error('Failed to save coordinator metrics via RPC', rpcError as any, {
        coordinatorId: targetCoordinatorId,
        weekStart
      })
      return NextResponse.json({ error: 'Failed to save coordinator metrics' }, { status: 500 })
    }

    if (rpcError) {
      // Fallback for environments without the new function/table
      const fallbackUpsert = await supabase
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

      if (fallbackUpsert.error) {
        logger.error('Failed to save coordinator metrics (legacy path)', fallbackUpsert.error as any, {
          coordinatorId: targetCoordinatorId,
          weekStart
        })
        return NextResponse.json({ error: 'Failed to save coordinator metrics' }, { status: 500 })
      }

      metricRow = fallbackUpsert.data as Record<string, any> | null
    }

    const normalized = metricRow
      ? {
          ...metricRow,
          meeting_hours: metricRow.meeting_hours ?? metricRow.admin_hours ?? meetingHours,
          screening_study_count: metricRow.screening_study_count ?? screeningStudies,
          query_study_count: metricRow.query_study_count ?? queryStudies,
          recorded_by: metricRow.recorded_by ?? auth.user.id
        }
      : null

    return NextResponse.json({ metric: normalized })
  } catch (error) {
    logger.error('Unexpected error saving coordinator metrics', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
