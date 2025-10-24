'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface WorkloadEntry {
  studyId: string
  studyTitle: string
  protocolNumber: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  meetingAdminPoints: number
  now: number
  actuals: number
  forecast: number
}

const formatStatus = (value: string | null | undefined) => {
  if (!value) return '—'
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const formatPoints = (value: number) =>
  Math.round(value).toLocaleString('en-US')

const formatMeeting = (value: number) => value.toFixed(1)

const loadLabel = (points: number) => {
  if (points >= 300) return { label: 'Critical', className: 'bg-red-500/15 text-red-300 border border-red-500/30' }
  if (points >= 220) return { label: 'High', className: 'bg-orange-500/15 text-orange-200 border border-orange-500/30' }
  if (points >= 150) return { label: 'Elevated', className: 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/30' }
  return { label: 'Balanced', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' }
}

export default function WorkloadConfigurator() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workloads, setWorkloads] = useState<WorkloadEntry[]>([])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

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
        const entries = (payload.workloads || []).map((row: any) => ({
          studyId: row.studyId,
          studyTitle: row.studyTitle,
          protocolNumber: row.protocolNumber,
          lifecycle: row.lifecycle,
          recruitment: row.recruitment,
          status: row.status,
          meetingAdminPoints: Number(row.meetingAdminPoints ?? 0),
          now: Number(row?.now?.weighted ?? 0),
          actuals: Number(row?.actuals?.weighted ?? 0),
          forecast: Number(row?.forecast?.weighted ?? 0)
        })) as WorkloadEntry[]

        if (!mounted) return
        setWorkloads(entries)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load workload analytics')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

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
                  <p className="text-white">{formatMeeting(entry.meetingAdminPoints)} pts/mo</p>
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
    </div>
  )
}
