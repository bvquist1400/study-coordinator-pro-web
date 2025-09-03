'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'

interface VisitSchedule {
  id: string
  visit_name: string
  visit_number: string
  visit_day: number
  window_before_days: number | null
  window_after_days: number | null
  procedures: string[] | null
}

interface SubjectVisit {
  id: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  notes: string | null
  visit_name: string
  visit_schedule_id: string | null
  procedures_completed: string[] | null
  visit_schedules: VisitSchedule | null
}

interface TimelineVisit {
  id: string
  visit_name: string
  visit_number: string | null
  visit_day: number | null
  scheduled_date: string
  actual_date: string | null
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled' | 'upcoming' | 'not_scheduled'
  window_start: string | null
  window_end: string | null
  procedures: string[] | null
  procedures_completed: string[] | null
  notes: string | null
  is_overdue: boolean
  is_within_window: boolean
}

interface SubjectVisitTimelineProps {
  subjectId: string
  studyId: string
  enrollmentDate: string
  metrics?: any
}

// Procedure categories with colors and icons
const PROCEDURE_CATEGORIES = {
  'Local Labs': { color: 'bg-blue-600', icon: '🧪', category: 'Laboratory' },
  'Lab Kit': { color: 'bg-purple-600', icon: '🩸', category: 'Laboratory' },
  'Medication Dispensing': { color: 'bg-green-600', icon: '💊', category: 'IP' },
  'Vital Signs': { color: 'bg-orange-600', icon: '🩺', category: 'Clinical' },
  'Physical Exam': { color: 'bg-yellow-600', icon: '👨‍⚕️', category: 'Clinical' },
  'ECG': { color: 'bg-red-600', icon: '❤️', category: 'Cardiac' },
  'Questionnaire': { color: 'bg-indigo-600', icon: '📋', category: 'Assessment' },
  'Imaging': { color: 'bg-teal-600', icon: '📸', category: 'Imaging' },
  'PK Sample': { color: 'bg-pink-600', icon: '🧬', category: 'Laboratory' }
}

const ActivityPill = ({ 
  procedure, 
  isCompleted = false 
}: { 
  procedure: string
  isCompleted?: boolean 
}) => {
  const config = PROCEDURE_CATEGORIES[procedure as keyof typeof PROCEDURE_CATEGORIES] || 
    { color: 'bg-gray-600', icon: '📝', category: 'Other' }
  
  return (
    <div 
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-all ${
        isCompleted 
          ? `${config.color} text-white` 
          : `bg-gray-700 text-gray-300 border border-gray-600`
      }`}
      title={`${procedure} - ${isCompleted ? 'Completed' : 'Pending'}`}
    >
      <span className="mr-1">{config.icon}</span>
      <span>{procedure}</span>
      {isCompleted && (
        <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </div>
  )
}

export default function SubjectVisitTimeline({ 
  subjectId, 
  studyId, 
  enrollmentDate,
  metrics 
}: SubjectVisitTimelineProps) {
  const [timelineVisits, setTimelineVisits] = useState<TimelineVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedVisits, setExpandedVisits] = useState<Set<string>>(new Set())

  const loadTimelineData = useCallback(async () => {
    try {
      setLoading(true)
      console.log('🔍 Loading timeline for study:', studyId)

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!session?.user || !token) {
        console.error('No authenticated user')
        return
      }

      // First, test if we can see ANY visit schedules (debugging RLS)
      const { data: allSchedules, error: allSchedulesError } = await supabase
        .from('visit_schedules')
        .select('study_id, visit_name, visit_number')
        .limit(5)
        
      console.log('🔍 Can access visit_schedules table?', allSchedulesError ? 'NO' : 'YES')
      console.log('🔍 Sample schedules in DB:', allSchedules)
      
      // Load study anchor day for correct Day 0/Day 1 offsets
      let anchorDay = 0
      try {
        const { data: studyRow } = await supabase
          .from('studies')
          .select('anchor_day')
          .eq('id', studyId)
          .single()
        anchorDay = (studyRow as any)?.anchor_day ?? 0
      } catch {}

      // Try API route first (might bypass RLS issues)
      let schedules = null
      try {
        const response = await fetch(`/api/visit-schedules?study_id=${studyId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          schedules = data.visitSchedules
          console.log('📅 Schedules from API:', schedules?.length || 0, schedules)
        } else {
          console.log('🚨 API failed:', response.status, response.statusText)
        }
      } catch (apiError) {
        console.log('🚨 API error:', apiError)
      }
      
      // Fallback to direct Supabase query
      if (!schedules) {
        const { data: directSchedules, error: scheduleError } = await supabase
          .from('visit_schedules')
          .select('*')
          .eq('study_id', studyId)
          .order('visit_day', { ascending: true })

        if (scheduleError) {
          console.error('Error fetching schedules:', scheduleError)
          return
        }
        
        schedules = directSchedules
        console.log('📅 Schedules from Supabase direct:', schedules?.length || 0, schedules)
      }

      // Fetch actual subject visits
      const { data: visits, error: visitError } = await supabase
        .from('subject_visits')
        .select(`
          *,
          visit_schedules:visit_schedule_id(*)
        `)
        .eq('subject_id', subjectId)
        .order('visit_date', { ascending: true })

      if (visitError) {
        console.error('Error fetching visits:', visitError)
        return
      }

      // Build the complete timeline
      const timeline = buildCompleteTimeline(schedules || [], visits || [], enrollmentDate, anchorDay)
      // If no schedules but we have visits, show them anyway
      if ((!schedules || schedules.length === 0) && visits && visits.length > 0) {
        const visitTimeline = visits.map((visit, _index) => ({
          id: visit.id,
          visit_name: visit.visit_name,
          visit_number: null,
          visit_day: null,
          scheduled_date: visit.visit_date,
          actual_date: visit.visit_date,
          status: visit.status,
          window_start: null,
          window_end: null,
          procedures: null,
          procedures_completed: visit.procedures_completed,
          notes: visit.notes,
          is_overdue: visit.status === 'scheduled' && new Date(visit.visit_date) < new Date(),
          is_within_window: true
        }))
        setTimelineVisits(visitTimeline)
      } else {
        setTimelineVisits(timeline)
      }

    } catch (error) {
      console.error('Error loading timeline data:', error)
    } finally {
      setLoading(false)
    }
  }, [subjectId, studyId, enrollmentDate])

  useEffect(() => {
    loadTimelineData()
  }, [loadTimelineData])

  const buildCompleteTimeline = (
    schedules: VisitSchedule[], 
    visits: SubjectVisit[], 
    anchorDate: string,
    anchorDay: number = 0
  ): TimelineVisit[] => {
    const timeline: TimelineVisit[] = []
    const anchorDateObj = parseDateUTC(anchorDate) || new Date(anchorDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Create a map of actual visits by schedule ID
    const visitsByScheduleId = new Map<string, SubjectVisit>()
    visits.forEach(visit => {
      if (visit.visit_schedule_id) {
        visitsByScheduleId.set(visit.visit_schedule_id, visit)
      }
    })

    // Process each scheduled visit
    schedules.forEach(schedule => {
      const scheduledDate = new Date(anchorDateObj)
      const anchorOffset = anchorDay === 1 ? 1 : 0
      scheduledDate.setDate(scheduledDate.getDate() + schedule.visit_day + anchorOffset)

      // Calculate window dates
      const windowStart = schedule.window_before_days ? new Date(scheduledDate) : null
      const windowEnd = schedule.window_after_days ? new Date(scheduledDate) : null
      
      if (windowStart && schedule.window_before_days) {
        windowStart.setDate(windowStart.getDate() - schedule.window_before_days)
      }
      if (windowEnd && schedule.window_after_days) {
        windowEnd.setDate(windowEnd.getDate() + schedule.window_after_days)
      }

      // Check if there's an actual visit for this schedule
      const actualVisit = visitsByScheduleId.get(schedule.id)
      
      let status: TimelineVisit['status'] = 'not_scheduled'
      let isOverdue = false
      let isWithinWindow = true

      if (actualVisit) {
        status = actualVisit.status
        const visitDate = parseDateUTC(actualVisit.visit_date) || new Date(actualVisit.visit_date)
        
        // Check if within window
        if (windowStart && windowEnd) {
          isWithinWindow = visitDate >= windowStart && visitDate <= windowEnd
        }
        
        // Check if overdue
        if (actualVisit.status === 'scheduled' && visitDate < today) {
          isOverdue = true
        }
      } else {
        // No actual visit scheduled yet
        if (scheduledDate < today) {
          status = 'not_scheduled'
          isOverdue = true
        } else {
          status = 'upcoming'
        }
      }

      timeline.push({
        id: actualVisit?.id || `schedule-${schedule.id}`,
        visit_name: schedule.visit_name,
        visit_number: schedule.visit_number,
        visit_day: schedule.visit_day,
        scheduled_date: scheduledDate.toISOString(),
        actual_date: actualVisit?.visit_date || null,
        status,
        window_start: windowStart?.toISOString() || null,
        window_end: windowEnd?.toISOString() || null,
        procedures: schedule.procedures,
        procedures_completed: actualVisit?.procedures_completed || null,
        notes: actualVisit?.notes || null,
        is_overdue: isOverdue,
        is_within_window: isWithinWindow
      })
    })

    // Add any unscheduled visits that don't match a schedule
    visits.forEach(visit => {
      if (!visit.visit_schedule_id || !visitsByScheduleId.has(visit.visit_schedule_id)) {
        const visitDate = parseDateUTC(visit.visit_date) || new Date(visit.visit_date)
        timeline.push({
          id: visit.id,
          visit_name: visit.visit_name,
          visit_number: null,
          visit_day: null,
          scheduled_date: visit.visit_date,
          actual_date: visit.visit_date,
          status: visit.status,
          window_start: null,
          window_end: null,
          procedures: null,
          procedures_completed: visit.procedures_completed,
          notes: visit.notes,
          is_overdue: visit.status === 'scheduled' && visitDate < today,
          is_within_window: true
        })
      }
    })

    // Sort by scheduled date
    timeline.sort((a, b) => 
      new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    )

    return timeline
  }

  const toggleVisitExpansion = (visitId: string) => {
    const newExpanded = new Set(expandedVisits)
    if (newExpanded.has(visitId)) {
      newExpanded.delete(visitId)
    } else {
      newExpanded.add(visitId)
    }
    setExpandedVisits(newExpanded)
  }

  const getStatusColor = (visit: TimelineVisit) => {
    if (visit.is_overdue && visit.status !== 'completed') return 'border-red-500 bg-red-900/20'
    
    switch (visit.status) {
      case 'completed': return 'border-green-500 bg-green-900/20'
      case 'scheduled': return 'border-blue-500 bg-blue-900/20'
      case 'missed': return 'border-red-500 bg-red-900/20'
      case 'cancelled': return 'border-gray-500 bg-gray-900/20'
      case 'upcoming': return 'border-yellow-500 bg-yellow-900/20'
      case 'not_scheduled': return 'border-gray-600 bg-gray-800/20'
      default: return 'border-gray-600 bg-gray-800/20'
    }
  }

  const getStatusLabel = (visit: TimelineVisit) => {
    if (visit.is_overdue && visit.status === 'scheduled') return 'OVERDUE'
    if (visit.status === 'not_scheduled') return 'NOT SCHEDULED'
    if (visit.status === 'upcoming') return 'UPCOMING'
    return visit.status.toUpperCase()
  }

  const getStatusBadgeColor = (visit: TimelineVisit) => {
    if (visit.is_overdue && visit.status !== 'completed') return 'bg-red-600'
    
    switch (visit.status) {
      case 'completed': return 'bg-green-600'
      case 'scheduled': return 'bg-blue-600'
      case 'missed': return 'bg-red-600'
      case 'cancelled': return 'bg-gray-600'
      case 'upcoming': return 'bg-yellow-600'
      case 'not_scheduled': return 'bg-gray-700'
      default: return 'bg-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
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
            <div className="text-xs text-gray-400">Scheduled</div>
          </div>
          <div className="bg-gray-800/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{metrics.overdue_visits}</div>
            <div className="text-xs text-gray-400">Overdue</div>
          </div>
          <div className="bg-gray-800/30 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${
              metrics.visit_compliance_rate >= 90 ? 'text-green-400' :
              metrics.visit_compliance_rate >= 75 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {Math.round(metrics.visit_compliance_rate)}%
            </div>
            <div className="text-xs text-gray-400">On-Time Rate</div>
          </div>
        </div>
      )}

      {/* Full Visit Timeline */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Complete Visit Schedule</h3>
        
        {timelineVisits.length > 0 ? (
          <div className="space-y-3">
            <div className="text-sm text-gray-400 mb-4">
              Showing {timelineVisits.length} visits
            </div>
            {timelineVisits.map((visit, _index) => {
              const isExpanded = expandedVisits.has(visit.id)
              
              return (
                <div
                  key={visit.id}
                  className={`rounded-lg border-l-4 transition-all ${getStatusColor(visit)}`}
                >
                  <div 
                    className="p-4 cursor-pointer hover:bg-gray-800/30 transition-colors"
                    onClick={() => toggleVisitExpansion(visit.id)}
                  >
                    {/* Main Visit Row */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h4 className="text-lg font-medium text-white">
                            {visit.visit_number ? `${visit.visit_number} - ` : ''}{visit.visit_name}
                          </h4>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full text-white ${getStatusBadgeColor(visit)}`}>
                            {getStatusLabel(visit)}
                          </span>
                          {!visit.is_within_window && visit.status === 'completed' && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-600 text-white">
                              OUT OF WINDOW
                            </span>
                          )}
                        </div>
                        
                        {/* Visit Details Row */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
                          {visit.visit_day !== null && (
                            <div>
                              <span className="text-gray-400">Day:</span> {visit.visit_day}
                            </div>
                          )}
                          <div>
                            <span className="text-gray-400">Target:</span> {formatDateUTC(visit.scheduled_date)}
                          </div>
                          {visit.actual_date && (
                            <div>
                              <span className="text-gray-400">Actual:</span> {formatDateUTC(visit.actual_date)}
                            </div>
                          )}
                          {visit.window_start && visit.window_end && (
                            <div>
                              <span className="text-gray-400">Window:</span> {formatDateUTC(visit.window_start)} - {formatDateUTC(visit.window_end)}
                            </div>
                          )}
                        </div>

                        {/* Activity Pills */}
                        {(visit.procedures || visit.procedures_completed) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {visit.procedures?.map(procedure => {
                              const isCompleted = visit.procedures_completed?.includes(procedure) || false
                              return (
                                <ActivityPill 
                                  key={procedure} 
                                  procedure={procedure} 
                                  isCompleted={isCompleted}
                                />
                              )
                            })}
                            {/* Show any completed procedures not in the original list */}
                            {visit.procedures_completed?.filter(p => !visit.procedures?.includes(p))
                              .map(procedure => (
                                <ActivityPill 
                                  key={procedure} 
                                  procedure={procedure} 
                                  isCompleted={true}
                                />
                              ))
                            }
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <div className="text-right text-sm text-gray-400">
                          #{_index + 1}
                        </div>
                        <svg 
                          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        {visit.notes && (
                          <div className="mb-3">
                            <span className="text-gray-400 text-sm">Notes:</span>
                            <div className="mt-1 text-gray-300 bg-gray-800/50 rounded p-2 text-sm">
                              {visit.notes}
                            </div>
                          </div>
                        )}
                        
                        {/* Quick Actions */}
                        <div className="flex space-x-2">
                          {visit.status === 'not_scheduled' && (
                            <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors">
                              Schedule Visit
                            </button>
                          )}
                          {visit.status === 'scheduled' && (
                            <>
                              <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors">
                                Mark Complete
                              </button>
                              <button className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors">
                                Reschedule
                              </button>
                            </>
                          )}
                          <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                            Add Note
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-gray-800/30 rounded-lg p-6">
            <div className="text-center py-8">
              <div className="mb-6">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-medium text-white mb-2">No Visit Schedule Available</h3>
                <p className="text-gray-400 mb-4">
                  This study doesn&apos;t have a Schedule of Events (SOE) configured yet, and no individual visits have been scheduled for this subject.
                </p>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                <h4 className="text-white font-medium mb-2">To see visits here, you need to:</h4>
                <div className="text-left space-y-2 text-sm text-gray-300">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span>Go to Study Management and build the Schedule of Events (SOE)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <span>Or manually schedule individual visits for this subject</span>
                  </div>
                </div>
              </div>
              
              <div className="space-x-3">
                <button 
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  onClick={() => window.open('/studies', '_blank')}
                >
                  Configure SOE
                </button>
                <button 
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                  onClick={() => {
                    // This would trigger the schedule visit modal
                    console.log('Schedule individual visit clicked')
                  }}
                >
                  Schedule Visit
                </button>
              </div>
              
              <details className="mt-6">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">Debug Info</summary>
                <div className="text-xs text-gray-400 mt-2 font-mono">
                  Subject ID: {subjectId}<br/>
                  Study ID: {studyId}<br/>
                  Enrollment: {enrollmentDate}
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
