'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Subject {
  id: string
  subject_number: string
  gender: string | null
  enrollment_date: string
  randomization_date: string | null
  treatment_arm: string | null
  status: 'screening' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
  discontinuation_reason: string | null
  discontinuation_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface SubjectMetrics {
  total_visits: number
  completed_visits: number
  upcoming_visits: number
  overdue_visits: number
  last_visit_date: string | null
  last_visit_name: string | null
  next_visit_date: string | null
  next_visit_name: string | null
  visit_compliance_rate: number
  days_since_last_visit: number | null
  days_until_next_visit: number | null
}

interface Visit {
  id: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  notes: string | null
  visit_schedules: {
    id: string
    visit_name: string
    visit_day: number
    visit_window_before: number | null
    visit_window_after: number | null
  }
}

interface SubjectDetailModalProps {
  subjectId: string
  studyId: string
  isOpen: boolean
  onClose: () => void
}

const statusColors = {
  screening: 'bg-yellow-900/30 text-yellow-300 border-yellow-600/50',
  active: 'bg-green-900/30 text-green-300 border-green-600/50',
  completed: 'bg-purple-900/30 text-purple-300 border-purple-600/50',
  discontinued: 'bg-red-900/30 text-red-300 border-red-600/50',
  withdrawn: 'bg-gray-900/30 text-gray-300 border-gray-600/50'
}

const visitStatusColors = {
  completed: 'bg-green-600',
  scheduled: 'bg-blue-600',
  missed: 'bg-red-600',
  cancelled: 'bg-gray-600'
}

const visitStatusLabels = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  missed: 'Missed',
  cancelled: 'Cancelled'
}

export default function SubjectDetailModal({ subjectId, studyId, isOpen, onClose }: SubjectDetailModalProps) {
  const [subject, setSubject] = useState<Subject | null>(null)
  const [metrics, setMetrics] = useState<SubjectMetrics | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'compliance' | 'notes'>('timeline')

  useEffect(() => {
    if (isOpen && subjectId) {
      loadSubjectDetail()
    }
  }, [isOpen, subjectId])

  const loadSubjectDetail = async () => {
    try {
      setLoading(true)

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!session?.user || !token) {
        console.error('No authenticated user')
        return
      }

      // Fetch subject with metrics
      const response = await fetch(`/api/subjects?study_id=${studyId}&include_metrics=true`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const { subjects } = await response.json()
        const currentSubject = subjects.find((s: any) => s.id === subjectId)
        
        if (currentSubject) {
          setSubject(currentSubject)
          setMetrics(currentSubject.metrics)
        }
      }

      // Fetch detailed visit information
      const { data: visitData, error: visitError } = await supabase
        .from('subject_visits')
        .select(`
          id,
          visit_date,
          status,
          notes,
          visit_schedules!inner(
            id,
            visit_name,
            visit_day,
            visit_window_before,
            visit_window_after
          )
        `)
        .eq('subject_id', subjectId)
        .order('visit_date', { ascending: true })

      if (visitError) {
        console.error('Error fetching visits:', visitError)
      } else {
        setVisits(visitData || [])
      }

    } catch (error) {
      console.error('Error loading subject detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    // Handle date-only strings (YYYY-MM-DD) by treating as local timezone
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number)
      const dt = new Date(year, month - 1, day) // month is 0-indexed
      return dt.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      })
    }
    // Handle full datetime strings
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return null
    // For datetime strings, use the regular Date constructor
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getVisitWindow = (visit: Visit) => {
    const windowBefore = visit.visit_schedules.visit_window_before || 0
    const windowAfter = visit.visit_schedules.visit_window_after || 0
    
    if (windowBefore === 0 && windowAfter === 0) return null
    
    const visitDate = new Date(visit.visit_date)
    const windowStart = new Date(visitDate)
    windowStart.setDate(windowStart.getDate() - windowBefore)
    const windowEnd = new Date(visitDate)
    windowEnd.setDate(windowEnd.getDate() + windowAfter)
    
    return {
      start: windowStart,
      end: windowEnd,
      label: `±${Math.max(windowBefore, windowAfter)} days`
    }
  }

  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return 'text-green-400'
    if (rate >= 75) return 'text-yellow-400'
    return 'text-red-400'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800/50 px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-2xl font-bold text-white">
                {subject?.subject_number || 'Loading...'}
              </h2>
              {subject && (
                <div className="flex items-center space-x-3 mt-1">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full border ${statusColors[subject.status]}`}>
                    {subject.status.charAt(0).toUpperCase() + subject.status.slice(1)}
                  </span>
                  {subject.treatment_arm && (
                    <span className="text-sm text-gray-400">{subject.treatment_arm}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="px-6 pt-4">
              <div className="flex space-x-4 border-b border-gray-700">
                {[
                  { id: 'timeline', label: 'Visit Timeline', icon: '📅' },
                  { id: 'compliance', label: 'Compliance Analytics', icon: '📊' },
                  { id: 'notes', label: 'Notes & History', icon: '📝' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span className="mr-2">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  {metrics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-800/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-white">{metrics.completed_visits}</div>
                        <div className="text-xs text-gray-400">Completed</div>
                      </div>
                      <div className="bg-gray-800/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-blue-400">{metrics.upcoming_visits}</div>
                        <div className="text-xs text-gray-400">Upcoming</div>
                      </div>
                      <div className="bg-gray-800/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-red-400">{metrics.overdue_visits}</div>
                        <div className="text-xs text-gray-400">Overdue</div>
                      </div>
                      <div className="bg-gray-800/30 rounded-lg p-4 text-center">
                        <div className={`text-2xl font-bold ${getComplianceColor(metrics.visit_compliance_rate)}`}>
                          {Math.round(metrics.visit_compliance_rate)}%
                        </div>
                        <div className="text-xs text-gray-400">On-Time Rate</div>
                      </div>
                    </div>
                  )}

                  {/* Visit Timeline */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white mb-4">Visit Timeline</h3>
                    {visits.length > 0 ? (
                      <div className="space-y-3">
                        {visits.map((visit, index) => {
                          const window = getVisitWindow(visit)
                          const isOverdue = visit.status === 'scheduled' && new Date(visit.visit_date) < new Date()
                          
                          return (
                            <div
                              key={visit.id}
                              className={`bg-gray-800/30 rounded-lg p-4 border-l-4 ${
                                isOverdue ? 'border-red-500' : `border-${visitStatusColors[visit.status].replace('bg-', '')}`
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3 mb-2">
                                    <h4 className="text-lg font-medium text-white">
                                      {visit.visit_schedules.visit_name}
                                    </h4>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full text-white ${visitStatusColors[visit.status]}`}>
                                      {visitStatusLabels[visit.status]}
                                    </span>
                                    {isOverdue && (
                                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-600 text-white">
                                        OVERDUE
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-1 text-sm text-gray-300">
                                    <div>
                                      <span className="text-gray-400">Visit Day:</span> {visit.visit_schedules.visit_day}
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Date:</span> {formatDateTime(visit.visit_date)}
                                    </div>
                                    {window && (
                                      <div>
                                        <span className="text-gray-400">Window:</span> {window.label}
                                      </div>
                                    )}
                                    {visit.notes && (
                                      <div className="mt-2">
                                        <span className="text-gray-400">Notes:</span>
                                        <div className="mt-1 text-gray-300 bg-gray-800/50 rounded p-2">
                                          {visit.notes}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="text-right text-sm text-gray-400">
                                  #{index + 1}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No visits scheduled for this subject yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'compliance' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white">Compliance Analytics</h3>
                  
                  {metrics && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Visit Completion Rate */}
                      <div className="bg-gray-800/30 rounded-lg p-6">
                        <h4 className="text-white font-medium mb-4">Visit Completion Progress</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Progress</span>
                            <span className="text-white">
                              {metrics.completed_visits}/{metrics.total_visits} visits
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div
                              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                              style={{ 
                                width: `${metrics.total_visits > 0 ? (metrics.completed_visits / metrics.total_visits) * 100 : 0}%` 
                              }}
                            />
                          </div>
                          <div className="text-2xl font-bold text-white">
                            {metrics.total_visits > 0 ? Math.round((metrics.completed_visits / metrics.total_visits) * 100) : 0}%
                          </div>
                        </div>
                      </div>

                      {/* Visit Timing Compliance */}
                      <div className="bg-gray-800/30 rounded-lg p-6">
                        <h4 className="text-white font-medium mb-4">Visit Timing Compliance</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">On-Time Rate</span>
                            <span className={getComplianceColor(metrics.visit_compliance_rate)}>
                              {Math.round(metrics.visit_compliance_rate)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all duration-500 ${
                                metrics.visit_compliance_rate >= 90 ? 'bg-green-600' :
                                metrics.visit_compliance_rate >= 75 ? 'bg-yellow-600' : 'bg-red-600'
                              }`}
                              style={{ width: `${Math.min(100, metrics.visit_compliance_rate)}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-400">
                            Visits completed within ±3 days of scheduled date
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white">Notes & Communication History</h3>
                  
                  {/* Subject Notes */}
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    <h4 className="text-white font-medium mb-3">Subject Notes</h4>
                    {subject?.notes ? (
                      <div className="bg-gray-800/50 rounded-lg p-4 text-gray-300">
                        {subject.notes}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">No notes recorded for this subject.</div>
                    )}
                  </div>

                  {/* Key Dates */}
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    <h4 className="text-white font-medium mb-4">Key Dates</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Enrollment Date</div>
                        <div className="text-white">{formatDate(subject?.enrollment_date || null)}</div>
                      </div>
                      {subject?.randomization_date && (
                        <div>
                          <div className="text-sm text-gray-400 mb-1">Randomization Date</div>
                          <div className="text-white">{formatDate(subject.randomization_date)}</div>
                        </div>
                      )}
                      {subject?.discontinuation_date && (
                        <div>
                          <div className="text-sm text-gray-400 mb-1">Discontinuation Date</div>
                          <div className="text-white">{formatDate(subject.discontinuation_date)}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Last Updated</div>
                        <div className="text-white">{formatDateTime(subject?.updated_at || null)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}