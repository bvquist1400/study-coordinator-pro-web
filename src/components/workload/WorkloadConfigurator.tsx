'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import CoordinatorMetricsPanel from './CoordinatorMetricsPanel'

interface WorkloadEntry {
  studyId: string
  studyTitle: string
  protocolNumber: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  meetingAdminPoints: number
  meetingAdminPointsAdjusted: number
  screeningMultiplier: number
  screeningMultiplierEffective: number
  queryMultiplier: number
  queryMultiplierEffective: number
  now: number
  actuals: number
  forecast: number
  metrics: {
    contributors: number
    avgMeetingHours: number
    avgScreeningHours: number
    avgScreeningStudyCount: number
    avgQueryHours: number
    avgQueryStudyCount: number
    entries: number
    lastWeekStart: string | null
  }
}

interface CoordinatorOption {
  id: string
  name: string
  email: string | null
  organization: string | null
  assignments: Array<{ id: string; studyTitle: string; protocolNumber: string; role: string | null; joinedAt: string }>
}

const formatStatus = (value: string | null | undefined) => {
  if (!value) return '—'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const formatPoints = (value: number) => Math.round(value).toLocaleString('en-US')
const formatMeeting = (value: number) => value.toFixed(1)
const formatHours = (value: number) => value.toFixed(1)
const formatCount = (value: number) => value.toFixed(1)

const loadLabel = (points: number) => {
  if (points >= 300) return { label: 'Critical', className: 'bg-red-500/15 text-red-300 border border-red-500/30' }
  if (points >= 220) return { label: 'High', className: 'bg-orange-500/15 text-orange-200 border border-orange-500/30' }
  if (points >= 150) return { label: 'Elevated', className: 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/30' }
  return { label: 'Balanced', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' }
}

interface WorkloadConfiguratorProps {
  onMetricsRefresh?: () => void
}

export default function WorkloadConfigurator({ onMetricsRefresh }: WorkloadConfiguratorProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workloads, setWorkloads] = useState<WorkloadEntry[]>([])
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([])

  const loadWorkloads = useCallback(async (): Promise<WorkloadEntry[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      throw new Error('You must be signed in to view workload data')
    }

    const response = await fetch('/api/analytics/workload', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      throw new Error('Failed to load workload analytics')
    }

    const payload = await response.json()
    return (payload.workloads || []).map((row: any) => ({
      studyId: row.studyId,
      studyTitle: row.studyTitle,
      protocolNumber: row.protocolNumber,
      lifecycle: row.lifecycle,
      recruitment: row.recruitment,
      status: row.status,
      meetingAdminPoints: Number(row.meetingAdminPoints ?? 0),
      meetingAdminPointsAdjusted: Number(row.meetingAdminPointsAdjusted ?? row.meetingAdminPoints ?? 0),
      screeningMultiplier: Number(row.screeningMultiplier ?? 1),
      screeningMultiplierEffective: Number(row.screeningMultiplierEffective ?? row.screeningMultiplier ?? 1),
      queryMultiplier: Number(row.queryMultiplier ?? 1),
      queryMultiplierEffective: Number(row.queryMultiplierEffective ?? row.queryMultiplier ?? 1),
      now: Number(row?.now?.weighted ?? 0),
      actuals: Number(row?.actuals?.weighted ?? 0),
      forecast: Number(row?.forecast?.weighted ?? 0),
      metrics: {
        contributors: Number(row?.metrics?.contributors ?? 0),
        avgMeetingHours: Number(row?.metrics?.avgMeetingHours ?? 0),
        avgScreeningHours: Number(row?.metrics?.avgScreeningHours ?? 0),
        avgScreeningStudyCount: Number(row?.metrics?.avgScreeningStudyCount ?? 0),
        avgQueryHours: Number(row?.metrics?.avgQueryHours ?? 0),
        avgQueryStudyCount: Number(row?.metrics?.avgQueryStudyCount ?? 0),
        entries: Number(row?.metrics?.entries ?? 0),
        lastWeekStart: row?.metrics?.lastWeekStart ?? null
      }
    })) as WorkloadEntry[]
  }, [])

  const refreshWorkloads = useCallback(async () => {
    try {
      const entries = await loadWorkloads()
      setWorkloads(entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workload analytics')
    }
  }, [loadWorkloads])

  const loadCoordinators = useCallback(async (): Promise<CoordinatorOption[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      throw new Error('You must be signed in to view coordinator data')
    }

    const response = await fetch('/api/coordinators', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      throw new Error('Failed to load coordinators')
    }

    const payload = await response.json()
    return (payload.coordinators || []).map((entry: any) => ({
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
  }, [])

  const refreshCoordinators = useCallback(async () => {
    try {
      const list = await loadCoordinators()
      setCoordinators(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coordinator data')
    }
  }, [loadCoordinators])

  const handleMetricsSaved = useCallback(async () => {
    await Promise.all([refreshWorkloads(), refreshCoordinators()])
    onMetricsRefresh?.()
  }, [onMetricsRefresh, refreshCoordinators, refreshWorkloads])

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      try {
        setLoading(true)
        setError(null)
        const [entries, coordinatorList] = await Promise.all([loadWorkloads(), loadCoordinators()])
        if (mounted) {
          setWorkloads(entries)
          setCoordinators(coordinatorList)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load workload analytics')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      mounted = false
    }
  }, [loadCoordinators, loadWorkloads])

  const summary = useMemo(() => {
    if (workloads.length === 0) {
      return {
        totalForecast: 0,
        highest: null as WorkloadEntry | null,
        avgForecast: 0
      }
    }

    const totalForecast = workloads.reduce((sum, entry) => sum + entry.forecast, 0)
    const highest = workloads.reduce((prev, curr) => (curr.forecast > prev.forecast ? curr : prev))
    return {
      totalForecast,
      highest,
      avgForecast: totalForecast / workloads.length
    }
  }, [workloads])

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse">
        <div className="h-5 w-48 bg-gray-700 rounded mb-4" />
        <div className="h-4 w-full bg-gray-700 rounded mb-2" />
        <div className="h-4 w-2/3 bg-gray-700 rounded mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-3">
              <div className="h-4 bg-gray-700 rounded w-36" />
              <div className="h-6 bg-gray-700 rounded w-20" />
              <div className="h-3 bg-gray-700 rounded w-28" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-red-300">
        {error}
      </div>
    )
  }

  if (workloads.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-gray-300">
        No workload data is available yet. Add subjects and visits to your studies to unlock configuration options.
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-8">
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-white">Study Workload Setup</h3>
          <p className="text-sm text-gray-300">
            Each protocol has a dedicated configuration page. Use this checklist to understand what you will review, then open the setup for the study you want to tune.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Total 4-week forecast</div>
            <div className="text-2xl font-semibold text-emerald-300">
              {formatPoints(summary.totalForecast)} pts
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Sum of all coordinator workload points projected for the next 28 days.
            </p>
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Average per study</div>
            <div className="text-2xl font-semibold text-white">
              {formatPoints(summary.avgForecast)} pts
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Helps gauge whether a study is trending higher or lower than baseline.
            </p>
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Highest forecast</div>
            <div className="text-2xl font-semibold text-amber-300">
              {summary.highest ? formatPoints(summary.highest.forecast) : '0'} pts
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {summary.highest
                ? `${summary.highest.studyTitle} (${summary.highest.protocolNumber})`
                : 'Identify high-pressure protocols quickly.'}
            </p>
          </div>
        </div>
        <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-white mb-2">Setup checklist</h4>
          <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
            <li>Score the protocol rubric to establish a consistent baseline complexity.</li>
            <li>Confirm lifecycle and recruitment cadence; update cadence in the Study → Edit modal if needed.</li>
            <li>Adjust baseline multipliers and meeting/admin load for the next quarter.</li>
            <li>Fine-tune visit-type weights so the forecast reflects your actual workflow.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {workloads.map((entry) => {
          const badge = loadLabel(entry.forecast)
          return (
            <div key={entry.studyId} className="bg-gray-900/60 border border-gray-700 rounded-lg p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold text-white">{entry.studyTitle}</h4>
                  <p className="text-sm text-gray-400">Protocol {entry.protocolNumber}</p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.className}`}>
                  {badge.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Lifecycle</p>
                  <p className="text-white">{formatStatus(entry.lifecycle)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Recruitment</p>
                  <p className="text-white">{formatStatus(entry.recruitment)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Meeting load</p>
                  <p className="text-white">{formatMeeting(entry.meetingAdminPointsAdjusted)} pts/mo</p>
                  {entry.meetingAdminPointsAdjusted !== entry.meetingAdminPoints && (
                    <p className="text-xs text-gray-500">
                      Baseline {formatMeeting(entry.meetingAdminPoints)} pts/mo
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Current load</p>
                  <p className="text-emerald-300 font-semibold">{formatPoints(entry.now)} pts</p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">4-week forecast</p>
                  <p className="text-amber-300 font-semibold">{formatPoints(entry.forecast)} pts</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-gray-900/40 border border-gray-800 rounded-lg p-3">
                <div>
                  <p className="text-gray-400 uppercase tracking-wide">Screening multiplier</p>
                  <p className="text-gray-200">
                    {entry.screeningMultiplierEffective.toFixed(2)}
                    {entry.screeningMultiplierEffective !== entry.screeningMultiplier && (
                      <span className="text-gray-500 text-[11px] ml-2">
                        base {entry.screeningMultiplier.toFixed(2)}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase tracking-wide">Query multiplier</p>
                  <p className="text-gray-200">
                    {entry.queryMultiplierEffective.toFixed(2)}
                    {entry.queryMultiplierEffective !== entry.queryMultiplier && (
                      <span className="text-gray-500 text-[11px] ml-2">
                        base {entry.queryMultiplier.toFixed(2)}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase tracking-wide">Avg coordinator hrs (4w)</p>
                  <p className="text-gray-200 leading-relaxed">
                    Mt {formatHours(entry.metrics.avgMeetingHours)}h · Scr {formatHours(entry.metrics.avgScreeningHours)}h / {formatCount(entry.metrics.avgScreeningStudyCount)} studies · Q {formatHours(entry.metrics.avgQueryHours)}h / {formatCount(entry.metrics.avgQueryStudyCount)} studies
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    {entry.metrics.entries > 0
                      ? `${entry.metrics.entries} submission${entry.metrics.entries === 1 ? '' : 's'} · ${entry.metrics.contributors} contributor${entry.metrics.contributors === 1 ? '' : 's'}${entry.metrics.lastWeekStart ? ` · latest week ${entry.metrics.lastWeekStart}` : ''}`
                      : 'No coordinator metrics submitted yet'}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2">
                <Link
                  href={`/studies/${entry.studyId}/workload`}
                  className="inline-flex items-center justify-center rounded-lg border border-blue-500/50 bg-blue-600/10 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-600/20 transition-colors"
                >
                  Configure Study Workload
                </Link>
                <p className="text-xs text-gray-500">
                  Opens a guided page with definitions and step-by-step instructions for this protocol.
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <CoordinatorMetricsPanel coordinators={coordinators} onMetricsSaved={handleMetricsSaved} />
    </div>
  )
}
