'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import EditSubjectForm from './EditSubjectForm'
import SubjectVisitTimelineTable from './SubjectVisitTimelineTable'
import { formatDateUTC, formatDateTimeUTC, parseDateUTC } from '@/lib/date-utils'

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
  // Drug compliance metrics
  drug_compliance: {
    percentage: number
    is_compliant: boolean
    assessment_date: string
    dispensed_count: number
    returned_count: number
    expected_taken: number | null
    ip_id: string
  } | null
  last_drug_dispensing: {
    visit_date: string
    ip_id: string
    ip_dispensed: number
    ip_start_date: string
  } | null
  active_drug_bottle: {
    ip_id: string
    dispensed_count: number
    start_date: string
    days_since_dispensing: number
  } | null
  expected_return_date: string | null
  ip_dispensing_history: {
    visit_id: string
    visit_date: string
    ip_id: string
    ip_dispensed: number
    ip_start_date: string
    ip_returned: number | null
    ip_last_dose_date: string | null
    visit_name: string
    compliance_percentage: number | null
    is_compliant: boolean | null
    expected_taken: number | null
    assessment_date: string | null
  }[]
}

interface Visit {
  id: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  notes: string | null
  visit_name: string
  visit_schedule_id: string | null
  visit_schedules: {
    id: string
    visit_name: string
    visit_day: number
    window_before_days: number | null
    window_after_days: number | null
  } | null
}

interface SubjectDetailModalProps {
  subjectId: string
  studyId: string
  isOpen: boolean
  onClose: () => void
  onSubjectUpdated?: () => void // Callback to refresh parent data
}

const statusColors = {
  screening: 'bg-yellow-900/30 text-yellow-300 border-yellow-600/50',
  active: 'bg-green-900/30 text-green-300 border-green-600/50',
  completed: 'bg-purple-900/30 text-purple-300 border-purple-600/50',
  discontinued: 'bg-red-900/30 text-red-300 border-red-600/50',
  withdrawn: 'bg-gray-900/30 text-gray-300 border-gray-600/50'
}

const _visitStatusColors = {
  completed: 'bg-green-600',
  scheduled: 'bg-blue-600',
  missed: 'bg-red-600',
  cancelled: 'bg-gray-600'
}

const _visitStatusLabels = {
  completed: 'Completed',
  scheduled: 'Scheduled',
  missed: 'Missed',
  cancelled: 'Cancelled'
}

export default function SubjectDetailModal({ subjectId, studyId, isOpen, onClose, onSubjectUpdated }: SubjectDetailModalProps) {
  const [subject, setSubject] = useState<Subject | null>(null)
  const [metrics, setMetrics] = useState<SubjectMetrics | null>(null)
  const [_visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'drug-compliance' | 'notes'>('timeline')
  const [showEditForm, setShowEditForm] = useState(false)
  const [perVisitCycles, setPerVisitCycles] = useState<Array<{ visit_id: string; visit_date: string; visit_name: string | null; items: any[]; avg_compliance: number | null }>>([])

  const handleDeleteSubject = useCallback(async () => {
    if (!subject) return
    const confirm = window.confirm(`Delete subject ${subject.subject_number}? This will remove related data via cascade. This action cannot be undone.`)
    if (!confirm) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        alert('Authentication error. Please refresh and try again.')
        return
      }
      const resp = await fetch(`/api/subjects/${subject.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const json = await resp.json()
      if (!resp.ok) {
        console.error('Delete failed:', json)
        alert(json.error || 'Failed to delete subject')
        return
      }
      alert('Subject deleted successfully')
      // Close modal and notify parent to refresh
      onClose()
      if (onSubjectUpdated) onSubjectUpdated()
    } catch (e) {
      console.error('Error deleting subject', e)
      alert('Failed to delete subject')
    }
  }, [subject, onClose, onSubjectUpdated])

  useEffect(() => {
    const loadPerVisit = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token || !subjectId) return
        const resp = await fetch(`/api/subjects/${subjectId}/drug-cycles`, { headers: { Authorization: `Bearer ${token}` } })
        if (!resp.ok) return
        const json = await resp.json()
        setPerVisitCycles(json.per_visit || [])
      } catch {}
    }
    loadPerVisit()
  }, [subjectId])

  const loadSubjectDetail = useCallback(async () => {
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
        const currentSubject = (subjects as Array<Subject & { metrics?: SubjectMetrics }>).find((s) => s.id === subjectId)
        
        if (currentSubject) {
          setSubject(currentSubject)
          setMetrics(currentSubject.metrics || null)
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
          visit_name,
          visit_schedule_id,
          visit_schedules:visit_schedule_id(
            id,
            visit_name,
            visit_day,
            window_before_days,
            window_after_days
          )
        `)
        .eq('subject_id', subjectId)
        .order('visit_date', { ascending: true })

      if (visitError) {
        console.error('Error fetching visits:', visitError)
      } else {
        setVisits((visitData as any) || [])
      }

    } catch (error) {
      console.error('Error loading subject detail:', error)
    } finally {
      setLoading(false)
    }
  }, [subjectId, studyId])

  useEffect(() => {
    if (isOpen && subjectId) {
      loadSubjectDetail()
    }
  }, [isOpen, subjectId, loadSubjectDetail])

  const handleEditSave = () => {
    setShowEditForm(false)
    loadSubjectDetail() // Refresh modal data after edit
    // Notify parent component to refresh its data
    if (onSubjectUpdated) {
      onSubjectUpdated()
    }
  }

  const handleEditClose = () => {
    setShowEditForm(false)
  }

  const formatDate = (dateString: string | null) => (dateString ? formatDateUTC(dateString, 'en-US') : null)

  const formatDateTime = (dateString: string | null) => (dateString ? formatDateTimeUTC(dateString, 'en-US') : null)

  const _getVisitWindow = (visit: Visit) => {
    if (!visit.visit_schedules) return null
    
    const windowBefore = visit.visit_schedules.window_before_days || 0
    const windowAfter = visit.visit_schedules.window_after_days || 0
    
    if (windowBefore === 0 && windowAfter === 0) return null
    
    const visitDate = parseDateUTC(visit.visit_date) || new Date(visit.visit_date)
    const windowStart = new Date(visitDate)
    windowStart.setUTCDate(windowStart.getUTCDate() - windowBefore)
    const windowEnd = new Date(visitDate)
    windowEnd.setUTCDate(windowEnd.getUTCDate() + windowAfter)
    
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
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800/50 px-6 py-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {subject?.subject_number || 'Loading...'}
                </h1>
                {subject && (
                  <div className="flex items-center space-x-4 mt-2">
                    <span className={`px-4 py-2 text-sm font-medium rounded-full border ${statusColors[subject.status]}`}>
                      {subject.status.charAt(0).toUpperCase() + subject.status.slice(1)}
                    </span>
                    {subject.treatment_arm && (
                      <span className="text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full text-sm">
                        {subject.treatment_arm}
                      </span>
                    )}
                    <span className="text-gray-400 text-sm">
                      Enrolled {formatDate(subject.enrollment_date)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <button
                onClick={() => setShowEditForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit Subject</span>
              </button>
              <button
                onClick={handleDeleteSubject}
                className="flex items-center space-x-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                title="Delete subject and related records"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m3-3h4a2 2 0 012 2v1H7V6a2 2 0 012-2z" />
                </svg>
                <span>Delete</span>
              </button>
              
              {metrics && !loading && (
                <div className="flex space-x-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{metrics.completed_visits}</div>
                    <div className="text-xs text-gray-400">Visits Done</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{metrics.upcoming_visits}</div>
                    <div className="text-xs text-gray-400">Upcoming</div>
                  </div>
                  {metrics.overdue_visits > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-400">{metrics.overdue_visits}</div>
                      <div className="text-xs text-gray-400">Overdue</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${getComplianceColor(metrics.visit_compliance_rate)}`}>
                      {Math.round(metrics.visit_compliance_rate)}%
                    </div>
                    <div className="text-xs text-gray-400">On-Time</div>
                  </div>
                </div>
              )}
            </div>
          </div>
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
                {([
                  { id: 'timeline', label: 'Visit Timeline', icon: '📅' },
                  { id: 'drug-compliance', label: 'Drug Compliance Tracking', icon: '💊' },
                  { id: 'notes', label: 'Notes & History', icon: '📝' }
                ] as Array<{ id: 'timeline' | 'drug-compliance' | 'notes'; label: string; icon: string }>).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
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
            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-0">
              {activeTab === 'timeline' && subject && (
                <>
                  {!subject.randomization_date && (
                    <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <div>
                          <h4 className="text-yellow-300 font-medium">Using Enrollment Date as Anchor</h4>
                          <p className="text-yellow-200 text-sm">
                            Subject has no Anchor Date set. Timeline calculated from enrollment date ({formatDateUTC(subject.enrollment_date)}).
                            Set an Anchor Date for accurate visit scheduling.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <SubjectVisitTimelineTable 
                    subjectId={subjectId}
                    studyId={studyId}
                    anchorDate={subject.randomization_date || subject.enrollment_date}
                    metrics={metrics}
                  />
                </>
              )}

              {activeTab === 'drug-compliance' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white">Investigational Product (IP) Accountability</h3>
                  
                  {metrics ? (
                    <>
                      {/* Current Drug Status Overview */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Current Compliance */}
                        {(metrics.drug_compliance || (metrics.ip_dispensing_history && metrics.ip_dispensing_history.length > 0)) && (() => {
                          // Calculate overall compliance as average of all recorded compliance percentages
                          let overallCompliance: number | null = null;
                          
                          if (metrics.ip_dispensing_history && metrics.ip_dispensing_history.length > 0) {
                            const validComplianceValues = metrics.ip_dispensing_history
                              .filter((row: any) => row.compliance_percentage != null)
                              .map((row: any) => row.compliance_percentage);
                            
                            if (validComplianceValues.length > 0) {
                              overallCompliance = Math.round(
                                validComplianceValues.reduce((sum: number, val: number) => sum + val, 0) / validComplianceValues.length
                              );
                            }
                          }
                          
                          // Fallback to single compliance if no history available
                          if (overallCompliance === null && metrics.drug_compliance?.percentage) {
                            overallCompliance = metrics.drug_compliance.percentage;
                          }

                          return (
                            <div className="bg-gray-800/30 rounded-lg p-6">
                              <h4 className="text-white font-medium mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Current Compliance
                              </h4>
                              <div className="space-y-3">
                                <div className="text-3xl font-bold text-white">
                                  {overallCompliance ? `${overallCompliance}%` : 'N/A'}
                                </div>
                                <div className="text-sm text-gray-400">
                                  {metrics.ip_dispensing_history && metrics.ip_dispensing_history.length > 1
                                    ? `Average of ${metrics.ip_dispensing_history.filter((row: any) => row.compliance_percentage != null).length} compliance assessments`
                                    : metrics.drug_compliance
                                    ? `${metrics.drug_compliance.dispensed_count - metrics.drug_compliance.returned_count} taken / ${metrics.drug_compliance.expected_taken || 'N/A'} expected`
                                    : 'No compliance data available'
                                  }
                                </div>
                                {overallCompliance && (
                                  <div className="w-full bg-gray-700 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all duration-500 ${
                                        overallCompliance >= 90 ? 'bg-green-500' :
                                        overallCompliance >= 75 ? 'bg-yellow-500' :
                                        overallCompliance >= 50 ? 'bg-orange-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, overallCompliance))}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Active Drug Bottle */}
                        {metrics.active_drug_bottle && (
                          <div className="bg-gray-800/30 rounded-lg p-6">
                            <h4 className="text-white font-medium mb-4 flex items-center">
                              <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Active Bottle
                            </h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-400">Bottle ID:</span>
                                <span className="text-white font-mono">{metrics.active_drug_bottle.ip_id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Dispensed:</span>
                                <span className="text-white">{metrics.active_drug_bottle.dispensed_count} tablets</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Start Date:</span>
                                <span className="text-white">{formatDateUTC(metrics.active_drug_bottle.start_date)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Days Active:</span>
                                <span className="text-white">{metrics.active_drug_bottle.days_since_dispensing} days</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Last Dispensing */}
                        {metrics.last_drug_dispensing && (
                          <div className="bg-gray-800/30 rounded-lg p-6">
                            <h4 className="text-white font-medium mb-4 flex items-center">
                              <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Last Dispensing
                            </h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-400">Visit Date:</span>
                                <span className="text-white">{formatDateUTC(metrics.last_drug_dispensing.visit_date)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Bottle ID:</span>
                                <span className="text-white font-mono">{metrics.last_drug_dispensing.ip_id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Quantity:</span>
                                <span className="text-white">{metrics.last_drug_dispensing.ip_dispensed} tablets</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Started:</span>
                                <span className="text-white">{formatDateUTC(metrics.last_drug_dispensing.ip_start_date)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Expected Return */}
                        {metrics.expected_return_date && (
                          <div className="bg-gray-800/30 rounded-lg p-6">
                            <h4 className="text-white font-medium mb-4 flex items-center">
                              <svg className="w-5 h-5 mr-2 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Expected Return
                            </h4>
                            <div className="space-y-2">
                              <div className="text-xl font-bold text-white">
                                {formatDateUTC(metrics.expected_return_date)}
                              </div>
                              <div className="text-sm text-gray-400">
                                {(() => {
                                  const today = new Date()
                                  const returnDate = new Date(metrics.expected_return_date)
                                  const diffDays = Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                                  
                                  if (diffDays < 0) {
                                    return <span className="text-red-400">Overdue by {Math.abs(diffDays)} days</span>
                                  } else if (diffDays === 0) {
                                    return <span className="text-yellow-400">Due today</span>
                                  } else if (diffDays <= 7) {
                                    return <span className="text-yellow-400">Due in {diffDays} days</span>
                                  } else {
                                    return <span className="text-gray-400">Due in {diffDays} days</span>
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Compliance Status Message */}
                      {!metrics.drug_compliance && !metrics.active_drug_bottle && !metrics.last_drug_dispensing && (
                        <div className="bg-gray-800/20 border border-gray-700 rounded-lg p-6">
                          <div className="flex items-center">
                            <svg className="w-6 h-6 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <h4 className="text-white font-medium">No IP Activity Recorded</h4>
                              <p className="text-gray-400 text-sm mt-1">
                                This subject has not been dispensed any investigational product yet.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Old IP Dispensing History table removed. Show summary cards only when available. */}
                      <div className="bg-gray-800/30 rounded-lg p-6 space-y-4">
                        <h4 className="text-white font-medium mb-2 flex items-center">
                          <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                          IP Compliance
                        </h4>

                        {metrics?.drug_compliance && (
                          <div className="flex items-start space-x-4 p-4 bg-gray-800/40 rounded-lg">
                            <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4" />
                              </svg>
                            </div>
                            <div className="flex-grow">
                              <div className="flex items-center justify-between">
                                <h5 className="text-white font-medium">Compliance Assessment</h5>
                                <span className="text-gray-400 text-sm">Latest</span>
                              </div>
                              <p className="text-gray-400 text-sm mt-1">
                                {metrics.drug_compliance.dispensed_count - metrics.drug_compliance.returned_count} tablets taken out of {metrics.drug_compliance.expected_taken || 'N/A'} expected
                              </p>
                              <div className="mt-2 flex items-center space-x-2">
                                <div className="flex-shrink-0">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    metrics.drug_compliance.percentage && metrics.drug_compliance.percentage >= 90
                                      ? 'bg-green-900/50 text-green-300 border border-green-600/50'
                                      : metrics.drug_compliance.percentage && metrics.drug_compliance.percentage >= 75
                                      ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-600/50'
                                      : 'bg-red-900/50 text-red-300 border border-red-600/50'
                                  }`}>
                                    {metrics.drug_compliance.percentage ? `${metrics.drug_compliance.percentage}%` : 'N/A'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {metrics?.expected_return_date && (
                          <div className="flex items-start space-x-4 p-4 bg-gray-800/40 rounded-lg border-l-4 border-yellow-500">
                            <div className="flex-shrink-0 w-10 h-10 bg-yellow-600 rounded-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" />
                              </svg>
                            </div>
                            <div className="flex-grow">
                              <div className="flex items-center justify-between">
                                <h5 className="text-white font-medium">Expected Return</h5>
                                <span className="text-gray-400 text-sm">{formatDateUTC(metrics.expected_return_date)}</span>
                              </div>
                              <p className="text-gray-400 text-sm mt-1">
                                Return visit due for tablet count and compliance assessment
                              </p>
                              <div className="mt-2">
                                {(() => {
                                  const today = new Date()
                                  const returnDate = new Date(metrics.expected_return_date)
                                  const diffDays = Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                                  if (diffDays < 0) {
                                    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900/50 text-red-300 border border-red-600/50">Overdue by {Math.abs(diffDays)} days</span>
                                  } else if (diffDays === 0) {
                                    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-300 border border-yellow-600/50">Due today</span>
                                  } else if (diffDays <= 7) {
                                    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-300 border border-yellow-600/50">Due in {diffDays} days</span>
                                  }
                                  return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">Due in {diffDays} days</span>
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Per-Visit Compliance Table */}
                      <div className="bg-gray-800/30 rounded-lg p-6">
                        <h4 className="text-white font-medium mb-4">Per-Visit Drug Compliance</h4>
                        {(perVisitCycles || []).length === 0 ? (
                          <div className="text-sm text-gray-400">No per-visit compliance entries.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left text-gray-300">
                              <thead className="text-xs uppercase text-gray-400">
                                <tr>
                                  <th className="px-3 py-2">Visit</th>
                                  <th className="px-3 py-2">First Dose Date</th>
                                  <th className="px-3 py-2">Drug Dispensed</th>
                                  <th className="px-3 py-2">Drug Returned</th>
                                  <th className="px-3 py-2">Date Returned</th>
                                  <th className="px-3 py-2">Compliance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {perVisitCycles.map(v => (
                                  v.items.map((it: any, idx: number) => (
                                    <tr key={`${v.visit_id}-${idx}`} className="border-t border-gray-700/60">
                                      <td className="px-3 py-2">{v.visit_name || '-'}</td>
                                      <td className="px-3 py-2">{it.first_dose_date ? formatDateUTC(it.first_dose_date) : '-'}</td>
                                      <td className="px-3 py-2">{it.tablets_dispensed ?? '-'}</td>
                                      <td className="px-3 py-2">{it.tablets_returned ?? 0}</td>
                                      <td className="px-3 py-2">{it.last_dose_date ? formatDateUTC(it.last_dose_date) : '-'}</td>
                                      <td className="px-3 py-2">{it.compliance_percentage != null ? `${Math.round(it.compliance_percentage)}%` : '-'}</td>
                                    </tr>
                                  ))
                                ))}
                                {/* Per-visit average rows removed per request */}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="bg-gray-800/20 border border-gray-700 rounded-lg p-6">
                      <div className="flex items-center">
                        <svg className="w-6 h-6 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <h4 className="text-white font-medium">Metrics Not Available</h4>
                          <p className="text-gray-400 text-sm mt-1">
                            Drug accountability metrics are not available for this subject.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {false && (
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
                              {(metrics?.completed_visits ?? 0)}/{metrics?.total_visits ?? 0} visits
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div
                              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                              style={{ 
                                width: `${((metrics?.total_visits ?? 0) > 0) ? (((metrics?.completed_visits ?? 0) / (metrics?.total_visits ?? 1)) * 100) : 0}%` 
                              }}
                            />
                          </div>
                          <div className="text-2xl font-bold text-white">
                            {((metrics?.total_visits ?? 0) > 0) ? Math.round(((metrics?.completed_visits ?? 0) / (metrics?.total_visits ?? 1)) * 100) : 0}%
                          </div>
                        </div>
                      </div>

                      {/* Visit Timing Compliance */}
                      <div className="bg-gray-800/30 rounded-lg p-6">
                        <h4 className="text-white font-medium mb-4">Visit Timing Compliance</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">On-Time Rate</span>
                            <span className={getComplianceColor(metrics?.visit_compliance_rate ?? 0)}>
                              {Math.round(metrics?.visit_compliance_rate ?? 0)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all duration-500 ${
                                (metrics?.visit_compliance_rate ?? 0) >= 90 ? 'bg-green-600' :
                                (metrics?.visit_compliance_rate ?? 0) >= 75 ? 'bg-yellow-600' : 'bg-red-600'
                              }`}
                              style={{ width: `${Math.min(100, metrics?.visit_compliance_rate ?? 0)}%` }}
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
                          <div className="text-sm text-gray-400 mb-1">Anchor Date</div>
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
      
      {/* Edit Subject Form Modal */}
      {showEditForm && subject && (
        <EditSubjectForm
          subjectId={subject.id}
          studyId={studyId}
          onClose={handleEditClose}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}
