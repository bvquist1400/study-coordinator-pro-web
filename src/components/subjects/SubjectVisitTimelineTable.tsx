'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment, ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase/client'
import ScheduleVisitModal from '@/components/visits/ScheduleVisitModal'
import RescheduleModal from '@/components/visits/RescheduleModal'
import { formatDateUTC, parseDateUTC, todayLocalISODate } from '@/lib/date-utils'
import { calculateVisitDate } from '@/lib/visit-calculator'
import type { VisitKitRequirement } from '@/types/database'

interface VisitSchedule {
  id: string
  visit_name: string
  visit_number: string
  visit_day: number
  window_before_days: number | null
  window_after_days: number | null
  procedures: string[] | null
  kit_requirements?: VisitKitRequirement[]
  // Optional: section to which this schedule belongs
  section_id?: string | null
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
  subject_visit_coordinators?: Array<{
    coordinator_id: string
    role: string | null
    assigned_by: string | null
    created_at: string
    user_profiles?: {
      full_name: string | null
      email: string | null
    } | null
  }> | null
  // Section assignment (if any) of the actual visit
  subject_section_id?: string | null
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
  is_unscheduled?: boolean | null
  unscheduled_reason?: string | null
  visit_schedule_id?: string | null
  subject_section_id?: string | null
  reschedule_history?: Array<{
    old_date: string | null
    new_date: string | null
    reason: string | null
    changed_at: string | null
  }>
  // Section grouping/ordering
  section_code?: string | null
  section_order?: number | null
  coordinators: Array<{
    coordinatorId: string
    name: string
    email: string | null
    role: string | null
    assignedAt: string
  }>
}

interface CoordinatorOption {
  coordinatorId: string
  name: string
  email: string | null
  role: string | null
}

interface VisitCoordinatorAssignment {
  coordinatorId: string
  name: string
  email: string | null
  role: string | null
  assignedAt: string
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
  'IP Compliance Calculation': { color: 'bg-green-500', icon: '💊' },
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
  const [showEditModal, setShowEditModal] = useState<{visitId: string, type: 'ip' | 'note'} | null>(null)
  const [sectionAnchors, setSectionAnchors] = useState<Array<{ id: string; study_section_id: string | null; anchor_date: string; section_code: string | null; section_order: number | null }>>([])
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [preSchedule, setPreSchedule] = useState<{ scheduleId: string | null; date: string | null; sectionId: string | null }>({ scheduleId: null, date: null, sectionId: null })
  const [rescheduleVisit, setRescheduleVisit] = useState<TimelineVisit | null>(null)
  const ipDispensingHistory = metrics?.ip_dispensing_history
  const [studyCoordinators, setStudyCoordinators] = useState<CoordinatorOption[]>([])
  const [selectedVisitIds, setSelectedVisitIds] = useState<Set<string>>(new Set())
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false)
  const [bulkCoordinatorSelection, setBulkCoordinatorSelection] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null)
  const hasSelection = selectedVisitIds.size > 0
  const canAssign = hasSelection && studyCoordinators.length > 0
  const totalSelectableVisits = useMemo(
    () => timelineVisits.filter((visit) => !visit.id.startsWith('schedule-')).length,
    [timelineVisits]
  )

  const coordinatorNameMap = useMemo(() => {
    const map = new Map<string, CoordinatorOption>()
    studyCoordinators.forEach((coordinator) => {
      map.set(coordinator.coordinatorId, coordinator)
    })
    return map
  }, [studyCoordinators])

  const fetchStudyCoordinators = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const response = await fetch('/api/coordinators', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        console.warn('Failed to load coordinators', await response.text())
        return
      }

      const payload = await response.json().catch(() => ({ coordinators: [] }))
      const coordinatorRows = Array.isArray(payload.coordinators) ? payload.coordinators : []
      if (coordinatorRows.length === 0) {
        setStudyCoordinators([])
        return
      }

      const options: CoordinatorOption[] = coordinatorRows
        .map((row: any): CoordinatorOption | null => {
          const assignments = Array.isArray(row.assignments) ? row.assignments : []
          const isAssigned = assignments.some((assignment: any) => assignment.id === studyId)
          if (!isAssigned || typeof row.id !== 'string' || row.id.length === 0) {
            return null
          }
          return {
            coordinatorId: row.id,
            name: row.name ?? row.email ?? 'Unknown coordinator',
            email: row.email ?? null,
            role: assignments.find((assignment: any) => assignment.id === studyId)?.role ?? null
          } as CoordinatorOption
        })
        .filter((option: CoordinatorOption | null): option is CoordinatorOption => option !== null)
        .sort((a: CoordinatorOption, b: CoordinatorOption) => a.name.localeCompare(b.name))

      setStudyCoordinators(options)
    } catch (error) {
      console.warn('Unexpected error loading coordinators', error)
    }
  }, [studyId])

  const buildCompleteTimeline = useCallback((
    schedules: VisitSchedule[], 
    visits: SubjectVisit[], 
    anchorDate: string,
    anchorDay: number,
    assignmentsByVisit: Map<string, VisitCoordinatorAssignment[]>
  ): TimelineVisit[] => {
    const timeline: TimelineVisit[] = []
    const anchorDateObj = parseDateUTC(anchorDate) || new Date(anchorDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (!anchorDate) {
      console.warn('⚠️ No anchor date provided for timeline calculations!')
      return []
    }

    const mapVisitCoordinators = (visitId: string | null | undefined): TimelineVisit['coordinators'] => {
      if (!visitId) return []
      const assignments = assignmentsByVisit.get(visitId)
      if (!assignments || assignments.length === 0) {
        return []
      }
      return assignments
        .map((assignment) => {
          const coordinatorFromState = coordinatorNameMap.get(assignment.coordinatorId)
          const name = coordinatorFromState?.name ?? assignment.name ?? assignment.email ?? 'Unknown coordinator'
          return {
            coordinatorId: assignment.coordinatorId,
            name,
            email: coordinatorFromState?.email ?? assignment.email ?? null,
            role: assignment.role ?? coordinatorFromState?.role ?? null,
            assignedAt: assignment.assignedAt
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const visitsByScheduleId = new Map<string, SubjectVisit>()
    visits.forEach(visit => {
      if (visit.visit_schedule_id) {
        visitsByScheduleId.set(visit.visit_schedule_id, visit)
      }
    })

    schedules.forEach((schedule) => {
      const baseline = anchorDateObj
      const windowBefore = typeof schedule.window_before_days === 'number' ? schedule.window_before_days : 0
      const windowAfter = typeof schedule.window_after_days === 'number' ? schedule.window_after_days : 0
      const scheduleDayRaw = typeof schedule.visit_day === 'number' ? schedule.visit_day : 0
      const normalizedVisitDay = anchorDay === 1 ? Math.max(scheduleDayRaw - 1, 0) : scheduleDayRaw

      const calc = calculateVisitDate(
        baseline,
        normalizedVisitDay,
        'days',
        0,
        windowBefore,
        windowAfter
      )
      const scheduledCalcDate = calc.scheduledDate
      const windowStart = calc.windowStart
      const windowEnd = calc.windowEnd

      const actualVisit = visitsByScheduleId.get(schedule.id)
      
      let status: TimelineVisit['status'] = 'not_scheduled'
      let isOverdue = false
      let isWithinWindow = true
      const actualVisitDate = actualVisit ? actualVisit.visit_date : null

      if (actualVisit) {
        status = actualVisit.status
        const visitDate = parseDateUTC(actualVisit.visit_date) || new Date(actualVisit.visit_date)
        isWithinWindow = visitDate >= windowStart && visitDate <= windowEnd
        if (actualVisit.status === 'scheduled' && visitDate < today) {
          isOverdue = true
        }
      } else {
        if (scheduledCalcDate < today) {
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
        scheduled_date: scheduledCalcDate.toISOString(),
        actual_date: actualVisitDate,
        status,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        procedures: schedule.procedures,
        procedures_completed: actualVisit?.procedures_completed || null,
        notes: actualVisit?.notes || null,
        is_overdue: isOverdue,
        is_within_window: isWithinWindow,
        ip_dispensed: actualVisit?.ip_dispensed || null,
        ip_returned: actualVisit?.ip_returned || null,
        ip_id: actualVisit?.ip_id || null,
        return_ip_id: (actualVisit as any)?.return_ip_id || null,
        compliance_percentage: null,
        is_compliant: null,
        visit_not_needed: actualVisit?.visit_not_needed || null,
        is_unscheduled: (actualVisit as any)?.is_unscheduled ?? null,
        unscheduled_reason: (actualVisit as any)?.unscheduled_reason || null,
        visit_schedule_id: schedule.id,
        subject_section_id: (actualVisit as any)?.subject_section_id || null,
        reschedule_history: [],
        coordinators: mapVisitCoordinators(actualVisit?.id ?? null)
      })
    })

    const unscheduledVisits = (visits || []).filter((visit: any) => !visit.visit_schedule_id)
    for (const visit of unscheduledVisits as any[]) {
      const visitDate = parseDateUTC(visit.visit_date) || new Date(visit.visit_date)
      const visitIso = visitDate.toISOString()
      const status = visit.status as TimelineVisit['status']
      const isOverdue = status === 'scheduled' && visitDate < today
      const sectionMeta = sectionAnchors.find(s => s.id === visit.subject_section_id) || null

      timeline.push({
        id: visit.id,
        visit_name: visit.visit_name,
        visit_number: null,
        visit_day: null,
        scheduled_date: visitIso,
        actual_date: visit.status === 'scheduled' || visit.status === 'completed' ? visit.visit_date : null,
        status,
        window_start: visitIso,
        window_end: visitIso,
        procedures: [],
        procedures_completed: visit.procedures_completed || null,
        notes: visit.notes || null,
        is_overdue: isOverdue,
        is_within_window: visit.is_within_window ?? true,
        ip_dispensed: visit.ip_dispensed || null,
        ip_returned: visit.ip_returned || null,
        ip_id: visit.ip_id || null,
        return_ip_id: visit.return_ip_id || null,
        compliance_percentage: null,
        is_compliant: null,
        visit_not_needed: visit.visit_not_needed || null,
        is_unscheduled: visit.is_unscheduled ?? true,
        unscheduled_reason: visit.unscheduled_reason || null,
        visit_schedule_id: null,
        subject_section_id: visit.subject_section_id || null,
        reschedule_history: [],
        section_code: sectionMeta?.section_code || null,
        section_order: sectionMeta?.section_order ?? null,
        coordinators: mapVisitCoordinators(visit.id)
      })
    }

    timeline.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

    return timeline
  }, [sectionAnchors, coordinatorNameMap])

  const loadTimelineData = useCallback(async () => {
    try {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!session?.user || !token) {
        console.error('No authenticated user')
        return
      }

      const assignmentsByVisit = new Map<string, VisitCoordinatorAssignment[]>()

      try {
        const assignmentsResponse = await fetch(
          `/api/subject-visits/coordinators?subjectId=${subjectId}`,
          {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        if (assignmentsResponse.ok) {
          const payload = await assignmentsResponse.json().catch(() => ({ assignments: [] }))
          const assignmentRows = Array.isArray((payload as any).assignments)
            ? (payload as any).assignments
            : []

          assignmentRows.forEach((row: any) => {
            const visitId = typeof row.visitId === 'string' ? row.visitId : null
            const coordinatorId = typeof row.coordinatorId === 'string' ? row.coordinatorId : null
            if (!visitId || !coordinatorId) return

            const assignedAt =
              typeof row.assignedAt === 'string'
                ? row.assignedAt
                : typeof row.created_at === 'string'
                  ? row.created_at
                  : new Date().toISOString()

            const current = assignmentsByVisit.get(visitId) ?? []
            current.push({
              coordinatorId,
              name:
                typeof row.name === 'string' && row.name.length > 0
                  ? row.name
                  : typeof row.email === 'string' && row.email.length > 0
                    ? row.email
                    : 'Unknown coordinator',
              email: typeof row.email === 'string' ? row.email : null,
              role: typeof row.role === 'string' ? row.role : null,
              assignedAt
            })
            assignmentsByVisit.set(visitId, current)
          })
        } else {
          console.warn('Failed to load visit coordinator assignments', await assignmentsResponse.text())
        }
      } catch (assignmentError) {
        console.warn('Unexpected error loading visit coordinator assignments', assignmentError)
      }

      // Fetch study anchor day once so timeline respects Day 0/Day 1 semantics
      let resolvedAnchorDay = 0
      try {
        const { data: studyMeta } = await supabase
          .from('studies')
          .select('anchor_day')
          .eq('id', studyId)
          .single()
        if (studyMeta && typeof (studyMeta as any).anchor_day === 'number') {
          resolvedAnchorDay = (studyMeta as any).anchor_day
        }
      } catch {
        resolvedAnchorDay = 0
      }

      // Day 1 default: use provided main anchor (aka anchor_date_1) when no sections

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
        console.warn('Failed to load visit schedules', apiError)
      }

      // Fetch subject section assignments (to get per-section anchor dates)
      let assignments: any[] | null = null
      try {
        const assnRes = await fetch(`/api/subject-sections?subject_id=${subjectId}&study_id=${studyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (assnRes.ok) {
          const json = await assnRes.json()
          assignments = json.sections || []
          const nextAnchors = (assignments as any[]).map((a: any) => ({
            id: a.id,
            study_section_id: a.study_section_id || null,
            anchor_date: a.anchor_date,
            section_code: a.study_sections?.code || null,
            section_order: a.study_sections?.order_index ?? null
          }))

          setSectionAnchors((prev) => {
            if (prev.length === nextAnchors.length) {
              const isSame = prev.every((anchor, index) => {
                const next = nextAnchors[index]
                return (
                  anchor.id === next.id &&
                  anchor.study_section_id === next.study_section_id &&
                  anchor.anchor_date === next.anchor_date &&
                  anchor.section_code === next.section_code &&
                  anchor.section_order === next.section_order
                )
              })
              if (isSame) {
                return prev
              }
            }
            return nextAnchors
          })
        }
      } catch (e) {
        console.warn('Failed to fetch subject sections', e)
      }

      // Fetch actual subject visits
      const { data: visits, error: visitError } = await supabase
        .from('subject_visits')
        .select(`
          id,
          subject_id,
          visit_date,
          status,
          visit_name,
          visit_schedule_id,
          visit_not_needed,
          procedures_completed,
          ip_dispensed,
          ip_returned,
          ip_id,
          subject_section_id
        `)
        .eq('subject_id', subjectId)
        .order('visit_date', { ascending: true })

      if (visitError) {
        console.error('Error fetching visits:', visitError)
        return
      }

      // Build the complete timeline
      // If subject has section assignments, build per section using its anchor; otherwise fallback to main anchorDate
      let timeline: TimelineVisit[] = []
      if (assignments && assignments.length > 0) {
        (assignments as any[]).forEach((assn: any) => {
          let secSchedules = (schedules || []).filter((s: any) => (s as any).section_id === assn.study_section_id)
          const secVisits = (visits || []).filter((v: any) => (v as any).subject_section_id === assn.id)
          if (secSchedules.length === 0) secSchedules = (schedules || [])
          const seg = buildCompleteTimeline(
            secSchedules,
            secVisits as unknown as SubjectVisit[],
            assn.anchor_date,
            resolvedAnchorDay,
            assignmentsByVisit
          )
            .map(v => ({ ...v, section_code: assn.study_sections?.code || null, section_order: assn.study_sections?.order_index ?? null }))
          timeline.push(...seg)
        })
      } else {
        // Fallback single segment using provided anchorDate (aka anchor_date_1)
        timeline = buildCompleteTimeline(
          schedules || [],
          (visits || []) as unknown as SubjectVisit[],
          anchorDate,
          resolvedAnchorDay,
          assignmentsByVisit
        )
      }

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
      if (Array.isArray(ipDispensingHistory)) {
        const fromMetrics = new Map<string, { compliance_percentage: number | null; is_compliant: boolean | null }>()
        for (const h of ipDispensingHistory as any[]) {
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

      // Final sort: by scheduled date only (oldest first)
      timeline.sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

      const actualVisitIds = timeline
        .filter(v => !v.id.startsWith('schedule-'))
        .map(v => v.id)

      if (actualVisitIds.length > 0 && token) {
        try {
          const historyResponse = await fetch('/api/visit-schedule-history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ visit_ids: actualVisitIds })
          })

          if (historyResponse.ok) {
            const { history } = await historyResponse.json()
            if (Array.isArray(history) && history.length > 0) {
              const grouped = (history as Array<{ visit_id: string; old_date: string | null; new_date: string | null; reason: string | null; changed_at: string | null }>).reduce((acc, row) => {
                const visitId = row.visit_id
                if (!acc.has(visitId)) acc.set(visitId, [])
                acc.get(visitId)!.push({
                  old_date: row.old_date,
                  new_date: row.new_date,
                  reason: row.reason,
                  changed_at: row.changed_at
                })
                return acc
              }, new Map<string, Array<{ old_date: string | null; new_date: string | null; reason: string | null; changed_at: string | null }>>())

              timeline = timeline.map(v => grouped.has(v.id)
                ? { ...v, reschedule_history: grouped.get(v.id) }
                : v
              )
            }
          } else {
            console.error('Failed to load reschedule history', await historyResponse.text())
          }
        } catch (historyErr) {
          console.error('Error fetching reschedule history', historyErr)
        }
      }

      setTimelineVisits(timeline)
      setSelectedVisitIds((prev) => {
        if (prev.size === 0) return prev
        const validIds = new Set(timeline.filter((visit) => !visit.id.startsWith('schedule-')).map((visit) => visit.id))
        const next = new Set<string>()
        prev.forEach((id) => {
          if (validIds.has(id)) next.add(id)
        })
        return next
      })

    } catch (error) {
      console.error('Error loading timeline data:', error)
    } finally {
      setLoading(false)
    }
  }, [subjectId, studyId, anchorDate, buildCompleteTimeline, ipDispensingHistory])

  const updateVisitCoordinators = useCallback(async (visitIds: string[], coordinatorIds: string[]) => {
    if (visitIds.length === 0) return false
    let success = false
    try {
      setAssigning(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        alert('Authentication error. Please refresh and try again.')
        return false
      }

      const response = await fetch('/api/subject-visits/coordinators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ visitIds, coordinatorIds })
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to update coordinators.' }))
        throw new Error(payload.error || 'Failed to update coordinators.')
      }

      success = true
    } catch (error) {
      console.error('Error updating visit coordinators', error)
      alert(error instanceof Error ? error.message : 'Failed to update visit coordinators.')
    } finally {
      setAssigning(false)
    }
    await loadTimelineData()
    return success
  }, [loadTimelineData])

  useEffect(() => {
    loadTimelineData()
  }, [loadTimelineData])

  useEffect(() => {
    fetchStudyCoordinators()
  }, [fetchStudyCoordinators])

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate =
        selectedVisitIds.size > 0 && selectedVisitIds.size < totalSelectableVisits
    }
  }, [selectedVisitIds, totalSelectableVisits])

  const toggleRowExpansion = (visitId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(visitId)) {
      newExpanded.delete(visitId)
    } else {
      newExpanded.add(visitId)
    }
    setExpandedRows(newExpanded)
  }

  const toggleVisitSelection = (visitId: string, checked: boolean) => {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(visitId)
      } else {
        next.delete(visitId)
      }
      return next
    })
  }

  const toggleAllVisits = (checked: boolean) => {
    if (checked) {
      setSelectedVisitIds(new Set(timelineVisits.filter((visit) => !visit.id.startsWith('schedule-')).map((visit) => visit.id)))
    } else {
      setSelectedVisitIds(new Set())
    }
  }

  const openBulkAssignModal = () => {
    if (selectedVisitIds.size === 0) return
    const selected = timelineVisits.filter((visit) => selectedVisitIds.has(visit.id))
    if (selected.length === 0) {
      setIsBulkAssignOpen(false)
      setBulkCoordinatorSelection([])
      return
    }
    const initial = selected.reduce<Set<string>>((acc, visit, index) => {
      const ids = new Set(visit.coordinators.map((coord) => coord.coordinatorId))
      if (index === 0) {
        return ids
      }
      const next = new Set<string>()
      ids.forEach((id) => {
        if (acc.has(id)) next.add(id)
      })
      return next
    }, new Set<string>())

    setBulkCoordinatorSelection(Array.from(initial))
    setIsBulkAssignOpen(true)
  }

  const handleBulkAssignSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const updated = await updateVisitCoordinators(Array.from(selectedVisitIds), bulkCoordinatorSelection)
    if (updated) {
      setIsBulkAssignOpen(false)
      setBulkCoordinatorSelection([])
    }
  }

  const handleCoordinatorSelectChange = async (visitId: string, event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value)
    await updateVisitCoordinators([visitId], values)
  }

  const handleBulkCoordinatorChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value)
    setBulkCoordinatorSelection(values)
  }

  const openScheduleForVisit = (visit: TimelineVisit) => {
    // Derive visit schedule id and section id if available
    let scheduleId: string | null = null
    if (visit.id.startsWith('schedule-')) {
      scheduleId = visit.id.replace('schedule-', '')
    }
    let sectionId: string | null = null
    if (visit.section_code && sectionAnchors.length > 0) {
      const match = sectionAnchors.find(a => a.section_code === visit.section_code)
      if (match) sectionId = match.study_section_id || match.id
    }
    // Format scheduled date as YYYY-MM-DD
    const scheduled = parseDateUTC(visit.scheduled_date) || new Date(visit.scheduled_date)
    const preDate = !scheduled || isNaN(scheduled.getTime())
      ? (typeof visit.scheduled_date === 'string' ? visit.scheduled_date.slice(0, 10) : '')
      : scheduled.toISOString().slice(0, 10)
    setPreSchedule({ scheduleId, date: preDate, sectionId })
    setShowScheduleModal(true)
  }

  const openUnscheduledVisit = () => {
    setPreSchedule({ scheduleId: null, date: todayLocalISODate(), sectionId: null })
    setShowScheduleModal(true)
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
      // Optimistically update UI
      setTimelineVisits(prev => prev.map(v => v.id === visitId ? { ...v, visit_not_needed: isNotNeeded } : v))

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
        // Revert optimistic update
        setTimelineVisits(prev => prev.map(v => v.id === visitId ? { ...v, visit_not_needed: !isNotNeeded } : v))
        return
      }
      
      if (data) {
        await loadTimelineData()
      }
    } catch (error) {
      console.error('Error toggling visit not needed:', error)
      alert('Failed to update visit status. Please check the console for details.')
      // Revert optimistic update
      setTimelineVisits(prev => prev.map(v => v.id === visitId ? { ...v, visit_not_needed: !isNotNeeded } : v))
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

      // Attempt to associate the new visit to the correct subject section
      // Prefer matching by section_code from the timeline row
      let subjectSectionId: string | null = null
      if (visit.section_code && sectionAnchors && sectionAnchors.length > 0) {
        const match = sectionAnchors.find(a => a.section_code === visit.section_code)
        if (match) subjectSectionId = match.id
      }
      // Fallback: if only one assignment exists, use it
      if (!subjectSectionId && sectionAnchors && sectionAnchors.length === 1) {
        subjectSectionId = sectionAnchors[0].id
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
          study_id: studyId,
          subject_section_id: subjectSectionId || undefined
        })
        .select()

      if (error) {
        console.error('Error creating visit as not needed:', error)
        alert(`Failed to create visit: ${error.message}`)
        return
      }

      if (data) {
        // Reload the timeline data to reflect new record
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
    const visit = timelineVisits.find(v => v.id === visitId)
    if (!visit) return
    if (visitId.startsWith('schedule-')) {
      alert('Schedule the visit before rescheduling it.')
      return
    }
    setRescheduleVisit(visit)
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


  // Removed section icons for a cleaner look per request

  return (
    <div className="space-y-6">
      {showScheduleModal && (
        <ScheduleVisitModal
          studyId={studyId}
          preSelectedSubjectId={subjectId}
          preSelectedVisitScheduleId={preSchedule.scheduleId || undefined}
          preSelectedDate={preSchedule.date || undefined}
          preSelectedSectionId={preSchedule.sectionId || undefined}
          initialMode={preSchedule.scheduleId ? 'protocol' : 'custom'}
          onClose={() => {
            setShowScheduleModal(false)
            setPreSchedule({ scheduleId: null, date: null, sectionId: null })
          }}
          onSchedule={async () => {
            setShowScheduleModal(false)
            setPreSchedule({ scheduleId: null, date: null, sectionId: null })
            await loadTimelineData()
          }}
        />
      )}
      {rescheduleVisit && (
        <RescheduleModal
          visit={{
            id: rescheduleVisit.id,
            visit_name: rescheduleVisit.visit_name,
            visit_date: rescheduleVisit.actual_date || rescheduleVisit.scheduled_date,
            scheduled_date: rescheduleVisit.scheduled_date,
            status: rescheduleVisit.status,
            window_start: rescheduleVisit.window_start,
            window_end: rescheduleVisit.window_end,
            visit_schedule_id: rescheduleVisit.visit_schedule_id || null,
            subject_section_id: rescheduleVisit.subject_section_id || null
          }}
          onClose={() => setRescheduleVisit(null)}
          onRescheduled={async () => {
            setRescheduleVisit(null)
            await loadTimelineData()
          }}
        />
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openBulkAssignModal}
            disabled={!canAssign || assigning}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              canAssign && !assigning
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {assigning ? 'Assigning…' : 'Assign coordinators'}
          </button>
          {hasSelection && studyCoordinators.length === 0 && (
            <span className="text-xs text-amber-300">
              Add study coordinators first to enable assignments.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openUnscheduledVisit}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Add Unscheduled Visit
        </button>
      </div>
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

      {/* Single, taller Excel-Style Table with section icons */}
      <div className="bg-gray-800/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[80vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-700 border-b border-gray-600 shadow-sm">
                <th className="px-4 py-3 text-left text-gray-300 font-medium w-12">
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-500 bg-gray-800 text-blue-500 focus:ring-blue-400"
                    checked={totalSelectableVisits > 0 && selectedVisitIds.size === totalSelectableVisits}
                    onChange={(event) => toggleAllVisits(event.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Visit</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Day</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Target Date</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Actual Date</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Window</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">Coordinator(s)</th>
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
                const isPlaceholder = visit.id.startsWith('schedule-')
                
                return (
                  <Fragment key={visit.id}>
                    {/* Main Row */}
                    <tr className={`${rowBg} hover:bg-gray-700/30 transition-colors border-b border-gray-700/50`}>
                      {/* Selection + Expand */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-500 bg-gray-800 text-blue-500 focus:ring-blue-400"
                            checked={selectedVisitIds.has(visit.id)}
                            onChange={(event) => toggleVisitSelection(visit.id, event.target.checked)}
                            onClick={(event) => event.stopPropagation()}
                            disabled={isPlaceholder}
                            title={isPlaceholder ? 'Schedule this visit before assigning coordinators' : undefined}
                          />
                          <button
                            onClick={() => toggleRowExpansion(visit.id)}
                            className="text-gray-400 hover:text-gray-200 transition-colors"
                            type="button"
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
                        </div>
                      </td>
                      
                      {/* Visit */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white flex items-center gap-2">
                          <span>
                            {visit.visit_number ? `${visit.visit_number} - ` : ''}{visit.visit_name}
                          </span>
                          {visit.section_code && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-100 border border-gray-600">
                              {visit.section_code}
                            </span>
                          )}
                          {visit.is_unscheduled && (
                            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-yellow-900/60 text-yellow-200 border border-yellow-600/40">
                              Unscheduled
                            </span>
                          )}
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

                      {/* Coordinators */}
                      <td className="px-4 py-3 text-gray-300">
                        {visit.coordinators.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {visit.coordinators.map((coordinator) => (
                              <span
                                key={`${visit.id}-${coordinator.coordinatorId}`}
                                className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-100 border border-gray-600"
                              >
                                {coordinator.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Unassigned</span>
                        )}
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
                          onClick={(e) => { e.stopPropagation() }}
                          onChange={(e) => { e.stopPropagation(); handleVisitNotNeededToggle(visit.id, e.target.checked) }}
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
                          {(!visit.visit_not_needed && (visit.status === 'not_scheduled' || visit.status === 'upcoming')) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openScheduleForVisit(visit) }}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                            >
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
                        <td colSpan={10} className="px-4 py-4">
                          <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
                            <div>
                              <h5 className="text-white font-medium mb-2">Coordinator assignments</h5>
                              {studyCoordinators.length > 0 ? (
                                <select
                                  multiple
                                  value={visit.coordinators.map((coordinator) => coordinator.coordinatorId)}
                                  onChange={(event) => handleCoordinatorSelectChange(visit.id, event)}
                                  className="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  aria-label={`Update coordinators for ${visit.visit_name}`}
                                >
                                  {studyCoordinators.map((coordinator) => (
                                    <option key={`${visit.id}-expanded-${coordinator.coordinatorId}`} value={coordinator.coordinatorId}>
                                      {coordinator.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="bg-gray-800/50 border border-gray-700 rounded p-3 text-xs text-gray-400">
                                  No study coordinators available. Add assignments from the coordinator directory.
                                </div>
                              )}
                              {visit.coordinators.length > 0 && (
                                <p className="text-xs text-gray-500 mt-2">
                                  Current: {visit.coordinators.map((coord) => coord.name).join(', ')}
                                </p>
                              )}
                            </div>

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

                            {visit.is_unscheduled && (
                              <div>
                                <h5 className="text-white font-medium mb-2">Unscheduled Reason</h5>
                                <div className="text-gray-300 bg-gray-800/50 rounded p-3 text-sm whitespace-pre-line">
                                  {visit.unscheduled_reason || 'No reason provided'}
                                </div>
                              </div>
                            )}

                            {visit.reschedule_history && visit.reschedule_history.length > 0 && (
                              <div>
                                <h5 className="text-white font-medium mb-2">Reschedule History</h5>
                                <div className="space-y-2">
                                  {visit.reschedule_history.map((entry, idx) => (
                                    <div key={`${visit.id}-history-${idx}`} className="bg-gray-800/40 border border-gray-700 rounded p-3 text-sm">
                                      <div className="flex justify-between text-xs text-gray-400">
                                        <span>Changed {entry.changed_at ? formatDateUTC(entry.changed_at) : 'N/A'}</span>
                                        <span>
                                          {entry.old_date ? `from ${formatDateUTC(entry.old_date)}` : ''}
                                          {entry.new_date ? ` to ${formatDateUTC(entry.new_date)}` : ''}
                                        </span>
                                      </div>
                                      <p className="mt-2 text-gray-300 whitespace-pre-line">
                                        {entry.reason && entry.reason.trim().length > 0
                                          ? entry.reason
                                          : 'No reason provided'}
                                      </p>
                                    </div>
                                  ))}
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

      {isBulkAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Assign coordinators</h3>
              <button
                type="button"
                onClick={() => {
                  setIsBulkAssignOpen(false)
                  setBulkCoordinatorSelection([])
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleBulkAssignSubmit} className="space-y-4">
              {studyCoordinators.length > 0 ? (
                <select
                  multiple
                  value={bulkCoordinatorSelection}
                  onChange={handleBulkCoordinatorChange}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {studyCoordinators.map((coordinator) => (
                    <option key={`bulk-${coordinator.coordinatorId}`} value={coordinator.coordinatorId}>
                      {coordinator.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-gray-800/50 border border-gray-700 rounded p-3 text-xs text-gray-400">
                  No study coordinators available. Add coordinators to the study before assigning visits.
                </div>
              )}

              <p className="text-xs text-gray-500">
                Applied to {selectedVisitIds.size} visit{selectedVisitIds.size === 1 ? '' : 's'}. Leave empty to clear assignments.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBulkAssignOpen(false)
                    setBulkCoordinatorSelection([])
                  }}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || studyCoordinators.length === 0}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    assigning || studyCoordinators.length === 0
                      ? 'bg-blue-900/40 text-blue-200/60 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {assigning ? 'Saving…' : 'Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Simple Modal/Alert for Edit Actions */}
      {showEditModal && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-white font-medium mb-4">
              {showEditModal.type === 'ip' && 'Edit IP Data'}
              {showEditModal.type === 'note' && 'Add Note'}
            </h3>
            <p className="text-gray-400 mb-4">
              {showEditModal.type === 'ip' && 'IP data editing functionality will be implemented here.'}
              {showEditModal.type === 'note' && 'Note adding functionality will be implemented here.'}
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
