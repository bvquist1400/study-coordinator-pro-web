'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { calculateVisitDate } from '@/lib/visit-calculator'
import { formatDateUTC, parseDateUTC, todayLocalISODate } from '@/lib/date-utils'
import type { VisitSchedule as DbVisitSchedule, LabKit, StudySection } from '@/types/database'

const UNSCHEDULED_TEMPLATES = [
  {
    id: 'safety-follow-up',
    label: 'Safety Follow-up',
    name: 'Unscheduled Safety Follow-up',
    reason: 'Safety follow-up assessment after an adverse event.'
  },
  {
    id: 'lab-draw',
    label: 'Additional Lab Draw',
    name: 'Unscheduled Lab Draw',
    reason: 'Additional lab samples required outside the scheduled window.'
  },
  {
    id: 'drug-check',
    label: 'Drug Accountability Check',
    name: 'Drug Accountability Check',
    reason: 'Off-cycle drug accountability reconciliation.'
  }
] as const

interface Subject {
  id: string
  subject_number: string
  status: string
  randomization_date: string | null
}

type VisitSchedule = DbVisitSchedule

interface Study {
  id: string
  protocol_number: string
  study_title: string
  anchor_day: number
  visit_window_days: number
}

interface ScheduleVisitModalProps {
  studyId?: string // Optional - if not provided, will show study selector
  preSelectedSubjectId?: string
  allowStudySelection?: boolean // Default false for backward compatibility
  preSelectedVisitScheduleId?: string
  preSelectedDate?: string // YYYY-MM-DD
  preSelectedSectionId?: string
  initialMode?: 'protocol' | 'custom'
  onClose: () => void
  onSchedule: () => void
}

export default function ScheduleVisitModal({ studyId, preSelectedSubjectId, allowStudySelection = false, preSelectedVisitScheduleId, preSelectedDate, preSelectedSectionId, initialMode = 'protocol', onClose, onSchedule }: ScheduleVisitModalProps) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [visitSchedules, setVisitSchedules] = useState<VisitSchedule[]>([])
  const [study, setStudy] = useState<Study | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Study selection state (only used when allowStudySelection = true)
  const [availableStudies, setAvailableStudies] = useState<Study[]>([])
  const [currentStudyId, setCurrentStudyId] = useState<string>(studyId || '')
  const [scheduling, setScheduling] = useState(false)
  
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedVisitScheduleId, setSelectedVisitScheduleId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [customVisitName, setCustomVisitName] = useState('')
  const [isCustomVisit, setIsCustomVisit] = useState(initialMode === 'custom')
  const [unscheduledReason, setUnscheduledReason] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  
  // Lab kit assignment state
  const [availableLabKits, setAvailableLabKits] = useState<LabKit[]>([])
  const [labKitSearch, setLabKitSearch] = useState('')
  const [selectedLabKit, setSelectedLabKit] = useState<LabKit | null>(null)
  const [showLabKitDropdown, setShowLabKitDropdown] = useState(false)
  const [labKitRequired, setLabKitRequired] = useState(false)

  // Sections
  const [sections, setSections] = useState<StudySection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [activeSubjectSectionId, setActiveSubjectSectionId] = useState<string | null>(null)
  const [activeAnchorDate, setActiveAnchorDate] = useState<string | null>(null)

  const handleModeChange = (mode: 'protocol' | 'custom') => {
    if (mode === 'custom') {
      setIsCustomVisit(true)
      setSelectedTemplate('')
      setSelectedVisitScheduleId('')
      setLabKitRequired(false)
      setSelectedLabKit(null)
      setShowLabKitDropdown(false)
      if (!scheduledDate) {
        setScheduledDate(preSelectedDate || todayLocalISODate())
      }
    } else {
      setIsCustomVisit(false)
      setSelectedTemplate('')
      setCustomVisitName('')
      setUnscheduledReason('')
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = UNSCHEDULED_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setCustomVisitName(template.name)
      setUnscheduledReason(template.reason)
      if (!scheduledDate) {
        setScheduledDate(preSelectedDate || todayLocalISODate())
      }
    } else {
      setCustomVisitName('')
      setUnscheduledReason('')
    }
  }

  const loadData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      // If allowStudySelection is true, load all studies first
      if (allowStudySelection) {
        const studiesRes = await fetch('/api/studies', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (studiesRes.ok) {
          const { studies } = await studiesRes.json()
          setAvailableStudies(studies || [])
          // Set first study as default if no studyId provided
          if (!currentStudyId && studies && studies.length > 0) {
            setCurrentStudyId(studies[0].id)
          }
        }
      }

      const targetStudyId = allowStudySelection ? currentStudyId : studyId
      if (!targetStudyId) return

      // Load sections first
      const secRes = await fetch(`/api/study-sections?study_id=${targetStudyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      let effectiveSectionId = preSelectedSectionId || selectedSectionId
      if (secRes.ok) {
        const { sections } = await secRes.json()
        setSections(sections || [])
        if (!effectiveSectionId && sections && sections.length > 0) {
          effectiveSectionId = sections[0].id
          setSelectedSectionId(sections[0].id)
        }
      }

      const sectionQuery = effectiveSectionId ? `&section_id=${effectiveSectionId}` : ''

      // Load subjects, visit schedules, study data, and available lab kits in parallel
      const [subjectsRes, schedulesRes, studyRes, labKitsRes] = await Promise.all([
        fetch(`/api/subjects?study_id=${targetStudyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/visit-schedules?study_id=${targetStudyId}${sectionQuery}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/studies/${targetStudyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/lab-kits?studyId=${targetStudyId}&status=available`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])

      if (subjectsRes.ok) {
        const data = await subjectsRes.json()
        // For now, show all subjects regardless of status to ensure visits can be scheduled
        const filteredSubjects = data.subjects || []
        setSubjects(filteredSubjects)
        // If a subject is preselected or first subject exists, check active subject section
        const subjId = preSelectedSubjectId || filteredSubjects[0]?.id
        if (subjId) {
          // Fetch via API to avoid RLS
          const assnRes = await fetch(`/api/subject-sections?subject_id=${subjId}&study_id=${targetStudyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          if (assnRes.ok) {
            const { sections: subjSecs } = await assnRes.json()
            const active = (subjSecs || []).find((s: any) => s.ended_at === null) || (subjSecs || [])[subjSecs.length - 1]
            if (active) {
              setActiveSubjectSectionId(active.id)
              if (active.study_section_id) {
                setSelectedSectionId(active.study_section_id)
                effectiveSectionId = active.study_section_id
              }
              setActiveAnchorDate(active.anchor_date || null)
            } else {
              setActiveSubjectSectionId(null)
              setActiveAnchorDate(null)
            }
          }
        }
      } else {
        console.error('Failed to fetch subjects:', subjectsRes.status, await subjectsRes.text())
      }

      if (schedulesRes.ok) {
        const data = await schedulesRes.json()
        const raw = data.visitSchedules || []
        const filtered = effectiveSectionId ? raw.filter((s: any) => (s as any).section_id === effectiveSectionId) : raw
        setVisitSchedules(filtered)

        // Preselect visit and date when provided
        if (preSelectedVisitScheduleId) {
          setSelectedVisitScheduleId(preSelectedVisitScheduleId)
          if (preSelectedDate) setScheduledDate(preSelectedDate)
        }
      }

      if (studyRes.ok) {
        const data = await studyRes.json()
        if (data?.study) {
          setStudy(data.study)
        }
      }

      if (labKitsRes.ok) {
        const data = await labKitsRes.json()
        setAvailableLabKits(data.labKits || [])
      } else {
        console.error('Failed to fetch lab kits:', labKitsRes.status, await labKitsRes.text())
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId, allowStudySelection, currentStudyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    handleModeChange(initialMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode])

  // Auto-select the preselected subject when data loads
  useEffect(() => {
    if (preSelectedSubjectId && subjects.length > 0 && !selectedSubjectId) {
      const preSelectedSubject = subjects.find(s => s.id === preSelectedSubjectId)
      if (preSelectedSubject) {
        setSelectedSubjectId(preSelectedSubjectId)
      }
    }
  }, [preSelectedSubjectId, subjects, selectedSubjectId])

  const handleStudyChange = (newStudyId: string) => {
    setCurrentStudyId(newStudyId)
    // Reset dependent selections when study changes
    setSelectedSubjectId('')
    setSelectedVisitScheduleId('')
    setScheduledDate('')
    setSelectedLabKit(null)
    setLabKitSearch('')
  }

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId)
    setScheduledDate(isCustomVisit ? todayLocalISODate() : '') // Reset date when subject changes
    // Load active section for this subject
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const targetStudyId = allowStudySelection ? currentStudyId : studyId
        if (!token || !targetStudyId) return
        const assnRes = await fetch(`/api/subject-sections?subject_id=${subjectId}&study_id=${targetStudyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (assnRes.ok) {
          const { sections: subjSecs } = await assnRes.json()
          const active = (subjSecs || []).find((s: any) => s.ended_at === null) || (subjSecs || [])[subjSecs.length - 1]
          if (active) {
            setActiveSubjectSectionId(active.id)
            if (active.study_section_id) setSelectedSectionId(active.study_section_id)
            setActiveAnchorDate(active.anchor_date || null)
          } else {
            setActiveSubjectSectionId(null)
            setActiveAnchorDate(null)
          }
        }
      } catch {
        // ignore
      }
    })()
  }

  const handleVisitScheduleChange = (scheduleId: string) => {
    setSelectedVisitScheduleId(scheduleId)
    
    // Check if this visit type requires a lab kit
    const schedule = visitSchedules.find(s => s.id === scheduleId)
    if (schedule) {
      const procNames: string[] = (schedule.procedures || []) as string[]
      const lower = procNames.map(p => String(p).toLowerCase())
      const requiresKit = lower.includes('lab kit') || lower.includes('labkit')
      setLabKitRequired(requiresKit)
    }
    
    if (scheduleId && selectedSubjectId && study) {
      // Auto-calculate visit date based on subject's anchor date
      const anchorStr = activeAnchorDate // require section anchor
      if (anchorStr && schedule) {
        const anchorDay = typeof study.anchor_day === 'number' ? study.anchor_day : 0
        const scheduleDayRaw = typeof schedule.visit_day === 'number' ? schedule.visit_day : 0
        const normalizedVisitDay = anchorDay === 1 ? Math.max(scheduleDayRaw - 1, 0) : scheduleDayRaw
        const windowBefore = typeof schedule.window_before_days === 'number' ? schedule.window_before_days : 0
        const windowAfter = typeof schedule.window_after_days === 'number' ? schedule.window_after_days : 0
        const baseAnchor = parseDateUTC(anchorStr) || new Date(anchorStr)
        const calc = calculateVisitDate(
          baseAnchor,
          normalizedVisitDay,
          'days',
          0,
          windowBefore,
          windowAfter
        )
        // Use ISO date string to avoid timezone shifts when populating the input
        const isoDate = calc.scheduledDate.toISOString().slice(0, 10)
        setScheduledDate(isoDate)
      }
    }
  }

  // Lab kit search and selection handlers
  const filteredLabKits = availableLabKits.filter(kit => 
    kit.accession_number?.toLowerCase().includes(labKitSearch.toLowerCase())
  )

  const handleLabKitSearch = (value: string) => {
    setLabKitSearch(value)
    setShowLabKitDropdown(value.length > 0 && filteredLabKits.length > 0)
  }

  const handleLabKitSelect = (kit: LabKit) => {
    setSelectedLabKit(kit)
    setLabKitSearch(kit.accession_number)
    setShowLabKitDropdown(false)
  }

  const handleLabKitInputKeyDown = (e: React.KeyboardEvent) => {
    if (!showLabKitDropdown || filteredLabKits.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Focus first item or implement navigation logic
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      // Navigate up
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredLabKits.length > 0) {
        handleLabKitSelect(filteredLabKits[0])
      }
    } else if (e.key === 'Escape') {
      setShowLabKitDropdown(false)
    }
  }

  const handleSchedule = async () => {
    if (!selectedSubjectId || !scheduledDate) {
      alert('Please fill in all required fields')
      return
    }

    if (!isCustomVisit && !selectedVisitScheduleId) {
      alert('Please select a protocol visit')
      return
    }

    if (isCustomVisit) {
      if (!customVisitName.trim()) {
        alert('Provide a custom visit name')
        return
      }
      if (!unscheduledReason.trim()) {
        alert('Provide a reason for the unscheduled visit')
        return
      }
    }

    // Note: We intentionally do NOT require lab kit selection at scheduling time
    // The inventory forecasting system will predict lab kit needs automatically

    try {
      setScheduling(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      let visitName = customVisitName.trim()
      let visitScheduleId: string | null = null
      let labKitRequired = false
      let drugDispensingRequired = false
      let localLabsRequired = false

      if (!isCustomVisit && selectedVisitScheduleId) {
        const schedule = visitSchedules.find(s => s.id === selectedVisitScheduleId)
        visitName = schedule?.visit_name || 'Unknown Visit'
        visitScheduleId = selectedVisitScheduleId
        // Map procedures in visit schedule to required flags
        // Assumes visit_schedules has a procedures array (string[]); if not present in this type, we can fetch from API later
        const procNames: string[] = (schedule?.procedures || []) as string[]
        const lower = procNames.map(p => String(p).toLowerCase())
        labKitRequired = lower.includes('lab kit') || lower.includes('labkit')
        // Interpret SOE row label "IP Compliance Calculation" as the flag for IP accountability UI
        drugDispensingRequired = lower.includes('ip compliance calculation') || lower.includes('medication dispensing') || lower.includes('drug dispensing')
        localLabsRequired = lower.includes('local labs') || lower.includes('local lab')
      }

      const visitData = {
        study_id: allowStudySelection ? currentStudyId : studyId,
        subject_id: selectedSubjectId,
        visit_schedule_id: visitScheduleId,
        visit_name: visitName,
        visit_date: scheduledDate,
        status: 'scheduled',
        subject_section_id: activeSubjectSectionId || undefined,
        // Pre-populate required flags based on schedule
        lab_kit_required: labKitRequired || undefined,
        drug_dispensing_required: drugDispensingRequired || undefined,
        local_labs_required: localLabsRequired || undefined,
        // Include selected lab kit if assigned
        lab_kit_id: selectedLabKit?.id || undefined,
        is_unscheduled: isCustomVisit ? true : undefined,
        unscheduled_reason: isCustomVisit ? unscheduledReason.trim() : undefined
      }

      const response = await fetch('/api/subject-visits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(visitData)
      })

      if (response.ok) {
        onSchedule()
      } else {
        const error = await response.json()
        alert(`Error scheduling visit: ${error.error}`)
      }
    } catch (error) {
      console.error('Error scheduling visit:', error)
      alert('Failed to schedule visit')
    } finally {
      setScheduling(false)
    }
  }

  // When section changes manually, reload visit schedules for that section
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const targetStudyId = allowStudySelection ? currentStudyId : studyId
        if (!token || !targetStudyId) return
        const resp = await fetch(`/api/visit-schedules?study_id=${targetStudyId}${selectedSectionId ? `&section_id=${selectedSectionId}` : ''}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (resp.ok) {
          const { visitSchedules } = await resp.json()
          const filtered = selectedSectionId ? (visitSchedules || []).filter((s: any) => (s as any).section_id === selectedSectionId) : (visitSchedules || [])
          setVisitSchedules(filtered)
        }
      } catch {
        // ignore
      }
    })()
  }, [selectedSectionId])

  const getVisitWindow = () => {
    if (isCustomVisit) return null
    // Window MUST be anchored to the target date (anchor + visit_day), not the chosen scheduled date
    if (!selectedVisitScheduleId) return null
    const schedule = visitSchedules.find(s => s.id === selectedVisitScheduleId)
    if (!schedule) return null
    const subject = subjects.find(s => s.id === selectedSubjectId)
    if (!study || !subject) return null
    // Require section anchor to compute
    const anchorStr = activeAnchorDate
    if (!anchorStr) return null

    const anchorDay = typeof study.anchor_day === 'number' ? study.anchor_day : 0
    const scheduleDayRaw = typeof schedule.visit_day === 'number' ? schedule.visit_day : 0
    const normalizedVisitDay = anchorDay === 1 ? Math.max(scheduleDayRaw - 1, 0) : scheduleDayRaw
    const windowBefore = typeof schedule.window_before_days === 'number' ? schedule.window_before_days : 0
    const windowAfter = typeof schedule.window_after_days === 'number' ? schedule.window_after_days : 0

    const calc = calculateVisitDate(
      (parseDateUTC(anchorStr) || new Date(anchorStr)) as Date,
      normalizedVisitDay,
      'days',
      0,
      windowBefore,
      windowAfter
    )
    // calc.scheduledDate here represents the target date (anchor + visit_day + anchor offset)
    const windowStart = calc.windowStart
    const windowEnd = calc.windowEnd

    return { start: formatDateUTC(windowStart), end: formatDateUTC(windowEnd) }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
          <div className="animate-pulse flex items-center space-x-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  const visitWindow = getVisitWindow()
  const hasProtocolVisits = visitSchedules.length > 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Schedule Visit</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Study Selection - only shown when allowStudySelection is true */}
            {allowStudySelection && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Study *
                </label>
                <select
                  value={currentStudyId}
                  onChange={(e) => handleStudyChange(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Study...</option>
                  {availableStudies.map((study) => (
                    <option key={study.id} value={study.id}>
                      {study.protocol_number} - {study.study_title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Subject Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Subject *
              </label>
              <select
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Subject...</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_number} ({subject.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Section Selection */}
            {sections.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Section
                </label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  disabled={!!activeSubjectSectionId}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.code}{sec.name ? ` — ${sec.name}` : ''}
                    </option>
                  ))}
                </select>
                {activeSubjectSectionId && (
                  <p className="text-xs text-gray-400 mt-1">Subject has an active section assignment; section is locked for scheduling.</p>
                )}
              </div>
            )}

            {/* Visit Type Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Visit Type
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('protocol')}
                  disabled={!hasProtocolVisits}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    !isCustomVisit
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  } ${!hasProtocolVisits ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Protocol Visit
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('custom')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isCustomVisit
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Custom / Unscheduled
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {isCustomVisit
                  ? 'Custom visits are flagged as unscheduled and require a brief reason.'
                  : hasProtocolVisits
                    ? 'Protocol visits keep window calculations intact.'
                    : 'No protocol templates defined for this section; create an unscheduled visit below.'}
              </p>
            </div>

            {/* Visit Selection */}
            {!isCustomVisit ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Visit Template *
                </label>
                <select
                  value={selectedVisitScheduleId}
                  onChange={(e) => handleVisitScheduleChange(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Visit...</option>
                  {visitSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.visit_name} (Day {schedule.visit_day})
                    </option>
                  ))}
                </select>
                {visitSchedules.length === 0 && (
                  <p className="text-sm text-yellow-400 mt-2">
                    ⚠️ No visit schedules found for this study. Contact your study coordinator to set up the Schedule of Events (SOE).
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Custom Visit Name *
                </label>
                <input
                  type="text"
                  value={customVisitName}
                  onChange={(e) => setCustomVisitName(e.target.value)}
                  placeholder="e.g., Unscheduled Visit, Safety Follow-up"
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a template (optional)...</option>
                    {UNSCHEDULED_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Reason *
                  </label>
                  <textarea
                    value={unscheduledReason}
                    onChange={(e) => setUnscheduledReason(e.target.value)}
                    placeholder="Briefly describe why this unscheduled visit is needed"
                    rows={3}
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Scheduled Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Scheduled Date *
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {visitWindow && (
                <p className="text-sm text-gray-400 mt-1">
                  Visit window: {visitWindow.start} - {visitWindow.end}
                </p>
              )}
            </div>

            {/* Lab Kit Assignment - Hidden: Using predictive inventory system */}
            {false && (labKitRequired || selectedLabKit) && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Lab Kit Assignment {labKitRequired && '*'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={labKitSearch}
                    onChange={(e) => handleLabKitSearch(e.target.value)}
                    onKeyDown={handleLabKitInputKeyDown}
                    onFocus={() => setShowLabKitDropdown(labKitSearch.length > 0 && filteredLabKits.length > 0)}
                    placeholder="Type accession number to search..."
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {selectedLabKit && (
                    <button
                      onClick={() => {
                        setSelectedLabKit(null)
                        setLabKitSearch('')
                        setShowLabKitDropdown(false)
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {showLabKitDropdown && filteredLabKits.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredLabKits.map((kit) => (
                      <button
                        key={kit.id}
                        onClick={() => handleLabKitSelect(kit)}
                        className="w-full px-3 py-2 text-left text-gray-100 hover:bg-gray-600 focus:bg-gray-600 focus:outline-none first:rounded-t-lg last:rounded-b-lg"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium">{kit.accession_number}</span>
                            {kit.kit_type && (
                              <span className="ml-2 text-sm text-gray-400">({kit.kit_type})</span>
                            )}
                          </div>
                          {kit.expiration_date && (
                            <span className="text-xs text-gray-400">
                              Exp: {formatDateUTC(kit.expiration_date)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedLabKit && (
                  <div className="mt-2 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                      <span className="text-sm text-green-400">Lab Kit Assigned</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-300">
                      <p><span className="text-gray-400">Accession:</span> {selectedLabKit?.accession_number}</p>
                      {selectedLabKit?.kit_type && (
                        <p><span className="text-gray-400">Type:</span> {selectedLabKit?.kit_type}</p>
                      )}
                      {selectedLabKit?.expiration_date && (
                        <p><span className="text-gray-400">Expires:</span> {formatDateUTC(selectedLabKit?.expiration_date as string)}</p>
                      )}
                    </div>
                  </div>
                )}

                {labKitRequired && !selectedLabKit && (
                  <p className="text-sm text-yellow-400 mt-1">
                    This visit type requires a lab kit assignment
                  </p>
                )}
              </div>
            )}

            {/* Predictive Inventory Notice */}
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-400 mb-1">Automatic Lab Kit Management</h4>
                  <p className="text-sm text-blue-300">
                    Lab kit assignments are managed automatically using our predictive inventory system. 
                    The system tracks upcoming visits and ensures adequate kit availability without requiring manual assignment during scheduling.
                  </p>
                </div>
              </div>
            </div>

            {/* Preview */}
            {selectedSubjectId && (selectedVisitScheduleId || customVisitName) && scheduledDate && (
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Preview</h3>
                <div className="text-gray-100 space-y-1">
                  <p><span className="text-gray-400">Subject:</span> {subjects.find(s => s.id === selectedSubjectId)?.subject_number}</p>
                  <p><span className="text-gray-400">Visit:</span> {
                    isCustomVisit 
                      ? customVisitName 
                      : visitSchedules.find(s => s.id === selectedVisitScheduleId)?.visit_name
                  }</p>
                  <p><span className="text-gray-400">Date:</span> {formatDateUTC(scheduledDate)}</p>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-4 px-6 py-4 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            disabled={scheduling || !selectedSubjectId || (!selectedVisitScheduleId && !customVisitName) || !scheduledDate}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {scheduling && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            <span>{scheduling ? 'Scheduling...' : 'Schedule Visit'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
