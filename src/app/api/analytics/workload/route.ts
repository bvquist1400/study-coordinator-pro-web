import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

interface StudyMeta {
  id: string
  protocol_number: string
  study_title: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  site_id: string | null
  user_id: string
  created_at: string
  meeting_admin_points?: number | null
}

interface WorkloadResponse {
  studyId: string
  protocolNumber: string
  studyTitle: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  lifecycleWeight: number
  recruitmentWeight: number
  screeningMultiplier: number
  queryMultiplier: number
  screeningMultiplierEffective: number
  queryMultiplierEffective: number
  meetingAdminPoints: number
  meetingAdminPointsAdjusted: number
  protocolScore: number
  now: {
    raw: number
    weighted: number
  }
  actuals: {
    raw: number
    weighted: number
  }
  forecast: {
    raw: number
    weighted: number
  }
  metrics: {
    contributors: number
    avgMeetingHours: number
    avgScreeningHours: number
    avgScreeningStudyCount: number
    avgQueryHours: number
    avgQueryStudyCount: number
    screeningScale: number
    queryScale: number
    meetingPointsAdjustment: number
    entries: number
    lastWeekStart: string | null
  }
}

const METRICS_LOOKBACK_DAYS = 28
const SCREENING_BASELINE_HOURS = 4
const QUERY_BASELINE_HOURS = 3
const METRICS_SCALE_MIN = 0.6
const METRICS_SCALE_MAX = 1.8
const MEETING_BASELINE_HOURS = 2
const MEETING_POINTS_PER_WEEK_HOUR = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]

  try {
    let supabase
    try {
      supabase = createSupabaseAdmin(token)
    } catch (error) {
      logger.error('Supabase admin client misconfigured for workload analytics', error as any)
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[], warning: 'Supabase admin configuration missing' })
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Resolve accessible studies (site membership or direct ownership)
    const { data: memberships, error: membershipsError } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (membershipsError) {
      logger.error('Error fetching site memberships for workload analytics', membershipsError)
      return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
    }

    const memberRows = (memberships || []) as Array<{ site_id: string | null }>

    const siteIds = memberRows
      .map((row) => row.site_id)
      .filter((id): id is string => !!id)

    const baseQuery = supabase
      .from('studies')
      .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, created_at, meeting_admin_points')
      .order('created_at', { ascending: false })

    const filteredQuery = siteIds.length > 0
      ? baseQuery.in('site_id', siteIds)
      : baseQuery.eq('user_id', user.id)

    let { data: studies, error: studiesError } = await filteredQuery

    if (studiesError?.code === '42703') {
      const fallbackQuery = supabase
        .from('studies')
        .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, created_at')
        .order('created_at', { ascending: false })

      const retryQuery = siteIds.length > 0
        ? fallbackQuery.in('site_id', siteIds)
        : fallbackQuery.eq('user_id', user.id)

      const retry = await retryQuery
      studies = retry.data as any
      studiesError = retry.error
    }

    if (studiesError) {
      logger.error('Error fetching studies for workload analytics', studiesError)
      return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
    }

    if (!studies || studies.length === 0) {
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[] })
    }

    const studyRows = studies as StudyMeta[]
    const studyIds = studyRows.map((study) => study.id)

    const lookbackDate = new Date()
    lookbackDate.setDate(lookbackDate.getDate() - METRICS_LOOKBACK_DAYS)
    const lookbackISO = lookbackDate.toISOString().slice(0, 10)

    const [
      { data: weightRows, error: weightsError },
      { data: nowRows, error: nowError },
      { data: actualRows, error: actualError },
      { data: forecastRows, error: forecastError }
    ] = await Promise.all([
      supabase
        .from('cwe_weights' as any)
        .select('study_id, lifecycle_w, recruitment_w, ps, sm, qm')
        .in('study_id', studyIds),
      supabase
        .from('cwe_now' as any)
        .select('study_id, raw_now')
        .in('study_id', studyIds),
      supabase
        .from('cwe_actuals' as any)
        .select('study_id, raw_actuals')
        .in('study_id', studyIds),
      supabase
        .from('cwe_forecast_4w' as any)
        .select('study_id, raw_forecast')
        .in('study_id', studyIds)
    ])

    const { data: assignmentsRaw, error: assignmentsError } = await supabase
      .from('study_coordinators' as any)
      .select('study_id, coordinator_id')
      .in('study_id', studyIds)

    if (assignmentsError && assignmentsError.code !== '42P01') {
      logger.error('Error loading study coordinators', assignmentsError, { studyIds })
      return NextResponse.json({ error: 'Failed to load study coordinators' }, { status: 500 })
    }

    let metricsRows: any[] = []
    let metricsError: any = null
    const metricsResult = await supabase
      .from('coordinator_metrics' as any)
      .select('coordinator_id, week_start, meeting_hours, screening_hours, screening_study_count, query_hours, query_study_count')
      .gte('week_start', lookbackISO)

    metricsRows = metricsResult.data ?? []
    metricsError = metricsResult.error

    if (metricsError?.code === '42703') {
      const fallback = await supabase
        .from('coordinator_metrics' as any)
        .select('coordinator_id, week_start, screening_hours, query_hours, admin_hours')
        .gte('week_start', lookbackISO)
      metricsRows = (fallback.data ?? []).map((row: any) => ({
        coordinator_id: row.coordinator_id,
        week_start: row.week_start,
        meeting_hours: Number(row.meeting_hours ?? row.admin_hours ?? 0),
        screening_hours: Number(row.screening_hours ?? 0),
        screening_study_count: Number(row.screening_study_count ?? 0),
        query_hours: Number(row.query_hours ?? 0),
        query_study_count: Number(row.query_study_count ?? 0)
      }))
      metricsError = fallback.error
    }

    const missingRelation = (err: any) => {
      const code = err?.code
      return code === '42P01'
    }

    if (weightsError && missingRelation(weightsError)) {
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[] })
    }

    if (weightsError || nowError || actualError || forecastError || (metricsError && !missingRelation(metricsError))) {
      logger.error('Error loading CWE workload metrics', undefined, {
        errors: [weightsError, nowError, actualError, forecastError, metricsError]
          .filter(Boolean)
          .map(err => ({ code: err?.code, message: err?.message }))
      })
      return NextResponse.json({ error: 'Failed to load workload metrics' }, { status: 500 })
    }

    const weightsMap = new Map<string, any>((weightRows || []).map((row: any) => [row.study_id, row ?? {}]))
    const nowMap = nowError && missingRelation(nowError)
      ? new Map<string, number>()
      : new Map<string, number>((nowRows || []).map((row: any) => [row.study_id, Number(row.raw_now) || 0]))
    const actualMap = actualError && missingRelation(actualError)
      ? new Map<string, number>()
      : new Map<string, number>((actualRows || []).map((row: any) => [row.study_id, Number(row.raw_actuals) || 0]))
    const forecastMap = forecastError && missingRelation(forecastError)
      ? new Map<string, number>()
      : new Map<string, number>((forecastRows || []).map((row: any) => [row.study_id, Number(row.raw_forecast) || 0]))

    const assignmentsByStudy = new Map<string, Set<string>>()
    const assignmentsByCoordinator = new Map<string, Set<string>>()
    for (const assignment of assignmentsRaw || []) {
      const studyId = (assignment as any)?.study_id as string | null
      const coordinatorId = (assignment as any)?.coordinator_id as string | null
      if (!studyId || !coordinatorId) continue
      if (!assignmentsByStudy.has(studyId)) {
        assignmentsByStudy.set(studyId, new Set())
      }
      assignmentsByStudy.get(studyId)!.add(coordinatorId)

      if (!assignmentsByCoordinator.has(coordinatorId)) {
        assignmentsByCoordinator.set(coordinatorId, new Set())
      }
      assignmentsByCoordinator.get(coordinatorId)!.add(studyId)
    }

    const coordinatorTotals = new Map<string, {
      meetingTotal: number
      screeningTotal: number
      screeningCountTotal: number
      queryTotal: number
      queryCountTotal: number
      entries: number
      lastWeekStart: string | null
    }>()

    if (!(metricsError && missingRelation(metricsError))) {
      for (const row of metricsRows || []) {
        const coordinatorId = (row as any)?.coordinator_id as string | null
        if (!coordinatorId) continue
        const meeting = Number((row as any)?.meeting_hours ?? 0)
        const screening = Number((row as any)?.screening_hours ?? 0)
        const screeningCount = Number((row as any)?.screening_study_count ?? 0)
        const query = Number((row as any)?.query_hours ?? 0)
        const queryCount = Number((row as any)?.query_study_count ?? 0)
        const weekStart = (row as any)?.week_start as string | null
        const aggregate = coordinatorTotals.get(coordinatorId) ?? {
          meetingTotal: 0,
          screeningTotal: 0,
          screeningCountTotal: 0,
          queryTotal: 0,
          queryCountTotal: 0,
          entries: 0,
          lastWeekStart: null as string | null
        }
        aggregate.meetingTotal += meeting
        aggregate.screeningTotal += screening
        aggregate.screeningCountTotal += screeningCount
        aggregate.queryTotal += query
        aggregate.queryCountTotal += queryCount
        aggregate.entries += 1
        if (weekStart && (!aggregate.lastWeekStart || weekStart > aggregate.lastWeekStart)) {
          aggregate.lastWeekStart = weekStart
        }
        coordinatorTotals.set(coordinatorId, aggregate)
      }
    }

    const coordinatorAverages = new Map<string, {
      avgMeetingHours: number
      avgScreeningHours: number
      avgScreeningStudyCount: number
      avgQueryHours: number
      avgQueryStudyCount: number
      entries: number
      lastWeekStart: string | null
    }>()

    for (const [coordinatorId, totals] of coordinatorTotals.entries()) {
      const divisor = totals.entries > 0 ? totals.entries : 1
      coordinatorAverages.set(coordinatorId, {
        avgMeetingHours: totals.meetingTotal / divisor,
        avgScreeningHours: totals.screeningTotal / divisor,
        avgScreeningStudyCount: totals.screeningCountTotal / divisor,
        avgQueryHours: totals.queryTotal / divisor,
        avgQueryStudyCount: totals.queryCountTotal / divisor,
        entries: totals.entries,
        lastWeekStart: totals.lastWeekStart
      })
    }

    const workloads: WorkloadResponse[] = studyRows.map((study) => {
      const weights = weightsMap.get(study.id) ?? {}
      const lifecycleWeight = Number(weights.lifecycle_w ?? 1)
      const recruitmentWeight = Number(weights.recruitment_w ?? 1)
      const screeningMultiplier = Number(weights.sm ?? 1)
      const queryMultiplier = Number(weights.qm ?? 1)
      const meetingAdminPoints = Number((study as any)?.meeting_admin_points ?? 0)
      const protocolScore = Number(weights.ps ?? 0)

      const assignedCoordinators = Array.from(assignmentsByStudy.get(study.id) ?? new Set<string>())

      let distributedMeetingHours = 0
      let distributedScreeningHours = 0
      let distributedScreeningStudies = 0
      let distributedQueryHours = 0
      let distributedQueryStudies = 0
      let totalEntries = 0
      let lastWeekStart: string | null = null
      let contributorCount = 0

      for (const coordinatorId of assignedCoordinators) {
        const coordinatorMetrics = coordinatorAverages.get(coordinatorId)
        if (!coordinatorMetrics) continue
        const assignedStudiesForCoordinator = assignmentsByCoordinator.get(coordinatorId)
        const coverageBase = Math.max(
          1,
          coordinatorMetrics.avgScreeningStudyCount || coordinatorMetrics.avgQueryStudyCount || assignedStudiesForCoordinator?.size || assignedCoordinators.length || 1
        )

        distributedMeetingHours += coordinatorMetrics.avgMeetingHours / coverageBase
        distributedScreeningHours += coordinatorMetrics.avgScreeningHours / coverageBase
        distributedQueryHours += coordinatorMetrics.avgQueryHours / coverageBase

        const screeningStudyPortion = coordinatorMetrics.avgScreeningStudyCount > 0
          ? coordinatorMetrics.avgScreeningStudyCount / coverageBase
          : (assignedCoordinators.length > 0 ? 1 / assignedCoordinators.length : 0)
        const queryStudyPortion = coordinatorMetrics.avgQueryStudyCount > 0
          ? coordinatorMetrics.avgQueryStudyCount / coverageBase
          : (assignedCoordinators.length > 0 ? 1 / assignedCoordinators.length : 0)

        distributedScreeningStudies += screeningStudyPortion
        distributedQueryStudies += queryStudyPortion
        totalEntries += coordinatorMetrics.entries
        contributorCount += 1
        if (coordinatorMetrics.lastWeekStart && (!lastWeekStart || coordinatorMetrics.lastWeekStart > lastWeekStart)) {
          lastWeekStart = coordinatorMetrics.lastWeekStart
        }
      }

      const avgMeetingHours = distributedMeetingHours
      const avgScreeningHours = distributedScreeningHours
      const avgScreeningStudyCount = distributedScreeningStudies
      const avgQueryHours = distributedQueryHours
      const avgQueryStudyCount = distributedQueryStudies

      const screeningScale = contributorCount > 0
        ? clamp(avgScreeningHours / SCREENING_BASELINE_HOURS, METRICS_SCALE_MIN, METRICS_SCALE_MAX)
        : 1
      const queryScale = contributorCount > 0
        ? clamp(avgQueryHours / QUERY_BASELINE_HOURS, METRICS_SCALE_MIN, METRICS_SCALE_MAX)
        : 1
      const meetingPointsAdjustmentRaw = contributorCount > 0
        ? (avgMeetingHours - MEETING_BASELINE_HOURS) * MEETING_POINTS_PER_WEEK_HOUR
        : 0
      const meetingPointsAdjustment = Math.round((Math.min(Math.max(meetingPointsAdjustmentRaw, -40), 40)) * 100) / 100

      const effectiveScreeningMultiplier = screeningMultiplier * screeningScale
      const effectiveQueryMultiplier = queryMultiplier * queryScale
      const factor = lifecycleWeight * recruitmentWeight * effectiveScreeningMultiplier * effectiveQueryMultiplier

      const rawNow = nowMap.get(study.id) ?? 0
      const rawActuals = actualMap.get(study.id) ?? 0
      const rawForecast = forecastMap.get(study.id) ?? 0
      const meetingAdjustedRawNow = rawNow + meetingPointsAdjustment

      const roundTwo = (value: number) => Math.round(value * 100) / 100
      const weighted = (raw: number) => roundTwo(raw * factor)

      return {
        studyId: study.id,
        protocolNumber: study.protocol_number,
        studyTitle: study.study_title,
        lifecycle: study.lifecycle,
        recruitment: study.recruitment ?? study.status,
        status: study.status,
        lifecycleWeight,
        recruitmentWeight,
        screeningMultiplier,
        queryMultiplier,
        screeningMultiplierEffective: roundTwo(effectiveScreeningMultiplier),
        queryMultiplierEffective: roundTwo(effectiveQueryMultiplier),
        meetingAdminPoints,
        meetingAdminPointsAdjusted: roundTwo(meetingAdminPoints + meetingPointsAdjustment),
        protocolScore,
        now: {
          raw: roundTwo(meetingAdjustedRawNow),
          weighted: weighted(meetingAdjustedRawNow)
        },
        actuals: {
          raw: roundTwo(rawActuals),
          weighted: weighted(rawActuals)
        },
        forecast: {
          raw: roundTwo(rawForecast),
          weighted: weighted(rawForecast)
        },
        metrics: {
          contributors: contributorCount,
          avgMeetingHours: roundTwo(avgMeetingHours),
          avgScreeningHours: roundTwo(avgScreeningHours),
          avgScreeningStudyCount: roundTwo(avgScreeningStudyCount),
          avgQueryHours: roundTwo(avgQueryHours),
          avgQueryStudyCount: roundTwo(avgQueryStudyCount),
          screeningScale: roundTwo(screeningScale),
          queryScale: roundTwo(queryScale),
          meetingPointsAdjustment,
          entries: totalEntries,
          lastWeekStart
        }
      }
    })

    return NextResponse.json({ workloads })
  } catch (error) {
    logger.error('Unexpected error in workload analytics API', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
