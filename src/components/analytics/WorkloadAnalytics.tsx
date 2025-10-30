'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatRecruitmentStatus, formatStudyStatus } from '@/constants/studyStatus'

interface WorkloadEntry {
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
}

interface WorkloadAnalyticsProps {
  className?: string
  refreshToken?: number
}

export default function WorkloadAnalytics({ className, refreshToken }: WorkloadAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workloads, setWorkloads] = useState<WorkloadEntry[]>([])

  const fetchWorkloads = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const response = await fetch('/api/analytics/workload', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })

      if (!response.ok) {
        throw new Error('Failed to load workload metrics')
      }

      const payload = await response.json()
      const normalized = (payload.workloads || []).map((entry: any) => ({
        ...entry,
        meetingAdminPoints: Number(entry.meetingAdminPoints ?? 0),
        meetingAdminPointsAdjusted: Number(entry.meetingAdminPointsAdjusted ?? entry.meetingAdminPoints ?? 0),
        screeningMultiplier: Number(entry.screeningMultiplier ?? 1),
        screeningMultiplierEffective: Number(entry.screeningMultiplierEffective ?? entry.screeningMultiplier ?? 1),
        queryMultiplier: Number(entry.queryMultiplier ?? 1),
        queryMultiplierEffective: Number(entry.queryMultiplierEffective ?? entry.queryMultiplier ?? 1),
        metrics: {
          contributors: Number(entry?.metrics?.contributors ?? 0),
          avgMeetingHours: Number(entry?.metrics?.avgMeetingHours ?? 0),
          avgScreeningHours: Number(entry?.metrics?.avgScreeningHours ?? 0),
          avgScreeningStudyCount: Number(entry?.metrics?.avgScreeningStudyCount ?? 0),
          avgQueryHours: Number(entry?.metrics?.avgQueryHours ?? 0),
          avgQueryStudyCount: Number(entry?.metrics?.avgQueryStudyCount ?? 0),
          screeningScale: Number(entry?.metrics?.screeningScale ?? 1),
          queryScale: Number(entry?.metrics?.queryScale ?? 1),
          meetingPointsAdjustment: Number(entry?.metrics?.meetingPointsAdjustment ?? 0),
          entries: Number(entry?.metrics?.entries ?? 0),
          lastWeekStart: entry?.metrics?.lastWeekStart ?? null
        }
      }))
      setWorkloads(normalized)
    } catch (err) {
      console.error('Error fetching workload analytics', err)
      setError(err instanceof Error ? err.message : 'Failed to load workload metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkloads()
  }, [fetchWorkloads, refreshToken])

  const summary = useMemo(() => {
    if (workloads.length === 0) {
      return {
        totalNow: 0,
        totalActuals: 0,
        totalForecast: 0,
        avgForecast: 0,
        topStudy: null as WorkloadEntry | null
      }
    }

    const totals = workloads.reduce(
      (acc, current) => {
        acc.totalNow += current.now.weighted
        acc.totalActuals += current.actuals.weighted
        acc.totalForecast += current.forecast.weighted
        return acc
      },
      { totalNow: 0, totalActuals: 0, totalForecast: 0 }
    )

    const topStudy = workloads.reduce((prev, current) =>
      current.forecast.weighted > prev.forecast.weighted ? current : prev
    )

    return {
      totalNow: Math.round(totals.totalNow),
      totalActuals: Math.round(totals.totalActuals),
      totalForecast: Math.round(totals.totalForecast),
      avgForecast: Math.round(totals.totalForecast / workloads.length),
      topStudy
    }
  }, [workloads])

  const formatPoints = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const forecastLabel = (points: number) => {
    if (points >= 300) return 'Critical'
    if (points >= 220) return 'High'
    if (points >= 150) return 'Elevated'
    return 'Balanced'
  }

  if (loading) {
    return (
      <div className={`${className ?? ''}`}>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse">
          <div className="h-5 w-40 bg-gray-700 rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="h-3 bg-gray-700 rounded w-20" />
                <div className="h-5 bg-gray-700 rounded w-16" />
              </div>
            ))}
          </div>
          <div className="h-48 bg-gray-800 rounded-lg" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${className ?? ''}`}>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Coordinator Workload</h3>
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchWorkloads}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (workloads.length === 0) {
    return (
      <div className={`${className ?? ''}`}>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
          <h3 className="text-lg font-semibold text-white mb-2">Coordinator Workload</h3>
          <p>No workload data available yet. Add subjects and visits to generate workload metrics.</p>
        </div>
      </div>
    )
  }

  const orderedWorkloads = [...workloads].sort(
    (a, b) => b.forecast.weighted - a.forecast.weighted
  )

  return (
    <div className={`${className ?? ''} space-y-6`}>
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">Coordinator Workload Outlook</h3>
            <p className="text-sm text-gray-400">
              Weighted workload points with lifecycle, recruitment, visit intensity, and coordinator metrics adjustments
            </p>
          </div>
          {summary.topStudy && (
            <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-blue-300 mb-1">
                Highest 4-week forecast
              </div>
              <div className="text-sm text-white font-medium">
                {summary.topStudy.studyTitle}
              </div>
              <div className="text-xs text-gray-300">
                {formatPoints(summary.topStudy.forecast.weighted)} pts ·{' '}
                {forecastLabel(summary.topStudy.forecast.weighted)}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Current load</div>
            <div className="text-2xl font-semibold text-white">
              {formatPoints(summary.totalNow)} pts
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Completed to date</div>
            <div className="text-2xl font-semibold text-emerald-400">
              {formatPoints(summary.totalActuals)} pts
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">4-week forecast</div>
            <div className="text-2xl font-semibold text-amber-400">
              {formatPoints(summary.totalForecast)} pts
            </div>
          </div>
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Avg per study</div>
            <div className="text-2xl font-semibold text-white">
              {formatPoints(summary.avgForecast)} pts
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700 text-sm">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-300">Study</th>
                <th className="px-4 py-3 text-left font-medium text-gray-300">Lifecycle</th>
                <th className="px-4 py-3 text-left font-medium text-gray-300">Study Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Meetings (hrs)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Screening (hrs/studies)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Queries (hrs/studies)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Screening ×</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Query ×</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Meeting pts</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Now</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Actuals</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">4-Week Forecast</th>
                <th className="px-4 py-3 text-right font-medium text-gray-300">Label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {orderedWorkloads.map((entry) => (
                <tr key={entry.studyId} className="hover:bg-gray-900/40 transition-colors">
                  <td className="px-4 py-3 text-white">
                    <div className="font-medium">{entry.studyTitle}</div>
                    <div className="text-xs text-gray-400">{entry.protocolNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 capitalize">
                    {entry.lifecycle ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {entry.recruitment ? formatRecruitmentStatus(entry.recruitment) : formatStudyStatus(entry.status)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    <div>{entry.metrics.avgMeetingHours.toFixed(1)} h</div>
                    <div className="text-[11px] text-gray-500">
                      {entry.metrics.entries > 0
                        ? `${entry.metrics.entries} submission${entry.metrics.entries === 1 ? '' : 's'} · ${entry.metrics.contributors} contributor${entry.metrics.contributors === 1 ? '' : 's'}${entry.metrics.lastWeekStart ? ` · latest ${entry.metrics.lastWeekStart}` : ''}`
                        : 'No coordinator submissions'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    <div>{entry.metrics.avgScreeningHours.toFixed(1)} h</div>
                    <div className="text-[11px] text-gray-500">{entry.metrics.avgScreeningStudyCount.toFixed(1)} studies</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    <div>{entry.metrics.avgQueryHours.toFixed(1)} h</div>
                    <div className="text-[11px] text-gray-500">{entry.metrics.avgQueryStudyCount.toFixed(1)} studies</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    <div>{entry.screeningMultiplierEffective.toFixed(2)}</div>
                    {entry.screeningMultiplierEffective !== entry.screeningMultiplier && (
                      <div className="text-[11px] text-gray-500">base {entry.screeningMultiplier.toFixed(2)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    <div>{entry.queryMultiplierEffective.toFixed(2)}</div>
                    {entry.queryMultiplierEffective !== entry.queryMultiplier && (
                      <div className="text-[11px] text-gray-500">base {entry.queryMultiplier.toFixed(2)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-200">
                    <div>{entry.meetingAdminPointsAdjusted.toFixed(1)}</div>
                    {entry.meetingAdminPointsAdjusted !== entry.meetingAdminPoints && (
                      <div className="text-[11px] text-gray-500">base {entry.meetingAdminPoints.toFixed(1)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {formatPoints(entry.now.weighted)}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {formatPoints(entry.actuals.weighted)}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {formatPoints(entry.forecast.weighted)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        entry.forecast.weighted >= 300
                          ? 'bg-red-500/20 text-red-300'
                          : entry.forecast.weighted >= 220
                          ? 'bg-orange-500/20 text-orange-200'
                          : entry.forecast.weighted >= 150
                          ? 'bg-yellow-500/20 text-yellow-200'
                          : 'bg-emerald-500/20 text-emerald-200'
                      }`}
                    >
                      {forecastLabel(entry.forecast.weighted)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
