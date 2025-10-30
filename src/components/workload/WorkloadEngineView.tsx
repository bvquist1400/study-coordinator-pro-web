'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { TooltipProps } from 'recharts'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area
} from 'recharts'
import { supabase } from '@/lib/supabase/client'
import { formatLifecycleStage, formatRecruitmentStatus, formatStudyStatus } from '@/constants/studyStatus'

interface WorkloadBreakdownCoordinator {
  coordinatorId: string
  meetingHours: number
  screeningHours: number
  queryHours: number
  totalHours: number
  notesCount: number
  lastUpdatedAt: string | null
}

interface WorkloadBreakdownWeek {
  weekStart: string
  coordinators: WorkloadBreakdownCoordinator[]
  totals: {
    meetingHours: number
    screeningHours: number
    queryHours: number
    totalHours: number
    notesCount: number
  }
}

interface WorkloadRecord {
  studyId: string
  protocolNumber: string
  studyTitle: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  lifecycleWeight: number
  recruitmentWeight: number
  screeningMultiplier: number
  screeningMultiplierEffective: number
  queryMultiplier: number
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
  breakdown?: {
    weeks: WorkloadBreakdownWeek[]
  }
}

interface CoordinatorAssignment {
  id: string
  studyTitle: string
  protocolNumber: string
  role: string | null
  joinedAt: string
}

interface CoordinatorOption {
  id: string
  name: string
  email: string | null
  organization: string | null
  assignments: CoordinatorAssignment[]
}

interface CoordinatorMetricsSnapshot {
  id: string
  weekStart: string
  meetingHours: number
  screeningHours: number
  screeningStudyCount: number
  queryHours: number
  queryStudyCount: number
  notes: string | null
  updatedAt: string
}

interface AssignmentLogRow {
  assignmentId: string
  studyId: string
  studyTitle: string
  protocolNumber: string
  meetings: string
  screening: string
  queries: string
  notes: string
}

interface AssignmentBreakdown {
  studyId: string
  weekStart: string | null
  meetingHours: number
  screeningHours: number
  queryHours: number
  notes: string | null
}

interface TrendPoint {
  weekStart: string
  actual: number
  forecast: number
}

type BreakdownTooltipDatum = {
  meetingHours: number
  screeningHours: number
  queryHours: number
  totalHours: number
  notesCount: number
  coordinators: WorkloadBreakdownCoordinator[]
}

type BreakdownTooltipProps = TooltipProps<string | number, string> & {
  payload?: Array<{ payload?: BreakdownTooltipDatum }>
  label?: string | number
}

const STEP_ITEMS = [
  { label: 'Review', description: 'Scan KPIs and trends' },
  { label: 'Identify', description: 'Spot overloads fast' },
  { label: 'Configure', description: 'Tune protocol settings' },
  { label: 'Log', description: 'Capture weekly effort' }
] as const

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/20',
  enrolling: 'bg-blue-500/15 text-blue-200 border border-blue-500/20',
  paused: 'bg-amber-500/15 text-amber-200 border border-amber-500/20',
  on_hold: 'bg-orange-500/15 text-orange-200 border border-orange-500/20',
  closed_to_accrual: 'bg-gray-500/15 text-gray-200 border border-gray-500/20',
  follow_up: 'bg-purple-500/15 text-purple-200 border border-purple-500/20'
}

const LOAD_BANDS = [
  { threshold: 300, label: 'Critical', className: 'bg-red-500/20 text-red-200 border border-red-500/30' },
  { threshold: 220, label: 'High', className: 'bg-orange-500/20 text-orange-200 border border-orange-500/30' },
  { threshold: 150, label: 'Elevated', className: 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30' }
]

const getLoadBadge = (value: number) => {
  for (const band of LOAD_BANDS) {
    if (value >= band.threshold) return { label: band.label, className: band.className }
  }
  return { label: 'Balanced', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/25' }
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits

const toHours = (value: string) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

export default function WorkloadEngineView() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workloads, setWorkloads] = useState<WorkloadRecord[]>([])
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([])
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<CoordinatorMetricsSnapshot[]>([])
  const [assignmentRows, setAssignmentRows] = useState<AssignmentLogRow[]>([])
  const [weekStart, setWeekStart] = useState<string>(() => getMondayISO(new Date()))
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [latestBreakdown, setLatestBreakdown] = useState<Record<string, AssignmentBreakdown>>({})
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [trendError, setTrendError] = useState<string | null>(null)
  const [selectedBreakdownStudyId, setSelectedBreakdownStudyId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setTrendError(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('You must be signed in to view workload analytics.')
      }

      const [workloadResponse, coordinatorResponse, trendResponse] = await Promise.all([
        fetch('/api/analytics/workload?includeBreakdown=true', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/coordinators', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/analytics/workload/trend', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      if (!workloadResponse.ok) {
        throw new Error('Failed to load workload analytics')
      }

      if (!coordinatorResponse.ok) {
        throw new Error('Failed to load coordinators')
      }

      if (!trendResponse.ok) {
        const body = await trendResponse.json().catch(() => null)
        setTrendError(body?.error ?? 'Failed to load trend data')
      }

      const workloadPayload = await workloadResponse.json()
      const coordinatorPayload = await coordinatorResponse.json()
      const trendPayload = trendResponse.ok ? await trendResponse.json() : { points: [] }

      const normalizedWorkloads = (workloadPayload.workloads || []).map((entry: any) => {
        const weeks: WorkloadBreakdownWeek[] = Array.isArray(entry?.breakdown?.weeks)
          ? (entry.breakdown.weeks as any[])
              .map((week: any) => {
                if (!week || typeof week !== 'object') return null
                const weekStart = week.weekStart ?? week.week_start ?? ''
                if (!weekStart) return null

                const coordinators: WorkloadBreakdownCoordinator[] = Array.isArray(week?.coordinators)
                  ? week.coordinators
                      .map((coordinator: any) => ({
                        coordinatorId: coordinator.coordinatorId ?? coordinator.coordinator_id ?? '',
                        meetingHours: Number(coordinator.meetingHours ?? coordinator.meeting_hours ?? 0),
                        screeningHours: Number(coordinator.screeningHours ?? coordinator.screening_hours ?? 0),
                        queryHours: Number(coordinator.queryHours ?? coordinator.query_hours ?? 0),
                        totalHours: Number(coordinator.totalHours ?? coordinator.total_hours ?? 0),
                        notesCount: Number(coordinator.notesCount ?? coordinator.notes_count ?? 0),
                        lastUpdatedAt: coordinator.lastUpdatedAt ?? coordinator.last_updated_at ?? null
                      }))
                      .filter((coord: WorkloadBreakdownCoordinator) => !!coord.coordinatorId)
                  : []

                const meetingHours = Number(week?.totals?.meetingHours ?? week?.totals?.meeting_hours ?? week?.meetingHours ?? week?.meeting_hours ?? 0)
                const screeningHours = Number(week?.totals?.screeningHours ?? week?.totals?.screening_hours ?? week?.screeningHours ?? week?.screening_hours ?? 0)
                const queryHours = Number(week?.totals?.queryHours ?? week?.totals?.query_hours ?? week?.queryHours ?? week?.query_hours ?? 0)
                const totalHours = Number(week?.totals?.totalHours ?? week?.totals?.total_hours ?? week?.totalHours ?? week?.total_hours ?? meetingHours + screeningHours + queryHours)
                const notesCount = Number(week?.totals?.notesCount ?? week?.totals?.notes_count ?? week?.notesCount ?? week?.notes_count ?? 0)

                return {
                  weekStart,
                  coordinators,
                  totals: {
                    meetingHours,
                    screeningHours,
                    queryHours,
                    totalHours,
                    notesCount
                  }
                } satisfies WorkloadBreakdownWeek
              })
              .filter((week: WorkloadBreakdownWeek | null): week is WorkloadBreakdownWeek => !!week)
          : []

        return {
          ...entry,
          lifecycleWeight: Number(entry.lifecycleWeight ?? entry.lifecycle_weight ?? 1),
          recruitmentWeight: Number(entry.recruitmentWeight ?? entry.recruitment_weight ?? 1),
          screeningMultiplier: Number(entry.screeningMultiplier ?? entry.screening_multiplier ?? 1),
          screeningMultiplierEffective: Number(entry.screeningMultiplierEffective ?? entry.screening_multiplier_effective ?? entry.screeningMultiplier ?? 1),
          queryMultiplier: Number(entry.queryMultiplier ?? entry.query_multiplier ?? 1),
          queryMultiplierEffective: Number(entry.queryMultiplierEffective ?? entry.query_multiplier_effective ?? entry.queryMultiplier ?? 1),
          meetingAdminPoints: Number(entry.meetingAdminPoints ?? entry.meeting_admin_points ?? 0),
          meetingAdminPointsAdjusted: Number(entry.meetingAdminPointsAdjusted ?? entry.meeting_admin_points_adjusted ?? entry.meetingAdminPoints ?? 0),
          protocolScore: Number(entry.protocolScore ?? entry.protocol_score ?? 0),
          now: {
            raw: Number(entry?.now?.raw ?? entry?.now?.raw_now ?? 0),
            weighted: Number(entry?.now?.weighted ?? entry?.now?.weighted_now ?? entry?.now?.raw ?? 0)
          },
          actuals: {
            raw: Number(entry?.actuals?.raw ?? entry?.actuals?.raw_actuals ?? 0),
            weighted: Number(entry?.actuals?.weighted ?? entry?.actuals?.weighted_actuals ?? entry?.actuals?.raw ?? 0)
          },
          forecast: {
            raw: Number(entry?.forecast?.raw ?? entry?.forecast?.raw_forecast ?? 0),
            weighted: Number(entry?.forecast?.weighted ?? entry?.forecast?.weighted_forecast ?? entry?.forecast?.raw ?? 0)
          },
          metrics: {
            contributors: Number(entry?.metrics?.contributors ?? 0),
            avgMeetingHours: Number(entry?.metrics?.avgMeetingHours ?? entry?.metrics?.avg_meeting_hours ?? 0),
            avgScreeningHours: Number(entry?.metrics?.avgScreeningHours ?? entry?.metrics?.avg_screening_hours ?? 0),
            avgScreeningStudyCount: Number(entry?.metrics?.avgScreeningStudyCount ?? entry?.metrics?.avg_screening_study_count ?? 0),
            avgQueryHours: Number(entry?.metrics?.avgQueryHours ?? entry?.metrics?.avg_query_hours ?? 0),
            avgQueryStudyCount: Number(entry?.metrics?.avgQueryStudyCount ?? entry?.metrics?.avg_query_study_count ?? 0),
            screeningScale: Number(entry?.metrics?.screeningScale ?? entry?.metrics?.screening_scale ?? 1),
            queryScale: Number(entry?.metrics?.queryScale ?? entry?.metrics?.query_scale ?? 1),
            meetingPointsAdjustment: Number(entry?.metrics?.meetingPointsAdjustment ?? entry?.metrics?.meeting_points_adjustment ?? 0),
            entries: Number(entry?.metrics?.entries ?? 0),
            lastWeekStart: entry?.metrics?.lastWeekStart ?? entry?.metrics?.last_week_start ?? null
          },
          breakdown: weeks.length > 0 ? { weeks } : undefined
        }
      }) as WorkloadRecord[]

      const normalizedCoordinators = (coordinatorPayload.coordinators || []).map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        email: entry.email ?? null,
        organization: entry.organization ?? null,
        assignments: (entry.assignments || []).map((assignment: any) => ({
          id: assignment.id,
          studyTitle: assignment.studyTitle,
          protocolNumber: assignment.protocolNumber,
          role: assignment.role ?? null,
          joinedAt: assignment.joinedAt
        }))
      })) as CoordinatorOption[]

      setWorkloads(normalizedWorkloads)
      setCoordinators(normalizedCoordinators)
      setTrendPoints(
        (trendPayload.points || []).map((point: any) => ({
          weekStart: point.weekStart ?? point.week_start,
          actual: Number(point.actual ?? 0),
          forecast: Number(point.forecast ?? 0)
        }))
      )

      const studiesWithBreakdown = normalizedWorkloads.filter(
        (entry) => entry.breakdown && entry.breakdown.weeks.length > 0
      )

      if (!selectedBreakdownStudyId) {
        setSelectedBreakdownStudyId(studiesWithBreakdown[0]?.studyId ?? null)
      } else if (!studiesWithBreakdown.some((entry) => entry.studyId === selectedBreakdownStudyId)) {
        setSelectedBreakdownStudyId(studiesWithBreakdown[0]?.studyId ?? null)
      }

      if (!selectedCoordinatorId && normalizedCoordinators.length > 0) {
        setSelectedCoordinatorId(normalizedCoordinators[0].id)
      }
    } catch (err) {
      console.error('Error loading workload dashboard data', err)
      setError(err instanceof Error ? err.message : 'Failed to load workload dashboard')
    } finally {
      setLoading(false)
    }
  }, [selectedCoordinatorId, selectedBreakdownStudyId])

  const loadCoordinatorMetrics = useCallback(async (coordinatorId: string) => {
    setSaveError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('You must be signed in to manage coordinator metrics.')
      }

      const response = await fetch(`/api/cwe/metrics?coordinatorId=${coordinatorId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to load coordinator metrics')
      }

      const payload = await response.json()
      const loadedMetrics = (payload.metrics || []).map((row: any) => ({
        id: row.id,
        weekStart: row.weekStart ?? row.week_start,
        meetingHours: Number(row.meetingHours ?? row.meeting_hours ?? row.admin_hours ?? 0),
        screeningHours: Number(row.screeningHours ?? row.screening_hours ?? 0),
        screeningStudyCount: Number(row.screeningStudyCount ?? row.screening_study_count ?? 0),
        queryHours: Number(row.queryHours ?? row.query_hours ?? 0),
        queryStudyCount: Number(row.queryStudyCount ?? row.query_study_count ?? 0),
        notes: row.notes ?? null,
        updatedAt: row.updatedAt ?? row.updated_at ?? ''
      })) as CoordinatorMetricsSnapshot[]

      const breakdownMap: Record<string, AssignmentBreakdown> = {}
      const breakdownList = Array.isArray(payload.breakdowns) ? payload.breakdowns : []

      for (const entry of breakdownList as any[]) {
        if (!entry || typeof entry !== 'object') continue
        const studyId = typeof entry.studyId === 'string'
          ? entry.studyId
          : typeof entry.study_id === 'string'
          ? entry.study_id
          : null
        if (!studyId) continue
        const week = entry.weekStart ?? entry.week_start ?? null
        const breakdown: AssignmentBreakdown = {
          studyId,
          weekStart: typeof week === 'string' ? week : null,
          meetingHours: Number(entry.meetingHours ?? entry.meeting_hours ?? 0),
          screeningHours: Number(entry.screeningHours ?? entry.screening_hours ?? 0),
          queryHours: Number(entry.queryHours ?? entry.query_hours ?? 0),
          notes: entry.notes ?? null
        }
        const existing = breakdownMap[studyId]
        if (!existing || ((existing.weekStart ?? '') < (breakdown.weekStart ?? ''))) {
          breakdownMap[studyId] = breakdown
        }
      }

      setLatestBreakdown(breakdownMap)
      setMetrics(loadedMetrics)

      if (loadedMetrics.length > 0) {
        setWeekStart(loadedMetrics[0].weekStart)
      } else if (Object.keys(breakdownMap).length > 0) {
        const latest = Object.values(breakdownMap).reduce<AssignmentBreakdown | null>((acc, current) => {
          if (!acc) return current
          if ((acc.weekStart ?? '') < (current.weekStart ?? '')) return current
          return acc
        }, null)
        setWeekStart(latest?.weekStart ?? getMondayISO(new Date()))
      } else {
        setWeekStart(getMondayISO(new Date()))
      }

      const coordinatorAssignments = coordinators.find((entry) => entry.id === coordinatorId)?.assignments ?? []
      setAssignmentRows(buildAssignmentRows(coordinatorAssignments, loadedMetrics[0], breakdownMap))
    } catch (err) {
      console.error('Error loading coordinator metrics', err)
      setMetrics([])
      setLatestBreakdown({})
      setAssignmentRows(buildAssignmentRows(
        coordinators.find((entry) => entry.id === coordinatorId)?.assignments ?? [],
        undefined,
        {}
      ))
      setWeekStart(getMondayISO(new Date()))
      setSaveError(err instanceof Error ? err.message : 'Failed to load coordinator metrics')
    }
  }, [coordinators])

  useEffect(() => {
    loadData().catch(() => {
      // errors handled in loadData
    })
  }, [loadData, refreshKey])

  useEffect(() => {
    if (!selectedCoordinatorId) return
    loadCoordinatorMetrics(selectedCoordinatorId).catch(() => {
      // handled in loader
    })
  }, [loadCoordinatorMetrics, selectedCoordinatorId])

  const breakdownStudies = useMemo(() => {
    return workloads
      .filter((entry) => entry.breakdown && entry.breakdown.weeks.length > 0)
      .map((entry) => ({
        studyId: entry.studyId,
        studyTitle: entry.studyTitle,
        protocolNumber: entry.protocolNumber,
        breakdown: entry.breakdown!
      }))
  }, [workloads])

  const selectedBreakdownStudy = useMemo(() => {
    if (!selectedBreakdownStudyId) return null
    return breakdownStudies.find((entry) => entry.studyId === selectedBreakdownStudyId) ?? null
  }, [breakdownStudies, selectedBreakdownStudyId])

  const breakdownSeries = useMemo(() => {
    if (!selectedBreakdownStudy) return []
    return selectedBreakdownStudy.breakdown.weeks.map((week) => ({
      weekStart: week.weekStart,
      meetingHours: round(week.totals.meetingHours, 2),
      screeningHours: round(week.totals.screeningHours, 2),
      queryHours: round(week.totals.queryHours, 2),
      totalHours: round(week.totals.totalHours, 2),
      notesCount: week.totals.notesCount,
      coordinators: week.coordinators
    }))
  }, [selectedBreakdownStudy])

  const breakdownSummary = useMemo(() => {
    if (!selectedBreakdownStudy || selectedBreakdownStudy.breakdown.weeks.length === 0) {
      return {
        totalWeeks: 0,
        averageWeeklyHours: 0,
        latestWeek: null as string | null,
        latestTotal: 0,
        coordinatorCount: 0
      }
    }
    const totalWeeks = selectedBreakdownStudy.breakdown.weeks.length
    const hoursSum = selectedBreakdownStudy.breakdown.weeks.reduce((sum, week) => sum + week.totals.totalHours, 0)
    const latest = selectedBreakdownStudy.breakdown.weeks[selectedBreakdownStudy.breakdown.weeks.length - 1]
    const coordinatorIds = new Set<string>()
    for (const week of selectedBreakdownStudy.breakdown.weeks) {
      week.coordinators.forEach((coord) => {
        if (coord.coordinatorId) coordinatorIds.add(coord.coordinatorId)
      })
    }
    return {
      totalWeeks,
      averageWeeklyHours: totalWeeks > 0 ? round(hoursSum / totalWeeks, 1) : 0,
      latestWeek: latest?.weekStart ?? null,
      latestTotal: round(latest?.totals.totalHours ?? 0, 1),
      coordinatorCount: coordinatorIds.size
    }
  }, [selectedBreakdownStudy])

  const overview = useMemo(() => {
    if (workloads.length === 0) {
      return {
        totalNow: 0,
        totalActuals: 0,
        totalForecast: 0,
        trendPct: 0,
        topStudy: null as WorkloadRecord | null
      }
    }

    const totals = workloads.reduce(
      (acc, row) => {
        acc.totalNow += row.now.weighted
        acc.totalActuals += row.actuals.weighted
        acc.totalForecast += row.forecast.weighted
        return acc
      },
      { totalNow: 0, totalActuals: 0, totalForecast: 0 }
    )

    const trendPct = totals.totalActuals > 0
      ? round(((totals.totalForecast - totals.totalActuals) / totals.totalActuals) * 100, 1)
      : 0

    const topStudy = workloads.reduce((prev, curr) =>
      curr.forecast.weighted > prev.forecast.weighted ? curr : prev
    )

    return {
      totalNow: round(totals.totalNow, 0),
      totalActuals: round(totals.totalActuals, 0),
      totalForecast: round(totals.totalForecast, 0),
      trendPct,
      topStudy
    }
  }, [workloads])

  const categoryDistribution = useMemo(() => {
    if (workloads.length === 0) {
      return [
        { name: 'Meetings', hours: 0 },
        { name: 'Screening', hours: 0 },
        { name: 'Query', hours: 0 }
      ]
    }
    return [
      {
        name: 'Meetings',
        hours: round(workloads.reduce((sum, entry) => sum + entry.metrics.avgMeetingHours, 0), 1)
      },
      {
        name: 'Screening',
        hours: round(workloads.reduce((sum, entry) => sum + entry.metrics.avgScreeningHours, 0), 1)
      },
      {
        name: 'Query',
        hours: round(workloads.reduce((sum, entry) => sum + entry.metrics.avgQueryHours, 0), 1)
      }
    ]
  }, [workloads])

  const coordinatorLoads = useMemo(() => {
    if (coordinators.length === 0 || workloads.length === 0) {
      return []
    }

    const assignmentsByStudy = new Map<string, number>()
    coordinators.forEach((coordinator) => {
      coordinator.assignments.forEach((assignment) => {
        assignmentsByStudy.set(
          assignment.id,
          (assignmentsByStudy.get(assignment.id) ?? 0) + 1
        )
      })
    })

    return coordinators.map((coordinator) => {
      const studies = coordinator.assignments
        .map((assignment) => workloads.find((row) => row.studyId === assignment.id))
        .filter((row): row is WorkloadRecord => !!row)

      const load = studies.reduce((sum, row) => {
        const share = assignmentsByStudy.get(row.studyId) ?? 1
        return sum + row.forecast.weighted / share
      }, 0)

      const baseline = studies.reduce((sum, row) => {
        const share = assignmentsByStudy.get(row.studyId) ?? 1
        return sum + row.actuals.weighted / share
      }, 0)

      const trend = baseline > 0 ? round(((load - baseline) / baseline) * 100, 1) : 0
      const badge = getLoadBadge(load)

      return {
        id: coordinator.id,
        name: coordinator.name,
        email: coordinator.email,
        load: round(load, 0),
        baseline: round(baseline, 0),
        trend,
        studies: studies.length,
        badge
      }
    }).sort((a, b) => b.load - a.load)
  }, [coordinators, workloads])

  const trendData = useMemo(() => {
    const points = trendPoints.length === 0
      ? Array.from({ length: 8 }).map((_, index) => ({
          weekStart: shiftWeekLabel(getMondayISO(new Date()), index - 4),
          actual: 0,
          forecast: 0
        }))
      : trendPoints

    return points.map((point, index) => ({
      week: formatWeekLabel(point.weekStart, index),
      actual: round(point.actual, 1),
      forecast: round(point.forecast, 1)
    }))
  }, [trendPoints])

  const studies = useMemo(() => {
    const maxForecast = workloads.reduce((max, entry) => Math.max(max, entry.forecast.weighted), 0)
    return workloads
      .map((entry) => ({
        ...entry,
        completion: computeSetupCompletion(entry),
        lastUpdated: entry.metrics.lastWeekStart,
        forecastRatio: maxForecast > 0 ? entry.forecast.weighted / maxForecast : 0
      }))
      .sort((a, b) => b.forecast.weighted - a.forecast.weighted)
  }, [workloads])

  const handleCoordinatorChange = useCallback((coordinatorId: string) => {
    setSelectedCoordinatorId(coordinatorId)
  }, [])

  const handleAssignmentValueChange = useCallback((assignmentId: string, field: 'meetings' | 'screening' | 'queries' | 'notes', value: string) => {
    setAssignmentRows((rows) =>
      rows.map((row) =>
        row.assignmentId === assignmentId
          ? { ...row, [field]: value }
          : row
      )
    )
  }, [])

  const handleWeekStartChange = useCallback((value: string) => {
    setWeekStart(value)
  }, [])

  const handleMetricsSubmit = useCallback(async () => {
    if (!selectedCoordinatorId) return

    try {
      setSaving(true)
      setSaveError(null)
      setSaveMessage(null)

      const totals = assignmentRows.reduce(
        (acc, row) => {
          const meetings = toHours(row.meetings)
          const screening = toHours(row.screening)
          const queries = toHours(row.queries)
          const hours = meetings + screening + queries
          const noteText = row.notes.trim()
          if (hours > 0) {
            acc.activeStudies += 1
          }
          acc.totalMeeting += meetings
          acc.totalScreening += screening
          acc.totalQuery += queries
          acc.totalHours += hours
          if (noteText) {
            acc.notes.push(`${row.studyTitle}: ${noteText}`)
          }
          if (hours > 0 || noteText) {
            acc.breakdown.push({
              studyId: row.studyId,
              meetingHours: meetings,
              screeningHours: screening,
              queryHours: queries,
              notes: noteText ? noteText : null
            })
          }
          return acc
        },
        {
          totalMeeting: 0,
          totalScreening: 0,
          totalQuery: 0,
          totalHours: 0,
          activeStudies: 0,
          notes: [] as string[],
          breakdown: [] as Array<{ studyId: string; meetingHours: number; screeningHours: number; queryHours: number; notes: string | null }>
        }
      )

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('You must be signed in to submit coordinator metrics.')
      }

      const response = await fetch('/api/cwe/metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          coordinatorId: selectedCoordinatorId,
          weekStart,
          meetingHours: totals.totalMeeting,
          screeningHours: totals.totalScreening,
          screeningStudyCount: totals.activeStudies,
          queryHours: totals.totalQuery,
          queryStudyCount: totals.activeStudies,
          notes: totals.notes.length > 0 ? totals.notes.join(' | ') : null,
          breakdown: totals.breakdown
        })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to save coordinator metrics')
      }

      const message = totals.activeStudies > 0
        ? `You logged ${round(totals.totalHours, 1)} hrs across ${totals.activeStudies} studies this week.`
        : 'Metrics saved.'

      setSaveMessage(message)
      await loadCoordinatorMetrics(selectedCoordinatorId)
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      console.error('Error saving coordinator metrics', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save coordinator metrics')
    } finally {
      setSaving(false)
    }
  }, [assignmentRows, loadCoordinatorMetrics, selectedCoordinatorId, weekStart])

  const handleResetAssignments = useCallback(() => {
    if (!selectedCoordinatorId) return
    const coordinatorAssignments = coordinators.find((entry) => entry.id === selectedCoordinatorId)?.assignments ?? []
    const latest = metrics[0]
    setAssignmentRows(buildAssignmentRows(coordinatorAssignments, latest, latestBreakdown))
    if (latest) {
      setWeekStart(latest.weekStart)
    } else if (Object.keys(latestBreakdown).length > 0) {
      const newest = Object.values(latestBreakdown).reduce<AssignmentBreakdown | null>((acc, current) => {
        if (!acc) return current
        if ((acc.weekStart ?? '') < (current.weekStart ?? '')) return current
        return acc
      }, null)
      setWeekStart(newest?.weekStart ?? getMondayISO(new Date()))
    } else {
      setWeekStart(getMondayISO(new Date()))
    }
  }, [coordinators, latestBreakdown, metrics, selectedCoordinatorId])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 rounded bg-gray-800 animate-pulse" />
        <div className="h-24 rounded bg-gray-800 animate-pulse" />
        <div className="h-96 rounded bg-gray-800 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-6 py-8 text-red-200">
        <p className="text-lg font-semibold mb-2">Unable to load workload engine</p>
        <p className="text-sm mb-4">{error}</p>
        <button
          onClick={() => {
            setRefreshKey((prev) => prev + 1)
          }}
          className="rounded-md bg-red-500/30 px-4 py-2 text-sm font-medium text-red-50 hover:bg-red-500/40 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Workload Engine</h1>
          <p className="text-gray-300 text-sm max-w-3xl">
            Make portfolio decisions in one view. Start with the KPIs, drill into coordinators, then open any study to configure workload and log this week&apos;s effort.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
          {STEP_ITEMS.map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-blue-300">{item.label}</span>
              <span className="text-sm text-gray-200">{item.description}</span>
            </div>
          ))}
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Portfolio Overview</h2>
            <p className="text-sm text-gray-400">
              Weighted workload points with lifecycle, recruitment, and coordinator adjustments.
            </p>
          </div>
          {overview.topStudy && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
              <div className="text-xs uppercase text-blue-200 tracking-wide mb-1">
                Highest 4-week forecast
              </div>
              <div className="text-sm text-white font-semibold">{overview.topStudy.studyTitle}</div>
              <div className="text-xs text-gray-200">
                {formatNumber(overview.topStudy.forecast.weighted)} pts · {getLoadBadge(overview.topStudy.forecast.weighted).label}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard label="Current workload" value={`${formatNumber(overview.totalNow)} pts`} />
          <SummaryCard label="Completed (last 4w)" value={`${formatNumber(overview.totalActuals)} pts`} />
          <SummaryCard
            label="Projected (next 4w)"
            value={`${formatNumber(overview.totalForecast)} pts`}
            trend={overview.trendPct}
          />
          <SummaryCard
            label="Studies tracked"
            value={`${workloads.length}`}
            footnote={overview.topStudy ? `${overview.topStudy.studyTitle}` : undefined}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Time by category</h3>
              <span className="text-xs text-gray-400">Avg hours / week</span>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    dataKey="hours"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {categoryDistribution.map((_, index) => (
                      <Cell key={index} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-xs text-gray-300">{value}</span>}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
                    formatter={(value: number) => [`${value.toFixed(1)} hrs`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Workload by coordinator</h3>
              <span className="text-xs text-gray-400">Forecast bar with trend line</span>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coordinatorLoads}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="name"
                    stroke="#9ca3af"
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId="load"
                    stroke="#9ca3af"
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId="trend"
                    orientation="right"
                    stroke="#4ade80"
                    fontSize={11}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
                    formatter={(value: number, key: string) => {
                      if (key === 'trend') {
                        return [`${value > 0 ? '+' : ''}${value}%`, 'Trend']
                      }
                      return [`${formatNumber(value)} pts`, 'Forecast']
                    }}
                  />
                  <Bar
                    yAxisId="load"
                    dataKey="load"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    yAxisId="trend"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">8-week forecast trend</h3>
              <span className="text-xs text-gray-400">Per week projection</span>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
                    formatter={(value: number, name: string) => [`${value.toFixed(1)} pts`, name === 'actual' ? 'Actual pace' : 'Forecast']}
                  />
                  <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {trendError && (
              <p className="mt-2 text-xs text-amber-300">{trendError}</p>
            )}
          </div>
        </div>
      </section>

      {breakdownStudies.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Per-study breakdown</h2>
              <p className="text-sm text-gray-400">
                Weekly hours logged per study, stacked by meeting, screening, and query work.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="breakdown-study" className="text-xs uppercase tracking-wide text-gray-400">
                Study
              </label>
              <select
                id="breakdown-study"
                value={selectedBreakdownStudyId ?? breakdownStudies[0]?.studyId ?? ''}
                onChange={(event) => setSelectedBreakdownStudyId(event.target.value || null)}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {breakdownStudies.map((study) => (
                  <option key={study.studyId} value={study.studyId}>
                    {study.studyTitle} · {study.protocolNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              label="Avg weekly hours"
              value={`${breakdownSummary.averageWeeklyHours.toFixed(1)} hrs`}
              footnote={`Across ${breakdownSummary.totalWeeks} week${breakdownSummary.totalWeeks === 1 ? '' : 's'}`}
            />
            <SummaryCard
              label="Latest week"
              value={breakdownSummary.latestWeek ? breakdownSummary.latestWeek : '—'}
              footnote={breakdownSummary.latestWeek ? `${breakdownSummary.latestTotal.toFixed(1)} hrs total` : 'No submissions yet'}
            />
            <SummaryCard
              label="Contributing coordinators"
              value={`${breakdownSummary.coordinatorCount}`}
              footnote="Unique coordinators in the selected range"
            />
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
            {breakdownSeries.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-sm text-gray-400">
                No breakdown entries for this study yet.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={breakdownSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="weekStart"
                      stroke="#9ca3af"
                      fontSize={11}
                    />
                    <YAxis
                      tickFormatter={(value) => `${round(value as number, 1)}h`}
                      stroke="#9ca3af"
                      fontSize={11}
                    />
                    <Tooltip content={<BreakdownTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={36}
                      formatter={(value) => <span className="text-xs text-gray-300">{value}</span>}
                    />
                    <Area type="monotone" dataKey="meetingHours" name="Meetings" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="screeningHours" name="Screening" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="queryHours" name="Queries" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-white">Coordinator load</h2>
            <p className="text-sm text-gray-400">
              Colored bars show projected workload share; hover to see baseline vs forecast change.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/40">
          <table className="min-w-full divide-y divide-gray-800 text-sm">
            <thead className="bg-gray-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Coordinator</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Email</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Studies</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Forecast</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Baseline</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Trend</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {coordinatorLoads.map((coordinator) => (
                <tr key={coordinator.id} className="hover:bg-gray-900/40 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{coordinator.name}</td>
                  <td className="px-4 py-3 text-gray-300">{coordinator.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{coordinator.studies}</td>
                  <td className="px-4 py-3 text-right text-gray-200">{formatNumber(coordinator.load)} pts</td>
                  <td className="px-4 py-3 text-right text-gray-200">{formatNumber(coordinator.baseline)} pts</td>
                  <td className={`px-4 py-3 text-right ${coordinator.trend >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {coordinator.trend >= 0 ? '+' : ''}
                    {coordinator.trend}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${coordinator.badge.className}`}>
                      {coordinator.badge.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-white">Study detail</h2>
            <p className="text-sm text-gray-400">
              Sort to prioritize higher workloads. Click a study to open its configuration.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/40">
          <table className="min-w-full divide-y divide-gray-800 text-sm">
            <thead className="bg-gray-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Study</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Stage</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Now</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Actuals</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Forecast</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Load share</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Setup %</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-300">Last updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {studies.map((entry) => {
                const badge = getLoadBadge(entry.forecast.weighted)
                const progressWidth = `${Math.min(100, Math.max(10, entry.forecastRatio * 100))}%`
                return (
                  <tr key={entry.studyId} className="hover:bg-gray-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <Link
                          href={`/studies/${entry.studyId}/workload`}
                          className="text-white font-semibold hover:text-blue-300 transition-colors"
                        >
                          {entry.studyTitle}
                        </Link>
                        <span className="text-xs text-gray-400">{entry.protocolNumber}</span>
                      </div>
                    </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{formatLifecycleStage(entry.lifecycle)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[entry.recruitment ?? entry.status ?? 'active'] ?? 'bg-gray-500/15 text-gray-200 border border-gray-500/20'}`}>
                    {entry.recruitment ? formatRecruitmentStatus(entry.recruitment) : formatStudyStatus(entry.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-200">{formatNumber(entry.now.weighted)} pts</td>
                    <td className="px-4 py-3 text-right text-gray-200">{formatNumber(entry.actuals.weighted)} pts</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-gray-50 font-medium">{formatNumber(entry.forecast.weighted)} pts</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-36 h-2 rounded-full bg-gray-800 overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: progressWidth }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-200">{entry.completion}%</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">
                      {entry.lastUpdated ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-white">Study setup checklist</h2>
            <p className="text-sm text-gray-400">
              Expand a study to view completion progress and launch the guided configuration.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900/40 divide-y divide-gray-800">
          {studies.map((entry) => (
            <details key={entry.studyId} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-gray-900/40 transition-colors">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">{entry.studyTitle}</span>
                    <span className="text-xs text-gray-500">Protocol {entry.protocolNumber}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatLifecycleStage(entry.lifecycle)} · {entry.recruitment ? formatRecruitmentStatus(entry.recruitment) : formatStudyStatus(entry.status)}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm text-gray-200">
                  <div className="flex flex-col text-right">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Setup completion</span>
                    <span className="font-semibold text-white">{entry.completion}%</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Last updated</span>
                    <span>{entry.lastUpdated ?? '—'}</span>
                  </div>
                  <span className="text-blue-300 text-sm font-medium group-open:hidden">Show</span>
                  <span className="text-blue-300 text-sm font-medium hidden group-open:inline">Hide</span>
                </div>
              </summary>
              <div className="space-y-4 px-4 py-5 bg-gray-950/60 border-t border-gray-800">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                    <h4 className="text-sm font-semibold text-white mb-2">Rubric snapshot</h4>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li>Protocol score: {entry.protocolScore.toFixed(0)}</li>
                      <li>Meeting points: {entry.meetingAdminPointsAdjusted.toFixed(1)} pts/mo</li>
                      <li>Screening multiplier: {entry.screeningMultiplierEffective.toFixed(2)}</li>
                      <li>Query multiplier: {entry.queryMultiplierEffective.toFixed(2)}</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                    <h4 className="text-sm font-semibold text-white mb-2">Coordinator signal</h4>
                    <p className="text-xs text-gray-300">
                      {entry.metrics.contributors > 0
                        ? `${entry.metrics.contributors} active coordinator${entry.metrics.contributors === 1 ? '' : 's'} · latest log ${entry.metrics.lastWeekStart ?? '—'}`
                        : 'No coordinator metrics logged yet.'}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      Meetings {entry.metrics.avgMeetingHours.toFixed(1)}h · Screening {entry.metrics.avgScreeningHours.toFixed(1)}h · Queries {entry.metrics.avgQueryHours.toFixed(1)}h (per week average)
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-white">Quick actions</h4>
                    <Link
                      href={`/studies/${entry.studyId}/workload`}
                      className="inline-flex items-center justify-center rounded-md border border-blue-500/50 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-600/20 transition-colors"
                    >
                      Configure Study Workload
                    </Link>
                    <p className="text-xs text-gray-400">
                      Guided page with definitions, rubrics, and visit weight controls.
                    </p>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-white">Weekly workload log</h2>
            <p className="text-sm text-gray-400">
              Enter estimates inline for each assigned study. Totals roll up automatically.
            </p>
          </div>
          {saveMessage && (
            <span className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-md">
              {saveMessage}
            </span>
          )}
        </div>

        <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Coordinator</span>
              <select
                value={selectedCoordinatorId ?? ''}
                onChange={(event) => handleCoordinatorChange(event.target.value)}
                className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {coordinators.map((coordinator) => (
                  <option key={coordinator.id} value={coordinator.id}>
                    {coordinator.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                Assigned studies auto-fill below
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Week starting</span>
              <input
                type="date"
                value={weekStart}
                max={getMondayISO(new Date())}
                onChange={(event) => handleWeekStartChange(event.target.value)}
                className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">
                Monday baseline
              </span>
            </label>

            <div className="flex flex-col gap-2 text-sm">
              <span className="text-gray-300">Shortcuts</span>
              <div className="flex gap-2">
                <button
                  onClick={handleResetAssignments}
                  className="inline-flex items-center justify-center rounded-md border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-800 transition-colors"
                  type="button"
                >
                  Reset inputs
                </button>
                <button
                  onClick={() => {
                    setAssignmentRows((rows) =>
                      rows.map((row) => ({
                        ...row,
                        meetings: '',
                        screening: '',
                        queries: ''
                      }))
                    )
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-800 transition-colors"
                  type="button"
                >
                  Clear hours
                </button>
              </div>
              {saveError && <span className="text-xs text-red-300">{saveError}</span>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800 text-sm">
              <thead className="bg-gray-900/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Study</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-300">Meetings (hrs)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-300">Screening (hrs)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-300">Queries (hrs)</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {assignmentRows.map((row) => (
                  <tr key={row.assignmentId} className="hover:bg-gray-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-white font-semibold">{row.studyTitle}</span>
                        <span className="text-xs text-gray-400">{row.protocolNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        inputMode="decimal"
                        value={row.meetings}
                        onChange={(event) => handleAssignmentValueChange(row.assignmentId, 'meetings', event.target.value)}
                        className="w-full max-w-[110px] rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1 text-right text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        inputMode="decimal"
                        value={row.screening}
                        onChange={(event) => handleAssignmentValueChange(row.assignmentId, 'screening', event.target.value)}
                        className="w-full max-w-[110px] rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1 text-right text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        inputMode="decimal"
                        value={row.queries}
                        onChange={(event) => handleAssignmentValueChange(row.assignmentId, 'queries', event.target.value)}
                        className="w-full max-w-[110px] rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1 text-right text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(event) => handleAssignmentValueChange(row.assignmentId, 'notes', event.target.value)}
                        className="w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-1.5 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Add context (optional)"
                      />
                    </td>
                  </tr>
                ))}
                {assignmentRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                      No assignments linked yet. Assign this coordinator to a study to log workload.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-4 text-sm text-gray-300">
              <span>
                Total meetings:{' '}
                <strong className="text-white">
                  {round(assignmentRows.reduce((sum, row) => sum + toHours(row.meetings), 0), 1)} hrs
                </strong>
              </span>
              <span>
                Total screening:{' '}
                <strong className="text-white">
                  {round(assignmentRows.reduce((sum, row) => sum + toHours(row.screening), 0), 1)} hrs
                </strong>
              </span>
              <span>
                Total queries:{' '}
                <strong className="text-white">
                  {round(assignmentRows.reduce((sum, row) => sum + toHours(row.queries), 0), 1)} hrs
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleMetricsSubmit}
                disabled={saving || !selectedCoordinatorId}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:cursor-not-allowed disabled:bg-blue-900/50"
              >
                {saving ? 'Saving…' : 'Submit weekly log'}
              </button>
              <button
                onClick={handleResetAssignments}
                className="inline-flex items-center justify-center rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800 transition-colors"
              >
                Restore last submission
              </button>
            </div>
          </div>
        </div>

        {metrics.length > 0 && (
          <div className="rounded-lg border border-gray-700 bg-gray-900/40">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">Recent submissions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-800 text-sm">
                <thead className="bg-gray-900/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Week start</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-300">Meetings</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-300">Screening</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-300">Queries</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {metrics.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-3 text-gray-100">{entry.weekStart}</td>
                      <td className="px-4 py-3 text-right text-gray-200">{entry.meetingHours.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-200">{entry.screeningHours.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-200">{entry.queryHours.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-300">{entry.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

const CATEGORY_COLORS = ['#3b82f6', '#22c55e', '#f59e0b']

const tooltipStyle: CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  padding: '8px 10px',
  color: '#f9fafb',
  fontSize: '12px'
}

function SummaryCard({
  label,
  value,
  trend,
  footnote
}: {
  label: string
  value: string
  trend?: number
  footnote?: string
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-5">
      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      {typeof trend === 'number' && (
        <div className={`text-xs mt-2 ${trend >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
          {trend >= 0 ? '+' : ''}
          {trend}%
          <span className="text-gray-500 ml-1">vs last 4 weeks</span>
        </div>
      )}
      {footnote && (
        <div className="text-xs text-gray-500 mt-2">{footnote}</div>
      )}
    </div>
  )
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function BreakdownTooltip({ active, payload, label }: BreakdownTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const datum = payload[0]?.payload as BreakdownTooltipDatum | undefined

  if (!datum) return null

  const formatHours = (value: number) => `${round(value, 1)} hrs`

  return (
    <div style={tooltipStyle} className="space-y-1">
      <div className="text-xs font-semibold text-gray-100">{label}</div>
      <div className="text-xs text-gray-200">Meetings: {formatHours(datum.meetingHours)}</div>
      <div className="text-xs text-gray-200">Screening: {formatHours(datum.screeningHours)}</div>
      <div className="text-xs text-gray-200">Queries: {formatHours(datum.queryHours)}</div>
      <div className="text-xs text-gray-300">Total: {formatHours(datum.totalHours)}</div>
      {datum.notesCount > 0 && (
        <div className="text-[11px] text-blue-300">Notes logged: {datum.notesCount}</div>
      )}
      {datum.coordinators?.length > 0 && (
        <div className="text-[11px] text-gray-400">
          Contributors: {datum.coordinators.length}
        </div>
      )}
    </div>
  )
}

function computeSetupCompletion(entry: WorkloadRecord) {
  const checkpoints = [
    entry.protocolScore > 0,
    entry.meetingAdminPoints > 0,
    entry.screeningMultiplier !== 1,
    entry.queryMultiplier !== 1,
    entry.metrics.contributors > 0,
    entry.metrics.avgScreeningHours > 0,
    entry.metrics.avgQueryHours > 0,
    entry.metrics.avgMeetingHours > 0
  ]
  const completed = checkpoints.filter(Boolean).length
  const percent = Math.round((completed / checkpoints.length) * 100)
  return Math.min(100, Math.max(10, percent))
}

function buildAssignmentRows(
  assignments: CoordinatorAssignment[],
  latest?: CoordinatorMetricsSnapshot,
  breakdownMap: Record<string, AssignmentBreakdown> = {}
): AssignmentLogRow[] {
  if (assignments.length === 0) {
    return []
  }

  const assignmentsWithDefaults = assignments.map((assignment) => ({
    assignmentId: `${assignment.id}-${assignment.joinedAt}`,
    studyId: assignment.id,
    studyTitle: assignment.studyTitle,
    protocolNumber: assignment.protocolNumber,
    meetings: '',
    screening: '',
    queries: '',
    notes: ''
  }))

  const divisor = Math.max(assignments.length, 1)
  const avgMeeting = latest ? round(latest.meetingHours / divisor, 2) : 0
  const avgScreening = latest ? round(latest.screeningHours / divisor, 2) : 0
  const avgQuery = latest ? round(latest.queryHours / divisor, 2) : 0

  return assignmentsWithDefaults.map((assignment) => {
    const breakdown = breakdownMap[assignment.studyId]
    if (breakdown) {
      return {
        ...assignment,
        meetings: breakdown.meetingHours > 0 ? breakdown.meetingHours.toString() : '',
        screening: breakdown.screeningHours > 0 ? breakdown.screeningHours.toString() : '',
        queries: breakdown.queryHours > 0 ? breakdown.queryHours.toString() : '',
        notes: breakdown.notes ?? ''
      }
    }

    if (!latest) {
      return assignment
    }

    return {
      ...assignment,
      meetings: avgMeeting > 0 ? avgMeeting.toString() : '',
      screening: avgScreening > 0 ? avgScreening.toString() : '',
      queries: avgQuery > 0 ? avgQuery.toString() : '',
      notes: ''
    }
  })
}

function getMondayISO(date: Date) {
  const temp = new Date(date)
  const day = temp.getDay()
  const diff = temp.getDate() - day + (day === 0 ? -6 : 1)
  temp.setDate(diff)
  temp.setHours(0, 0, 0, 0)
  return temp.toISOString().slice(0, 10)
}

function shiftWeekLabel(baseISO: string, weeks: number) {
  const base = new Date(`${baseISO}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) {
    return baseISO
  }
  base.setUTCDate(base.getUTCDate() + weeks * 7)
  return base.toISOString().slice(0, 10)
}

function formatWeekLabel(weekISO: string | null, index: number) {
  if (!weekISO) {
    return index < 4 ? `W-${4 - index}` : `W+${index - 3}`
  }
  const date = new Date(`${weekISO}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    return weekISO
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}
