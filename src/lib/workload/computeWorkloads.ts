import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import logger from '@/lib/logger'

export interface StudyMeta {
  id: string
  protocol_number: string
  study_title: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  site_id: string | null
  meeting_admin_points?: number | null
  user_id?: string | null
  created_at?: string | null
}

export interface WorkloadMetricsSummary {
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

export interface WorkloadResponse {
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
  metrics: WorkloadMetricsSummary
}

export interface ComputeWorkloadsParams {
  supabase: SupabaseClient<Database>
  studyRows: StudyMeta[]
  lookbackDays?: number
}

const METRICS_LOOKBACK_DEFAULT = 28
const SCREENING_BASELINE_HOURS = 4
const QUERY_BASELINE_HOURS = 3
const METRICS_SCALE_MIN = 0.6
const METRICS_SCALE_MAX = 1.8
const MEETING_BASELINE_HOURS = 2
const MEETING_POINTS_PER_WEEK_HOUR = 4

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const isMissingRelation = (err: { code?: string } | null | undefined) =>
  err?.code === '42P01'

export async function computeWorkloads({
  supabase,
  studyRows,
  lookbackDays = METRICS_LOOKBACK_DEFAULT
}: ComputeWorkloadsParams): Promise<WorkloadResponse[]> {
  if (studyRows.length === 0) {
    return []
  }

  const studyIds = studyRows.map(study => study.id)

  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)
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

  if (weightsError && isMissingRelation(weightsError)) {
    return []
  }

  if (
    weightsError ||
    (nowError && !isMissingRelation(nowError)) ||
    (actualError && !isMissingRelation(actualError)) ||
    (forecastError && !isMissingRelation(forecastError))
  ) {
    logger.error('Error loading CWE workload base datasets', undefined, {
      errors: [weightsError, nowError, actualError, forecastError]
        .filter(Boolean)
        .map(err => ({ code: err?.code, message: err?.message }))
    })
    throw new Error('Failed to load workload base datasets')
  }

  const weightsMap = new Map<string, any>(
    (weightRows || []).map((row: any) => [row.study_id, row ?? {}])
  )
  const nowMap = nowError && isMissingRelation(nowError)
    ? new Map<string, number>()
    : new Map<string, number>((nowRows || []).map((row: any) => [row.study_id, Number(row.raw_now) || 0]))
  const actualMap = actualError && isMissingRelation(actualError)
    ? new Map<string, number>()
    : new Map<string, number>((actualRows || []).map((row: any) => [row.study_id, Number(row.raw_actuals) || 0]))
  const forecastMap = forecastError && isMissingRelation(forecastError)
    ? new Map<string, number>()
    : new Map<string, number>((forecastRows || []).map((row: any) => [row.study_id, Number(row.raw_forecast) || 0]))

  const { data: assignmentsRaw, error: assignmentsError } = await supabase
    .from('study_coordinators' as any)
    .select('study_id, coordinator_id')
    .in('study_id', studyIds)

  if (assignmentsError && assignmentsError.code !== '42P01') {
    logger.error('Error loading study coordinators', assignmentsError, { studyIds })
    throw new Error('Failed to load study coordinator assignments')
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

  if (metricsError && !isMissingRelation(metricsError)) {
    logger.error('Error loading coordinator metrics for CWE workload', metricsError, { studyIds })
    throw new Error('Failed to load coordinator metrics')
  }

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

  if (!(metricsError && isMissingRelation(metricsError))) {
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

  const roundTwo = (value: number) => Math.round(value * 100) / 100
  const weightedValue = (raw: number, factor: number) => roundTwo(raw * factor)

  return studyRows.map((study) => {
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
        coordinatorMetrics.avgScreeningStudyCount ||
          coordinatorMetrics.avgQueryStudyCount ||
          assignedStudiesForCoordinator?.size ||
          assignedCoordinators.length ||
          1
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
    const meetingPointsAdjustment = roundTwo(Math.min(Math.max(meetingPointsAdjustmentRaw, -40), 40))

    const effectiveScreeningMultiplier = screeningMultiplier * screeningScale
    const effectiveQueryMultiplier = queryMultiplier * queryScale
    const factor = lifecycleWeight * recruitmentWeight * effectiveScreeningMultiplier * effectiveQueryMultiplier

    const rawNow = nowMap.get(study.id) ?? 0
    const rawActuals = actualMap.get(study.id) ?? 0
    const rawForecast = forecastMap.get(study.id) ?? 0
    const meetingAdjustedRawNow = rawNow + meetingPointsAdjustment

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
        weighted: weightedValue(meetingAdjustedRawNow, factor)
      },
      actuals: {
        raw: roundTwo(rawActuals),
        weighted: weightedValue(rawActuals, factor)
      },
      forecast: {
        raw: roundTwo(rawForecast),
        weighted: weightedValue(rawForecast, factor)
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
}
