'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'
import VisitDetailModal from '@/components/visits/VisitDetailModal'

type VisitStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled'

interface Visit {
  id: string
  visit_name: string
  visit_date: string
  status: VisitStatus
  is_within_window: boolean | null
  days_from_scheduled: number | null
  subject_number: string
  subject_id: string
  procedures_completed: string[]
  visit_schedule_id: string | null
  subject_section_id?: string | null
  study_protocol_number?: string | null
  study_title?: string | null
  subject_sections?: {
    anchor_date: string | null
    study_section_id?: string | null
    study_sections?: { code?: string | null; name?: string | null } | null
  } | null
  visit_schedules?: {
    visit_day: number
    window_before_days: number | null
    window_after_days: number | null
  }
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getStatusBadge(status: VisitStatus, isWithinWindow?: boolean | null) {
  const base = 'px-2 py-1 text-xs font-medium rounded-full'
  switch (status) {
    case 'completed':
      return isWithinWindow
        ? `${base} bg-green-900/50 text-green-300 border border-green-600`
        : `${base} bg-yellow-900/50 text-yellow-300 border border-yellow-600`
    case 'scheduled':
      return `${base} bg-blue-900/50 text-blue-300 border border-blue-600`
    case 'missed':
      return `${base} bg-red-900/50 text-red-300 border border-red-600`
    case 'cancelled':
      return `${base} bg-gray-900/50 text-gray-300 border border-gray-600`
    default:
      return `${base} bg-gray-900/50 text-gray-300 border border-gray-600`
  }
}

function WindowCell({ visit }: { visit: Visit }) {
  if (!visit.visit_schedules) {
    return (
      <span className="text-gray-300">
        {visit.days_from_scheduled !== null
          ? (
            <span className={visit.days_from_scheduled === 0
              ? 'text-green-300'
              : Math.abs(visit.days_from_scheduled) <= 3
              ? 'text-yellow-300'
              : 'text-red-300'}>
              {visit.days_from_scheduled > 0 ? '+' : ''}{visit.days_from_scheduled}d
            </span>
          )
          : '-'}
      </span>
    )
  }

  try {
    const anchorDateStr = visit.subject_sections?.anchor_date
    if (!anchorDateStr) return <span className="text-gray-300">-</span>

    const anchorDate = parseDateUTC(anchorDateStr) || new Date(anchorDateStr)
    const targetDate = new Date(anchorDate)
    const dayOffset = visit.visit_schedules.visit_day ?? 0
    targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset)

    const windowBefore = visit.visit_schedules.window_before_days || 7
    const windowAfter = visit.visit_schedules.window_after_days || 7

    const windowStart = new Date(targetDate)
    windowStart.setUTCDate(targetDate.getUTCDate() - windowBefore)

    const windowEnd = new Date(targetDate)
    windowEnd.setUTCDate(targetDate.getUTCDate() + windowAfter)

    const startStr = formatDateUTC(windowStart, 'en-US', { month: 'short', day: 'numeric' })
    const endStr = formatDateUTC(windowEnd, 'en-US', { month: 'short', day: 'numeric' })
    return <span className="text-gray-300">{startStr} - {endStr}</span>
  } catch {
    return (
      <span className="text-gray-300">
        {visit.days_from_scheduled !== null
          ? (
            <span className={visit.days_from_scheduled === 0
              ? 'text-green-300'
              : Math.abs(visit.days_from_scheduled) <= 3
              ? 'text-yellow-300'
              : 'text-red-300'}>
              {visit.days_from_scheduled > 0 ? '+' : ''}{visit.days_from_scheduled}d
            </span>
          )
          : '-'}
      </span>
    )
  }
}

export default function UpcomingVisits() {
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<Visit[]>([])
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const dateRange = useMemo(() => {
    const today = new Date()
    const end = new Date()
    end.setDate(today.getDate() + 7)
    return { start: toISODate(today), end: toISODate(end) }
  }, [])

  const loadVisits = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setVisits([])
        return
      }
      const url = `/api/subject-visits?studyId=all&startDate=${dateRange.start}&endDate=${dateRange.end}`
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) {
        setVisits([])
        return
      }
      const json = await resp.json()
      const all = (json.subjectVisits || []) as Visit[]
      const upcoming = all
        .filter(v => v.status === 'scheduled')
        .sort((a, b) => (a.visit_date < b.visit_date ? -1 : a.visit_date > b.visit_date ? 1 : 0))
        .slice(0, 25)
      setVisits(upcoming)
    } finally {
      setLoading(false)
    }
  }, [dateRange.end, dateRange.start])

  useEffect(() => {
    loadVisits()
  }, [loadVisits, refreshKey])

  const handleOpen = (visitId: string) => setSelectedVisitId(visitId)
  const handleClose = () => setSelectedVisitId(null)
  const handleUpdated = () => {
    setSelectedVisitId(null)
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Upcoming Visits (7 days)</h3>
          <p className="text-xs text-gray-400">Shows studies you have access to</p>
        </div>
        <div className="text-sm text-gray-300">{loading ? '…' : `${visits.length} scheduled`}</div>
      </div>

      {loading ? (
        <div className="p-6 animate-pulse">
          <div className="h-10 bg-gray-700 rounded mb-3" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      ) : visits.length === 0 ? (
        <div className="p-6 text-sm text-gray-400">No upcoming visits in the next 7 days.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Study</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Subject</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Visit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Visit Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Window</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {visits.map(v => (
                <tr key={v.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-300">
                      <div className="font-medium text-white">{v.study_protocol_number}</div>
                      <div className="text-xs text-gray-400 truncate max-w-40" title={v.study_title || undefined}>{v.study_title}</div>
                    </div>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">{v.subject_number}</div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="text-sm text-gray-300 flex items-center gap-2">
                      <span>{v.visit_name}</span>
                      {v.subject_sections?.study_sections?.code && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 border border-gray-600 text-gray-200">
                          {v.subject_sections.study_sections.code}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-300">{formatDateUTC(v.visit_date, 'en-US')}</td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm">
                    <span className={getStatusBadge(v.status, v.is_within_window)}>
                      {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm"><WindowCell visit={v} /></td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleOpen(v.id)}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedVisitId && (
        <VisitDetailModal
          visitId={selectedVisitId}
          onClose={handleClose}
          onUpdate={handleUpdated}
        />
      )}
    </div>
  )
}

