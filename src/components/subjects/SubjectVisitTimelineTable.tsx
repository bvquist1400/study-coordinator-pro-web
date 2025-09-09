'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
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
  return_ip_id?: string | null
  visit_not_needed?: boolean | null
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
  return_ip_id: string | null
  compliance_percentage: number | null
  is_compliant: boolean | null
  visit_not_needed: boolean | null
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
  const [showEditModal, setShowEditModal] = useState<{visitId: string, type: 'ip' | 'note' | 'reschedule'} | null>(null)

  const loadTimelineData = useCallback(async () => {
    try {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!session?.user || !token) {
        console.error('No authenticated user')
        return
      }

      // Day 1 default: no dynamic anchor_day used

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
      let timeline = buildCompleteTimeline(schedules || [], visits || [], anchorDate, anchorDay)

      // Fetch drug compliance for this subject and map to visits by visit_id
      const { data: dcRows, error: dcError } = await supabase
        .from('drug_compliance')
        .select('visit_id, ip_id, assessment_date, compliance_percentage, is_compliant')
        .eq('subject_id', subjectId)
        .not('visit_id', 'is', null)
        .order('assessment_date', { ascending: true })

      if (!dcError && dcRows) {
        const byVisit = new Map<string, { compliance_percentage: number | null; is_compliant: boolean | null; assessment_date: string | null }>()
        const byReturnKey = new Map<string, { compliance_percentage: number | null; is_compliant: boolean | null; assessment_date: string | null }>()
        for (const row of dcRows as any[]) {
          const vid = row.visit_id as string
          // latest record per visit wins
          byVisit.set(vid, {
            compliance_percentage: row.compliance_percentage,
            is_compliant: row.is_compliant,
            assessment_date: row.assessment_date
          })
          // Also index by (ip_id + assessment_date) for fallback matching
          if (row.ip_id && row.assessment_date) {
            byReturnKey.set(`${row.ip_id}|${row.assessment_date}`, {
              compliance_percentage: row.compliance_percentage,
              is_compliant: row.is_compliant,
              assessment_date: row.assessment_date
            })
          }
        }
        timeline = timeline.map(v => {
          if (byVisit.has(v.id)) {
            const m = byVisit.get(v.id)!
            return { ...v, compliance_percentage: m.compliance_percentage, is_compliant: m.is_compliant }
          }
          // Fallback: if this visit recorded a return (return_ip_id + actual_date), match by (ip_id, assessment_date)
          if (v.return_ip_id && v.actual_date) {
            const key = `${v.return_ip_id}|${v.actual_date}`
            if (byReturnKey.has(key)) {
              const m = byReturnKey.get(key)!
              return { ...v, compliance_percentage: m.compliance_percentage, is_compliant: m.is_compliant }
            }
          }
          return v
        })
      }

      // Also overlay server-computed compliance from metrics (already fetched via API with admin privileges)
      if (metrics?.ip_dispensing_history && Array.isArray(metrics.ip_dispensing_history)) {
        const fromMetrics = new Map<string, { compliance_percentage: number | null; is_compliant: boolean | null }>()
        for (const h of metrics.ip_dispensing_history as any[]) {
          if (h.visit_id && (h.compliance_percentage !== null && h.compliance_percentage !== undefined)) {
            fromMetrics.set(h.visit_id as string, {
              compliance_percentage: Number(h.compliance_percentage),
              is_compliant: h.is_compliant ?? null
            })
          }
        }
        if (fromMetrics.size > 0) {
          timeline = timeline.map(v => fromMetrics.has(v.id)
            ? { ...v, compliance_percentage: fromMetrics.get(v.id)!.compliance_percentage, is_compliant: fromMetrics.get(v.id)!.is_compliant }
            : v
          )
        }
      }

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
    anchorDate: string
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
      const dayOffset = (schedule.visit_day ?? 0) - 1
      scheduledDate.setDate(scheduledDate.getDate() + dayOffset)
      

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
        return_ip_id: (actualVisit as any)?.return_ip_id || null,
        compliance_percentage: null, // Will be calculated from drug_compliance table
        is_compliant: null,
        visit_not_needed: actualVisit?.visit_not_needed || null
      })
    })

    // Sort by scheduled date
    timeline.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

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
    if (visit.visit_not_needed) return 'NOT NEEDED'
    if (visit.is_overdue && visit.status === 'scheduled') return 'OVERDUE'
    if (visit.status === 'not_scheduled' && !visit.visit_not_needed) return 'NOT SCHEDULED'
    if (visit.status === 'upcoming') return 'UPCOMING'
    return visit.status.toUpperCase()
  }

  const _handleCellEdit = (visitId: string, field: string, value: string | number) => {
    // TODO: Implement cell editing logic
    console.warn('Edit cell:', visitId, field, value)
    setEditingCell(null)
  }

  const handleVisitNotNeededToggle = async (visitId: string, isNotNeeded: boolean) => {
    try {
      // Check if this is a placeholder visit that needs to be created first
      if (visitId.startsWith('schedule-')) {
        if (isNotNeeded) {
          // Create the visit record as "not needed"
          await createVisitAsNotNeeded(visitId)
        }
        return
      }

      // Update existing visit
      const { data, error } = await supabase
        .from('subject_visits')
        .update({ visit_not_needed: isNotNeeded })
        .eq('id', visitId)
        .select()
      
      if (error) {
        console.error('Error updating visit_not_needed:', error)
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        
        // Show user-friendly error message
        alert(`Failed to update visit status: ${error.message || 'Unknown error'}. The visit_not_needed column may not exist in the database yet.`)
        return
      }
      
      if (data) {
        console.log('Successfully updated visit_not_needed:', data)
        // Reload the timeline data
        await loadTimelineData()
      }
    } catch (error) {
      console.error('Error toggling visit not needed:', error)
      alert('Failed to update visit status. Please check the console for details.')
    }
  }

  const createVisitAsNotNeeded = async (scheduleVisitId: string) => {
    try {
      // Extract the schedule ID from the placeholder ID
      const scheduleId = scheduleVisitId.replace('schedule-', '')
      
      // Find the visit in our timeline to get the details
      const visit = timelineVisits.find(v => v.id === scheduleVisitId)
      if (!visit) {
        alert('Visit details not found')
        return
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('User not authenticated')
        return
      }

      // Create the visit record
      const { data, error } = await supabase
        .from('subject_visits')
        .insert({
          subject_id: subjectId,
          visit_schedule_id: scheduleId,
          user_id: user.id,
          visit_name: visit.visit_name,
          visit_date: visit.scheduled_date.split('T')[0], // Convert to date format
          status: 'cancelled', // Use cancelled status for not-needed visits
          visit_not_needed: true,
          study_id: studyId
        })
        .select()

      if (error) {
        console.error('Error creating visit as not needed:', error)
        alert(`Failed to create visit: ${error.message}`)
        return
      }

      if (data) {
        console.log('Successfully created visit as not needed:', data)
        // Reload the timeline data
        await loadTimelineData()
      }
    } catch (error) {
      console.error('Error creating visit as not needed:', error)
      alert('Failed to create visit. Please check the console for details.')
    }
  }

  const handleEditIP = (visitId: string) => {
    setShowEditModal({ visitId, type: 'ip' })
  }

  const handleAddNote = (visitId: string) => {
    setShowEditModal({ visitId, type: 'note' })
  }

  const handleReschedule = (visitId: string) => {
    setShowEditModal({ visitId, type: 'reschedule' })
  }

  const closeEditModal = () => {
    setShowEditModal(null)
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
                <th className="px-4 py-3 text-center text-gray-300 font-medium">Not Needed</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {timelineVisits.map((visit, _index) => {
                const isExpanded = expandedRows.has(visit.id)
                const rowBg = _index % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/10'
                
                return (
                  <Fragment key={visit.id}>
                    {/* Main Row */}
                    <tr className={`${rowBg} hover:bg-gray-700/30 transition-colors border-b border-gray-700/50`}>
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
                      
                      {/* Visit Not Needed Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={visit.visit_not_needed || false}
                          onChange={(e) => handleVisitNotNeededToggle(visit.id, e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                          title={visit.id.startsWith('schedule-') 
                            ? "Mark as not needed - will create visit record automatically" 
                            : "Mark as not needed - excludes from visit metrics"
                          }
                        />
                      </td>
                      
                      {/* Status */}
                      <td className="px-4 py-3">
                        {!visit.visit_not_needed && (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(visit)}`}>
                            {getStatusLabel(visit)}
                          </span>
                        )}
                        {visit.visit_not_needed && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full text-gray-400">
                            NOT NEEDED
                          </span>
                        )}
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
                            {!visit.visit_not_needed && (
                              <div className="flex space-x-2 pt-2 border-t border-gray-700">
                                <button 
                                  onClick={() => handleEditIP(visit.id)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                                >
                                  Edit IP Data
                                </button>
                                <button 
                                  onClick={() => handleAddNote(visit.id)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                                >
                                  Add Note
                                </button>
                                <button 
                                  onClick={() => handleReschedule(visit.id)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                                >
                                  Reschedule
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Simple Modal/Alert for Edit Actions */}
      {showEditModal && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-white font-medium mb-4">
              {showEditModal.type === 'ip' && 'Edit IP Data'}
              {showEditModal.type === 'note' && 'Add Note'}
              {showEditModal.type === 'reschedule' && 'Reschedule Visit'}
            </h3>
            <p className="text-gray-400 mb-4">
              {showEditModal.type === 'ip' && 'IP data editing functionality will be implemented here.'}
              {showEditModal.type === 'note' && 'Note adding functionality will be implemented here.'}
              {showEditModal.type === 'reschedule' && 'Visit rescheduling functionality will be implemented here.'}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Close
              </button>
              <button
                onClick={closeEditModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
