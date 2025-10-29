'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase/client'

interface CoordinatorMetricEntry {
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

interface CoordinatorOption {
  id: string
  name: string
  email: string | null
  assignments: Array<{ id: string; studyTitle: string; protocolNumber: string; joinedAt: string; role: string | null }>
}

interface CoordinatorMetricsPanelProps {
  coordinators: CoordinatorOption[]
  onMetricsSaved?: () => void | Promise<void>
}

const getCurrentWeekStart = () => {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday baseline
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

const toHourString = (value: number) => (Math.round(value * 100) / 100).toFixed(2)

const parseHourInput = (value: string) => {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.round(parsed * 100) / 100
  }
  return 0
}

const parseCountInput = (value: string) => {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed)
  }
  return 0
}

export default function CoordinatorMetricsPanel({ coordinators, onMetricsSaved }: CoordinatorMetricsPanelProps) {
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState(coordinators[0]?.id ?? '')
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart())
  const [meetingHours, setMeetingHours] = useState('0')
  const [screeningHours, setScreeningHours] = useState('0')
  const [screeningStudyCount, setScreeningStudyCount] = useState('0')
  const [queryHours, setQueryHours] = useState('0')
  const [queryStudyCount, setQueryStudyCount] = useState('0')
  const [notes, setNotes] = useState('')
  const [metrics, setMetrics] = useState<CoordinatorMetricEntry[]>([])
  const [assignments, setAssignments] = useState<CoordinatorOption['assignments']>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (coordinators.length === 0) {
      setSelectedCoordinatorId('')
      return
    }
    if (!coordinators.find((coordinator) => coordinator.id === selectedCoordinatorId)) {
      setSelectedCoordinatorId(coordinators[0].id)
    }
  }, [coordinators, selectedCoordinatorId])

  const loadMetrics = useCallback(async (coordinatorId: string) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
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
      const entries = (payload.metrics || []).map((row: any) => ({
        id: row.id,
        weekStart: row.week_start ?? row.weekStart,
        meetingHours: Number(row.meeting_hours ?? row.meetingHours ?? row.admin_hours ?? 0),
        screeningHours: Number(row.screening_hours ?? row.screeningHours ?? 0),
        screeningStudyCount: Number(row.screening_study_count ?? row.screeningStudyCount ?? 0),
        queryHours: Number(row.query_hours ?? row.queryHours ?? 0),
        queryStudyCount: Number(row.query_study_count ?? row.queryStudyCount ?? 0),
        notes: row.notes ?? null,
        updatedAt: row.updated_at ?? row.updatedAt ?? ''
      })) as CoordinatorMetricEntry[]

      setMetrics(entries)
      setAssignments(payload.assignments ?? [])

      if (entries.length > 0) {
        const latest = entries[0]
        if (latest.weekStart) {
          setWeekStart(latest.weekStart)
        }
        setMeetingHours(toHourString(latest.meetingHours))
        setScreeningHours(toHourString(latest.screeningHours))
        setScreeningStudyCount(String(Math.round(latest.screeningStudyCount)))
        setQueryHours(toHourString(latest.queryHours))
        setQueryStudyCount(String(Math.round(latest.queryStudyCount)))
        setNotes(latest.notes ?? '')
      } else {
        setMeetingHours('0')
        setScreeningHours('0')
        setScreeningStudyCount('0')
        setQueryHours('0')
        setQueryStudyCount('0')
        setNotes('')
        setWeekStart(getCurrentWeekStart())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coordinator metrics')
      setMetrics([])
      setAssignments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedCoordinatorId) return
    const fallbackAssignments = coordinators.find((coordinator) => coordinator.id === selectedCoordinatorId)?.assignments ?? []
    setAssignments(fallbackAssignments)
    loadMetrics(selectedCoordinatorId).catch(() => {
      // error already handled inside loadMetrics
    })
  }, [coordinators, loadMetrics, selectedCoordinatorId])

  const selectedCoordinator = useMemo(
    () => coordinators.find((coordinator) => coordinator.id === selectedCoordinatorId) ?? null,
    [selectedCoordinatorId, coordinators]
  )

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCoordinatorId) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const meetings = parseHourInput(meetingHours)
      const screening = parseHourInput(screeningHours)
      const screeningCount = parseCountInput(screeningStudyCount)
      const query = parseHourInput(queryHours)
      const queryCount = parseCountInput(queryStudyCount)
      const payload = {
        coordinatorId: selectedCoordinatorId,
        weekStart,
        meetingHours: meetings,
        screeningHours: screening,
        screeningStudyCount: screeningCount,
        queryHours: query,
        queryStudyCount: queryCount,
        notes: notes.trim() ? notes.trim() : null
      }

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
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to save coordinator metrics')
      }

      setSuccess('Coordinator metrics saved')
      await loadMetrics(selectedCoordinatorId)
      if (onMetricsSaved) {
        await onMetricsSaved()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save coordinator metrics')
    } finally {
      setSaving(false)
    }
  }, [loadMetrics, meetingHours, notes, onMetricsSaved, queryHours, queryStudyCount, screeningHours, screeningStudyCount, selectedCoordinatorId, weekStart])

  if (coordinators.length === 0) {
    return null
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-6 space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">Coordinator Weekly Workload Log</h3>
        <p className="text-sm text-gray-300">
          Estimate your total hours for the current week. Include all studies you supported—approximations are welcome.
        </p>
        <p className="text-xs text-gray-500">
          Example: “4 hours resolving queries across 3 studies.” These inputs inform portfolio workload adjustments.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Coordinator</span>
            <select
              value={selectedCoordinatorId}
              onChange={(event) => {
                setSelectedCoordinatorId(event.target.value)
                setWeekStart(getCurrentWeekStart())
              }}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {coordinators.map((coordinator) => (
                <option key={coordinator.id} value={coordinator.id}>
                  {coordinator.name}
                </option>
              ))}
            </select>
            {selectedCoordinator && (
              <p className="text-xs text-gray-500">
                {selectedCoordinator.email ?? 'No email on file'}
              </p>
            )}
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Week starting</span>
            <input
              type="date"
              value={weekStart}
              max={getCurrentWeekStart()}
              onChange={(event) => setWeekStart(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </label>
        </div>

        <div className="rounded-md border border-gray-800 bg-gray-950/70 p-3 text-xs text-gray-400 space-y-1">
          <div className="font-semibold text-gray-200">Assigned studies</div>
          {assignments.length === 0 ? (
            <div>No linked studies yet. Hours will be applied once this coordinator is assigned.</div>
          ) : (
            assignments.map((assignment) => (
              <div key={assignment.id}>
                {assignment.studyTitle} · {assignment.protocolNumber}
                {assignment.role ? ` — ${assignment.role}` : ''}
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Hours spent in meetings</span>
            <span className="text-xs text-gray-500">Include study, site, sponsor, and internal meetings.</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={meetingHours}
              onChange={(event) => setMeetingHours(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 6.5"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Screening hours</span>
            <span className="text-xs text-gray-500">Total time spent screening participants.</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={screeningHours}
              onChange={(event) => setScreeningHours(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 5"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Query/data hours</span>
            <span className="text-xs text-gray-500">Time resolving data queries or EDC work.</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={queryHours}
              onChange={(event) => setQueryHours(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 4"
              required
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Studies screened</span>
            <input
              type="number"
              step="1"
              min="0"
              value={screeningStudyCount}
              onChange={(event) => setScreeningStudyCount(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 3"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-gray-300">Studies with data queries</span>
            <input
              type="number"
              step="1"
              min="0"
              value={queryStudyCount}
              onChange={(event) => setQueryStudyCount(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 2"
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-gray-300">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Context for this week’s workload (e.g., monitor visit, database lock prep)."
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || loading || !selectedCoordinator}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:cursor-not-allowed disabled:bg-blue-900/50"
          >
            {saving ? 'Saving...' : 'Save weekly metrics'}
          </button>
          {success && <span className="text-xs text-emerald-300">{success}</span>}
          {error && <span className="text-xs text-red-300">{error}</span>}
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Recent submissions</h4>
          {selectedCoordinator && (
            <p className="text-xs text-gray-500">
              Showing last {metrics.length} weeks for {selectedCoordinator.name}
            </p>
          )}
        </div>

        {loading ? (
          <div className="h-24 rounded-md border border-gray-800 bg-gray-950/70 animate-pulse" />
        ) : metrics.length === 0 ? (
          <div className="rounded-md border border-gray-800 bg-gray-950/70 px-4 py-6 text-center text-sm text-gray-400">
            No coordinator metrics captured yet. Log this week’s workload to start building a trendline.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800 text-sm">
              <thead className="bg-gray-950/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-300">Week starting</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-300">Meetings (hrs)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-300">Screening (hrs / studies)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-300">Queries (hrs / studies)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-300">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {metrics.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="px-4 py-3 text-white">{entry.weekStart}</td>
                    <td className="px-4 py-3 text-right text-gray-200">{toHourString(entry.meetingHours)}</td>
                    <td className="px-4 py-3 text-right text-gray-200">
                      {toHourString(entry.screeningHours)} · {entry.screeningStudyCount} studies
                    </td>
                    <td className="px-4 py-3 text-right text-gray-200">
                      {toHourString(entry.queryHours)} · {entry.queryStudyCount} studies
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {entry.notes ? entry.notes : <span className="text-gray-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
