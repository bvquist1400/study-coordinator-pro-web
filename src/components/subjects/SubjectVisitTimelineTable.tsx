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
  ip_dispensed: number | null
  ip_returned: number | null
  ip_id: string | null
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
  ip_dispensed: number | null
  ip_returned: number | null
  ip_id: string | null
  compliance_percentage: number | null
  is_compliant: boolean | null
}

interface SubjectVisitTimelineTableProps {
  subjectId: string
  studyId: string
  anchorDate: string
  metrics?: any
}

// Procedure categories with colors
const PROCEDURE_CATEGORIES = {
  'Local Labs': { color: 'bg-blue-500', icon: '🧪' },
  'Lab Kit': { color: 'bg-purple-500', icon: '🩸' },
  'Medication Dispensing': { color: 'bg-green-500', icon: '💊' },
  'Vital Signs': { color: 'bg-orange-500', icon: '🩺' },
  'Physical Exam': { color: 'bg-yellow-500', icon: '👨‍⚕️' },
  'ECG': { color: 'bg-red-500', icon: '❤️' },
  'Questionnaire': { color: 'bg-indigo-500', icon: '📋' },
  'Imaging': { color: 'bg-teal-500', icon: '📸' },
  'PK Sample': { color: 'bg-pink-500', icon: '🧬' }
}

const ActivityPill = ({ 
  procedure, 
  isCompleted = false 
}: { 
  procedure: string
  isCompleted?: boolean 
}) => {
  const config = PROCEDURE_CATEGORIES[procedure as keyof typeof PROCEDURE_CATEGORIES] || 
    { color: 'bg-gray-500', icon: '📝' }
  
  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-1 mb-1 ${
        isCompleted 
          ? `${config.color} text-white` 
          : `bg-gray-700 text-gray-300 border border-gray-600`
      }`}
      title={`${procedure} - ${isCompleted ? 'Completed' : 'Pending'}`}
    >
      <span className="mr-1">{config.icon}</span>
      {procedure}
      {isCompleted && <span className="ml-1">✓</span>}
    </span>
  )
}

export default function SubjectVisitTimelineTable({ 
  subjectId, 
  studyId, 
  anchorDate,
  metrics 
}: SubjectVisitTimelineTableProps) {
  const [timelineVisits, setTimelineVisits] = useState<TimelineVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [_editingCell, setEditingCell] = useState<{visitId: string, field: string} | null>(null)

  const loadTimelineData = useCallback(async () => {
    try {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!session?.user || !token) {
        console.error('No authenticated user')
        return
      }

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

      // Fetch visit schedules via API
      let schedules = null
      try {
        const response = await fetch(`/api/visit-schedules?study_id=${studyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (response.ok) {
          const data = await response.json()
          schedules = data.visitSchedules
        }
      } catch (apiError) {
        console.log('API error:', apiError)
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
      const timeline = buildCompleteTimeline(schedules || [], visits || [], anchorDate, anchorDay)
      setTimelineVisits(timeline)

    } catch (error) {
      console.error('Error loading timeline data:', error)
    } finally {
      setLoading(false)
    }
  }, [subjectId, studyId, anchorDate])

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
    
    if (!anchorDate) {
      console.warn('⚠️ No anchor date provided for timeline calculations!')
      return []
    }

    // Create a map of actual visits by schedule ID
    const visitsByScheduleId = new Map<string, SubjectVisit>()
    visits.forEach(visit => {
      if (visit.visit_schedule_id) {
        visitsByScheduleId.set(visit.visit_schedule_id, visit)
      }
    })

    // Process each scheduled visit
    schedules.forEach((schedule, _index) => {
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
        is_within_window: isWithinWindow,
        ip_dispensed: actualVisit?.ip_dispensed || null,
        ip_returned: actualVisit?.ip_returned || null,
        ip_id: actualVisit?.ip_id || null,
        compliance_percentage: null, // Will be calculated from drug_compliance table
        is_compliant: null
      })
    })

    // Sort by visit day
    timeline.sort((a, b) => (a.visit_day || 0) - (b.visit_day || 0))

    return timeline
  }

  const toggleRowExpansion = (visitId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(visitId)) {
      newExpanded.delete(visitId)
    } else {
      newExpanded.add(visitId)
    }
    setExpandedRows(newExpanded)
  }

  const getStatusColor = (visit: TimelineVisit) => {
    if (visit.is_overdue && visit.status !== 'completed') return 'text-red-400'
    
    switch (visit.status) {
      case 'completed': return 'text-green-400'
      case 'scheduled': return 'text-blue-400'
      case 'missed': return 'text-red-400'
      case 'cancelled': return 'text-gray-400'
      case 'upcoming': return 'text-yellow-400'
      case 'not_scheduled': return 'text-gray-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusLabel = (visit: TimelineVisit) => {
    if (visit.is_overdue && visit.status === 'scheduled') return 'OVERDUE'
    if (visit.status === 'not_scheduled') return 'NOT SCHEDULED'
    if (visit.status === 'upcoming') return 'UPCOMING'
    return visit.status.toUpperCase()
  }

  const _handleCellEdit = (visitId: string, field: string, value: string | number) => {
    // TODO: Implement cell editing logic
    console.warn('Edit cell:', visitId, field, value)
    setEditingCell(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (timelineVisits.length === 0) {
    return (
      <div className="bg-gray-800/30 rounded-lg p-6">
        <div className="text-center py-8">
          <div className="text-gray-500 mb-4">No visit schedule available</div>
          <p className="text-gray-400 text-sm">
            Please configure the Schedule of Events (SOE) for this study.
          </p>
        </div>
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

      {/* Excel-Style Table */}
      <div className="bg-gray-800/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-700 border-b border-gray-600 shadow-sm">
                <th className="px-4 py-3 text-left text-gray-300 font-medium w-8"></th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Visit</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Day</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Target Date</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Actual Date</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Window</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Activities</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">IP Compliance</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {timelineVisits.map((visit, _index) => {
                const isExpanded = expandedRows.has(visit.id)
                const rowBg = _index % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/10'
                
                return (
                  <>
                    {/* Main Row */}
                    <tr key={visit.id} className={`${rowBg} hover:bg-gray-700/30 transition-colors border-b border-gray-700/50`}>
                      {/* Expand Button */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRowExpansion(visit.id)}
                          className="text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          <svg 
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                      
                      {/* Visit */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">
                          {visit.visit_number ? `${visit.visit_number} - ` : ''}{visit.visit_name}
                        </div>
                      </td>
                      
                      {/* Day */}
                      <td className="px-4 py-3 text-gray-300">
                        {visit.visit_day !== null ? `Day ${visit.visit_day}` : '-'}
                      </td>
                      
                      {/* Target Date */}
                      <td className="px-4 py-3 text-gray-300">
                        {formatDateUTC(visit.scheduled_date)}
                      </td>
                      
                      {/* Actual Date */}
                      <td className="px-4 py-3 text-gray-300">
                        {visit.actual_date ? formatDateUTC(visit.actual_date) : '-'}
                      </td>
                      
                      {/* Window */}
                      <td className="px-4 py-3 text-gray-300">
                        {visit.window_start && visit.window_end ? (
                          <span className="text-xs">
                            {formatDateUTC(visit.window_start)} - {formatDateUTC(visit.window_end)}
                          </span>
                        ) : '-'}
                      </td>
                      
                      {/* Activities */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap max-w-xs">
                          {visit.procedures?.slice(0, 2).map(procedure => {
                            const isCompleted = visit.procedures_completed?.includes(procedure) || false
                            return (
                              <ActivityPill 
                                key={procedure} 
                                procedure={procedure} 
                                isCompleted={isCompleted}
                              />
                            )
                          })}
                          {(visit.procedures?.length || 0) > 2 && (
                            <span className="text-xs text-gray-400">+{(visit.procedures?.length || 0) - 2} more</span>
                          )}
                        </div>
                      </td>
                      
                      {/* IP Compliance */}
                      <td className="px-4 py-3 text-gray-300">
                        {visit.compliance_percentage !== null ? (
                          <div className="flex items-center space-x-2">
                            <span className={`font-medium ${
                              visit.compliance_percentage >= 90 ? 'text-green-400' :
                              visit.compliance_percentage >= 75 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {visit.compliance_percentage}%
                            </span>
                            {visit.is_compliant && (
                              <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        ) : (
                          visit.ip_dispensed ? (
                            <span className="text-gray-400 text-xs">Pending</span>
                          ) : '-'
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(visit)}`}>
                          {getStatusLabel(visit)}
                        </span>
                      </td>
                      
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex space-x-1">
                          {visit.status === 'not_scheduled' && (
                            <button className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors">
                              Schedule
                            </button>
                          )}
                          {visit.status === 'scheduled' && (
                            <button className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors">
                              Complete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expanded Row */}
                    {isExpanded && (
                      <tr className={`${rowBg} border-b border-gray-700/50`}>
                        <td></td>
                        <td colSpan={9} className="px-4 py-4">
                          <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                            {/* All Activities */}
                            {visit.procedures && (
                              <div>
                                <h5 className="text-white font-medium mb-2">All Activities</h5>
                                <div className="flex flex-wrap gap-1">
                                  {visit.procedures.map(procedure => {
                                    const isCompleted = visit.procedures_completed?.includes(procedure) || false
                                    return (
                                      <ActivityPill 
                                        key={procedure} 
                                        procedure={procedure} 
                                        isCompleted={isCompleted}
                                      />
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            
                            {/* IP Dispensing Details */}
                            {(visit.ip_dispensed || visit.ip_returned !== null || visit.ip_id) && (
                              <div>
                                <h5 className="text-white font-medium mb-2">IP Accountability</h5>
                                <div className="bg-gray-800/50 rounded p-3 space-y-2">
                                  {visit.ip_id && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Bottle ID:</span>
                                      <span className="text-white font-mono">{visit.ip_id}</span>
                                    </div>
                                  )}
                                  {visit.ip_dispensed && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Dispensed:</span>
                                      <span className="text-white">{visit.ip_dispensed} tablets</span>
                                    </div>
                                  )}
                                  {visit.ip_returned !== null && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Returned:</span>
                                      <span className="text-white">{visit.ip_returned} tablets</span>
                                    </div>
                                  )}
                                  {visit.ip_dispensed && visit.ip_returned !== null && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Taken:</span>
                                      <span className="text-white font-medium">{visit.ip_dispensed - visit.ip_returned} tablets</span>
                                    </div>
                                  )}
                                  {visit.compliance_percentage !== null && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Compliance:</span>
                                      <span className={`font-medium ${
                                        visit.compliance_percentage >= 90 ? 'text-green-400' :
                                        visit.compliance_percentage >= 75 ? 'text-yellow-400' : 'text-red-400'
                                      }`}>
                                        {visit.compliance_percentage}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Notes */}
                            {visit.notes && (
                              <div>
                                <h5 className="text-white font-medium mb-2">Notes</h5>
                                <div className="text-gray-300 bg-gray-800/50 rounded p-3 text-sm">
                                  {visit.notes}
                                </div>
                              </div>
                            )}
                            
                            {/* Edit Actions */}
                            <div className="flex space-x-2 pt-2 border-t border-gray-700">
                              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                                Edit IP Data
                              </button>
                              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                                Add Note
                              </button>
                              <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                                Reschedule
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
