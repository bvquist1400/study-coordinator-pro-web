'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'

interface Visit {
  id: string
  visit_name: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  is_within_window: boolean | null
  days_from_scheduled: number | null
  subject_number: string
  subject_id: string
  procedures_completed: string[]
  visit_schedule_id: string | null
  subject_section_id?: string | null
  study_protocol_number?: string | null
  study_title?: string | null
  // We'll need these to calculate window
  subjects?: {
    // anchor not used; anchor comes from subject_sections
  }
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

interface VisitListViewProps {
  studyId: string
  onVisitClick: (visitId: string) => void
  refreshKey?: number
}

export default function VisitListView({ studyId, onVisitClick, refreshKey }: VisitListViewProps) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<keyof Visit>('visit_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const loadVisits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/subject-visits?study_id=${studyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setVisits(data.subjectVisits || [])
      } else {
        const err = await response.json().catch(() => ({}))
        console.error('Failed loading visits:', response.status, err)
        setVisits([])
      }
    } catch (e) {
      console.error('Error loading visits:', e)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadVisits()
  }, [loadVisits, refreshKey])

  // Load userId for personalized persistence
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.id) setUserId(user.id)
      } catch {}
    })()
  }, [])

  // Load persisted filters per user + study on mount or when userId/studyId changes
  useEffect(() => {
    if (!studyId) return
    try {
      const base = `visits:list:${userId || 'anon'}:${studyId}`
      const s = typeof window !== 'undefined' ? localStorage.getItem(`${base}:status`) : null
      const q = typeof window !== 'undefined' ? localStorage.getItem(`${base}:search`) : null
      if (s) setStatusFilter(s)
      if (q) setSearchTerm(q)
    } catch {}
  }, [userId, studyId])

  // Persist filters on change
  useEffect(() => {
    if (!studyId) return
    try {
      const base = `visits:list:${userId || 'anon'}:${studyId}`
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${base}:status`, statusFilter)
        localStorage.setItem(`${base}:search`, searchTerm)
      }
    } catch {}
  }, [statusFilter, searchTerm, userId, studyId])


  const handleSort = (field: keyof Visit) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getStatusBadge = (status: string, isWithinWindow?: boolean | null) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full"
    
    switch (status) {
      case 'completed':
        return isWithinWindow 
          ? `${baseClasses} bg-green-900/50 text-green-300 border border-green-600`
          : `${baseClasses} bg-yellow-900/50 text-yellow-300 border border-yellow-600`
      case 'scheduled':
        return `${baseClasses} bg-blue-900/50 text-blue-300 border border-blue-600`
      case 'missed':
        return `${baseClasses} bg-red-900/50 text-red-300 border border-red-600`
      case 'cancelled':
        return `${baseClasses} bg-gray-900/50 text-gray-300 border border-gray-600`
      default:
        return `${baseClasses} bg-gray-900/50 text-gray-300 border border-gray-600`
    }
  }

  const formatDate = (dateString: string) => formatDateUTC(dateString, 'en-US')

  const getVisitWindow = (visit: Visit) => {
    if (!visit.visit_schedules) {
      return visit.days_from_scheduled !== null ? (
        <span className={visit.days_from_scheduled === 0 ? 'text-green-300' : 
          Math.abs(visit.days_from_scheduled) <= 3 ? 'text-yellow-300' : 'text-red-300'}>
          {visit.days_from_scheduled > 0 ? '+' : ''}{visit.days_from_scheduled}d
        </span>
      ) : '-'
    }

    try {
      // Prefer section anchor_date if present; else randomization_date
      let anchorDateStr: string | null = null
      if (visit.subject_sections?.anchor_date) anchorDateStr = visit.subject_sections.anchor_date
      else if (visit.subjects?.randomization_date) anchorDateStr = visit.subjects.randomization_date

      if (!anchorDateStr) {
        return '-'
      }

      const anchorDate = parseDateUTC(anchorDateStr) || new Date(anchorDateStr)
      const targetDate = new Date(anchorDate)
      targetDate.setDate(anchorDate.getDate() + visit.visit_schedules.visit_day)

      // Calculate window
      const windowBefore = visit.visit_schedules.window_before_days || 7
      const windowAfter = visit.visit_schedules.window_after_days || 7
      
      const windowStart = new Date(targetDate)
      windowStart.setDate(targetDate.getDate() - windowBefore)
      
      const windowEnd = new Date(targetDate)  
      windowEnd.setDate(targetDate.getDate() + windowAfter)

      const startStr = formatDateUTC(windowStart, 'en-US', { month: 'short', day: 'numeric' })
      const endStr = formatDateUTC(windowEnd, 'en-US', { month: 'short', day: 'numeric' })
      
      return `${startStr} - ${endStr}`
    } catch {
      // Fallback to showing days from scheduled
      return visit.days_from_scheduled !== null ? (
        <span className={visit.days_from_scheduled === 0 ? 'text-green-300' : 
          Math.abs(visit.days_from_scheduled) <= 3 ? 'text-yellow-300' : 'text-red-300'}>
          {visit.days_from_scheduled > 0 ? '+' : ''}{visit.days_from_scheduled}d
        </span>
      ) : '-'
    }
  }

  const filteredAndSortedVisits = visits
    .filter(visit => {
      const matchesStatus = statusFilter === 'all' || visit.status === statusFilter
      const matchesSearch = searchTerm === '' || 
        visit.subject_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        visit.visit_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (visit.study_protocol_number && visit.study_protocol_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (visit.study_title && visit.study_title.toLowerCase().includes(searchTerm.toLowerCase()))
      return matchesStatus && matchesSearch
    })
    .sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]
      
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1
      
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      return sortDirection === 'asc' ? comparison : -comparison
    })

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="animate-pulse p-6">
          <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Filters and Search */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by subject number or visit name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Visit Table */}
      {filteredAndSortedVisits.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/50">
              <tr>
                {studyId === 'all' && (
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={() => handleSort('study_protocol_number')}
                      className="flex items-center space-x-1 text-xs font-medium text-gray-300 uppercase tracking-wider hover:text-white"
                    >
                      <span>Study</span>
                      {sortField === 'study_protocol_number' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                  </th>
                )}
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('subject_number')}
                    className="flex items-center space-x-1 text-xs font-medium text-gray-300 uppercase tracking-wider hover:text-white"
                  >
                    <span>Subject</span>
                    {sortField === 'subject_number' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('visit_name')}
                    className="flex items-center space-x-1 text-xs font-medium text-gray-300 uppercase tracking-wider hover:text-white"
                  >
                    <span>Visit</span>
                    {sortField === 'visit_name' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('visit_date')}
                    className="flex items-center space-x-1 text-xs font-medium text-gray-300 uppercase tracking-wider hover:text-white"
                  >
                    <span>Visit Date</span>
                    {sortField === 'visit_date' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                
                <th className="px-6 py-3 text-left">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center space-x-1 text-xs font-medium text-gray-300 uppercase tracking-wider hover:text-white"
                  >
                    <span>Status</span>
                    {sortField === 'status' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Window
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredAndSortedVisits.map((visit) => (
                <tr 
                  key={visit.id} 
                  className="hover:bg-gray-700/30 transition-colors cursor-pointer"
                  onClick={() => onVisitClick(visit.id)}
                >
                  {studyId === 'all' && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        <div className="font-medium text-white">{visit.study_protocol_number}</div>
                        <div className="text-xs text-gray-400 truncate max-w-32" title={visit.study_title}>
                          {visit.study_title}
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">
                      {visit.subject_number}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300 flex items-center gap-2">
                      <span>{visit.visit_name}</span>
                      {visit.subject_sections?.study_sections?.code && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 border border-gray-600 text-gray-200">
                          {visit.subject_sections.study_sections.code}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-300">
                      {formatDate(visit.visit_date)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadge(visit.status, visit.is_within_window)}>
                      {visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                      {visit.status === 'completed' && visit.is_within_window === false && ' (OOW)'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-300">
                      {getVisitWindow(visit)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onVisitClick(visit.id)
                      }}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center">
          <div className="text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4l6 6m0-6l-6 6" />
            </svg>
            <p className="text-lg mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No visits match your filters' : 'No visits scheduled yet'}
            </p>
            <p className="text-sm">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search criteria'
                : 'Schedule visits to see them here'
              }
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
