'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { VisitSchedule, Study, StudySection, StudyKitType, VisitKitRequirementInsert, VisitKitRequirementUpdate } from '@/types/database'

interface ScheduleOfEventsBuilderProps {
  study: Study
  onSave?: (schedules: VisitSchedule[]) => void
}

interface VisitKitRequirementDraft {
  id?: string
  tempId?: string
  kit_type_id: string | null
  kit_type_name?: string | null
  quantity: number
  is_optional: boolean
  notes: string | null
}

interface Visit {
  id: string
  visitNumber: string // This is the display version (e.g., "V1", "OLS")
  visitName: string
  timingValue: number
  timingUnit: 'days' | 'weeks' | 'months'
  visitWindowBefore: number
  visitWindowAfter: number
  isNew?: boolean
  originalVisitNumber?: string // Preserve original DB visit number text for updates
  kitRequirements: VisitKitRequirementDraft[]
  requirementsToDelete: string[]
}

interface Procedure {
  id: string
  category: string
  name: string
  visits: { [visitId: string]: boolean | 'X' | null }
}

type VisitTemplate = Omit<Visit, 'id' | 'kitRequirements' | 'requirementsToDelete'>

const defaultVisitTemplates: VisitTemplate[] = [
  { visitNumber: 'S1', visitName: 'Screening', timingValue: -14, timingUnit: 'days', visitWindowBefore: 30, visitWindowAfter: 0 },
  { visitNumber: 'V1', visitName: 'Baseline', timingValue: 1, timingUnit: 'days', visitWindowBefore: 0, visitWindowAfter: 0 },
  { visitNumber: 'V2', visitName: 'Visit 2', timingValue: 4, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V3', visitName: 'Visit 3', timingValue: 13, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V4', visitName: 'Visit 4', timingValue: 26, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V5', visitName: 'Visit 5', timingValue: 39, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'V6', visitName: 'Visit 6', timingValue: 52, timingUnit: 'weeks', visitWindowBefore: 7, visitWindowAfter: 7 },
  { visitNumber: 'ET', visitName: 'Early Term', timingValue: 0, timingUnit: 'days', visitWindowBefore: 0, visitWindowAfter: 0 },
  { visitNumber: 'FU', visitName: 'Follow-up', timingValue: 30, timingUnit: 'days', visitWindowBefore: 0, visitWindowAfter: 7 }
]

const defaultVisits: Omit<Visit, 'id'>[] = defaultVisitTemplates.map(v => ({
  ...v,
  kitRequirements: [],
  requirementsToDelete: []
}))

const defaultProcedures: Omit<Procedure, 'id'>[] = [
  // Laboratory
  { category: 'Laboratory', name: 'Local Labs', visits: {} },
  { category: 'Laboratory', name: 'Lab Kit', visits: {} },
  
  // Investigational Product
  { category: 'Investigational Product', name: 'Medication Dispensing', visits: {} }
]

const TIMING_UNIT_MULTIPLIERS: Record<'days' | 'weeks' | 'months', number> = {
  days: 1,
  weeks: 7,
  months: 30
}

const toVisitDay = (value: number, unit: 'days' | 'weeks' | 'months') => {
  const multiplier = TIMING_UNIT_MULTIPLIERS[unit] ?? 1
  return value * multiplier
}

export default function ScheduleOfEventsBuilder({ study, onSave }: ScheduleOfEventsBuilderProps) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingCell, setEditingCell] = useState<{ type: string; id: string; field?: string } | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [sections, setSections] = useState<StudySection[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionCode, setNewSectionCode] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [kitTypes, setKitTypes] = useState<StudyKitType[]>([])
  const [kitTypesLoading, setKitTypesLoading] = useState(true)
  const [kitTypeError, setKitTypeError] = useState<string | null>(null)
  const [newKitTypeName, setNewKitTypeName] = useState('')
  const [newKitTypeDescription, setNewKitTypeDescription] = useState('')
  const [creatingKitType, setCreatingKitType] = useState(false)
  const [kitModalVisitId, setKitModalVisitId] = useState<string | null>(null)
  const [kitDrafts, setKitDrafts] = useState<VisitKitRequirementDraft[]>([])
  const [kitRemovedIds, setKitRemovedIds] = useState<string[]>([])

  type EditingCellState = { type: string; id: string; field?: string } | null
  const nextEditingCellRef = useRef<EditingCellState>(null)

  const queueEditingCell = useCallback((cell: EditingCellState) => {
    nextEditingCellRef.current = cell
  }, [])

  const commitQueuedEditingCell = useCallback(() => {
    const next = nextEditingCellRef.current
    nextEditingCellRef.current = null
    if (next) {
      setEditingCell(next)
    } else {
      setEditingCell(null)
    }
  }, [setEditingCell])

  const focusVisitField = useCallback((visitId: string, field: 'number' | 'name' | 'timing' | 'window') => {
    queueEditingCell({ type: 'visit', id: visitId, field })
  }, [queueEditingCell])

  const focusAdjacentVisitField = useCallback((visitId: string, offset: number, field: 'number' | 'name' | 'timing' | 'window') => {
    const currentIndex = visits.findIndex(v => v.id === visitId)
    if (currentIndex === -1) {
      return false
    }
    const target = visits[currentIndex + offset]
    if (!target) {
      return false
    }
    queueEditingCell({ type: 'visit', id: target.id, field })
    return true
  }, [queueEditingCell, visits])

  const generateTempId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  // Initialize with default data
  useEffect(() => {
    const loadSectionsAndSchedule = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        let list: StudySection[] = []
        if (token) {
          try {
            const resp = await fetch(`/api/study-sections?study_id=${study.id}`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            if (resp.ok) {
              const json = await resp.json()
              list = (json?.sections || []) as StudySection[]
            }
          } catch (apiErr) {
            console.warn('API error loading sections, falling back to direct DB:', apiErr)
          }
        }

        if (list.length === 0) {
          // Fallback to direct DB (may be blocked by RLS)
          const { data, error } = await supabase
            .from('study_sections')
            .select('*')
            .eq('study_id', study.id)
            .order('order_index', { ascending: true })
          if (!error && data) {
            list = data as StudySection[]
          }
        }

        setSections(list)
        const initial = list[0]?.id || null
        setSelectedSectionId(initial)
        await loadScheduleData(initial)
      } catch (e) {
        console.warn('Unable to load sections; loading schedules without section filter', e)
        setSections([])
        setSelectedSectionId(null)
        await loadScheduleData(null)
      }
    }
    loadSectionsAndSchedule()
  }, [study.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadScheduleData = async (sectionId: string | null) => {
    try {
      // Use API route instead of direct Supabase call to handle RLS properly
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      let existingSchedules = null
      
      if (token) {
        try {
          const params = new URLSearchParams({ study_id: study.id })
          if (sectionId) params.set('section_id', sectionId)
          const response = await fetch(`/api/visit-schedules?${params.toString()}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            existingSchedules = data.visitSchedules
          }
        } catch (apiError) {
          console.warn('API error, trying direct database access:', apiError)
        }
      }
      
      // Fallback to direct Supabase call if API fails
      if (!existingSchedules) {
        let q = supabase
          .from('visit_schedules')
          .select('*')
          .eq('study_id', study.id)
          .order('visit_day')

        if (sectionId) {
          q = q.eq('section_id', sectionId)
        }

        const { data, error } = await q
        if (error) throw error
        existingSchedules = data
      }
      
      console.warn('Loaded existing schedules from DB:', existingSchedules)

      let visitsToUse: Visit[]
      let proceduresToUse: Procedure[]

      if (existingSchedules && existingSchedules.length > 0) {
        // Load existing data from database and sort by visit_day, then by window_before_days (desc) for same-day visits
        const sortedSchedules = [...existingSchedules].sort((a, b) => {
          const dayDiff = (a.visit_day || 0) - (b.visit_day || 0)
          if (dayDiff !== 0) return dayDiff
          // For same visit_day, sort by window_before_days descending (larger negative window first)
          return (b.window_before_days || 0) - (a.window_before_days || 0)
        })
        
        const resolveTiming = (schedule: any): { value: number; unit: 'days' | 'weeks' | 'months' } => {
          const rawUnit = (schedule.timing_unit || '').toLowerCase()
          const rawValue = typeof schedule.timing_value === 'number' ? schedule.timing_value : Number(schedule.timing_value)

          if ((rawUnit === 'days' || rawUnit === 'weeks' || rawUnit === 'months') && Number.isFinite(rawValue)) {
            return {
              value: Math.trunc(rawValue),
              unit: rawUnit
            }
          }

          const visitDay = Number(schedule.visit_day) || 0

          if (visitDay === 0) {
            return { value: 0, unit: 'days' }
          }

          if (visitDay < 0) {
            return { value: visitDay, unit: 'days' }
          }

          if (visitDay % 30 === 0) {
            return { value: visitDay / 30, unit: 'months' }
          }

          if (visitDay % 7 === 0) {
            return { value: visitDay / 7, unit: 'weeks' }
          }

          return { value: visitDay, unit: 'days' }
        }

        visitsToUse = sortedSchedules.map((schedule: any, i: number) => {
          const { value: timingValue, unit: timingUnit } = resolveTiming(schedule)

          return {
            id: `visit-${i}`,
            visitNumber: schedule.visit_number, // Use the text visit number directly (OLS, V1, etc.)
            visitName: schedule.visit_name,
            timingValue,
            timingUnit,
            visitWindowBefore: schedule.window_before_days,
            visitWindowAfter: schedule.window_after_days,
            originalVisitNumber: schedule.visit_number // Preserve original DB visit number
            ,
            kitRequirements: (schedule.kit_requirements || []).map((req: any) => ({
              id: req.id as string,
              tempId: req.id as string,
              kit_type_id: req.kit_type_id as string | null,
              kit_type_name: (req.study_kit_types as any)?.name || null,
              quantity: typeof req.quantity === 'number' ? req.quantity : 1,
              is_optional: !!req.is_optional,
              notes: req.notes || null
            })),
            requirementsToDelete: []
          }
        })
        
        console.warn('Converted visits for display:', visitsToUse)

        // Create procedures with saved procedure assignments
        proceduresToUse = defaultProcedures.map((p: any, i: number) => {
          const procedureWithId: Procedure = {
            ...p,
            id: `proc-${i}`,
            visits: {}
          }
          
          // Map procedures to visits based on saved data using sorted schedules
          sortedSchedules.forEach((schedule: any, visitIndex: number) => {
            const visitId = `visit-${visitIndex}`
            if (schedule.procedures.includes(p.name)) {
              procedureWithId.visits[visitId] = true
            }
          })
          
          return procedureWithId
        })
      } else {
        // Use default data for new studies
        visitsToUse = defaultVisits.map((v, i) => ({
          ...v,
          id: `visit-${i}`,
          kitRequirements: [],
          requirementsToDelete: []
        }))
        
        proceduresToUse = defaultProcedures.map((p, i) => {
          const procedureWithId: Procedure = {
            ...p,
            id: `proc-${i}`,
            visits: {}
          }
          
          // Set some default checkmarks for common procedures
          if (p.name === 'Local Labs') {
            visitsToUse.forEach((v, visitIndex) => {
              if (visitIndex > 0 && visitIndex < visitsToUse.length - 2) {
                procedureWithId.visits[v.id] = true
              }
            })
          }
          if (p.name === 'Medication Dispensing') {
            visitsToUse.forEach((v, visitIndex) => {
              if (visitIndex > 0 && visitIndex < visitsToUse.length - 1) {
                procedureWithId.visits[v.id] = true
              }
            })
          }
          
          return procedureWithId
        })
      }

      setVisits(visitsToUse)
      setProcedures(proceduresToUse)
    } catch (error) {
      console.error('Error loading schedule:', error)
      // Use defaults on error
      setVisits(defaultVisits.map((v, i) => ({ ...v, id: `visit-${i}`, kitRequirements: [], requirementsToDelete: [] })))
      setProcedures(defaultProcedures.map((p, i) => ({ ...p, id: `proc-${i}`, visits: {} })))
    } finally {
      setIsLoading(false)
    }
  }

  const loadKitTypes = useCallback(async () => {
    try {
      setKitTypesLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setKitTypes([])
        return
      }

      const response = await fetch(`/api/study-kit-types?study_id=${study.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        setKitTypes([])
        return
      }

      const { kitTypes: serverKitTypes } = await response.json()
      setKitTypes(Array.isArray(serverKitTypes) ? serverKitTypes : [])
    } catch (error) {
      console.error('Failed to load study kit types', error)
      setKitTypes([])
    } finally {
      setKitTypesLoading(false)
    }
  }, [study.id])

  useEffect(() => {
    loadKitTypes()
  }, [loadKitTypes])

  const kitTypeMap = useMemo(() => new Map(kitTypes.map(type => [type.id, type.name])), [kitTypes])
  const activeKitTypes = useMemo(() => kitTypes.filter(type => type.is_active), [kitTypes])

  const openKitModal = (visitId: string) => {
    const visit = visits.find(v => v.id === visitId)
    if (!visit) return
    const drafts = visit.kitRequirements.map(req => ({
      id: req.id,
      tempId: req.tempId || generateTempId(),
      kit_type_id: req.kit_type_id || null,
      kit_type_name: req.kit_type_name || null,
      quantity: req.quantity,
      is_optional: req.is_optional,
      notes: req.notes
    }))
    setKitDrafts(drafts)
    setKitRemovedIds([])
    setKitModalVisitId(visitId)
  }

  const closeKitModal = () => {
    setKitModalVisitId(null)
    setKitDrafts([])
    setKitRemovedIds([])
    setKitTypeError(null)
    setNewKitTypeName('')
    setNewKitTypeDescription('')
  }

  const updateKitDraft = (tempId: string, field: keyof VisitKitRequirementDraft, value: string | number | boolean | null) => {
    setKitDrafts(current => current.map(draft => {
      if ((draft.tempId || draft.id) === tempId) {
        if (field === 'quantity' && typeof value === 'number') {
          return { ...draft, quantity: value }
        }
        if (field === 'notes' && (typeof value === 'string' || value === null)) {
          return { ...draft, notes: value ? value : null }
        }
        if (field === 'kit_type_id' && (typeof value === 'string' || value === null)) {
          const kitTypeId = value || null
          const kitTypeName = kitTypeId ? kitTypeMap.get(kitTypeId) || null : null
          return { ...draft, kit_type_id: kitTypeId, kit_type_name: kitTypeName }
        }
        if (field === 'is_optional' && typeof value === 'boolean') {
          return { ...draft, is_optional: value }
        }
      }
      return draft
    }))
  }

  const addKitDraft = () => {
    setKitDrafts(current => ([
      ...current,
      {
        tempId: generateTempId(),
        kit_type_id: activeKitTypes[0]?.id || null,
        kit_type_name: activeKitTypes[0]?.name || null,
        quantity: 1,
        is_optional: false,
        notes: null
      }
    ]))
  }

  const removeKitDraft = (tempId: string) => {
    setKitDrafts(current => {
      const draft = current.find(d => (d.tempId || d.id) === tempId)
      if (draft?.id) {
        setKitRemovedIds(prev => Array.from(new Set([...prev, draft.id!])))
      }
      return current.filter(d => (d.tempId || d.id) !== tempId)
    })
  }

  const handleCreateKitType = useCallback(async () => {
    const name = newKitTypeName.trim()
    const description = newKitTypeDescription.trim()
    if (!name) {
      setKitTypeError('Kit type name is required')
      return
    }

    try {
      setCreatingKitType(true)
      setKitTypeError(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required')

      const response = await fetch('/api/study-kit-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          study_id: study.id,
          name,
          description: description || null
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setKitTypeError(error.error || 'Failed to create kit type')
        return
      }

      const { kitType } = await response.json()
      setNewKitTypeName('')
      setNewKitTypeDescription('')
      await loadKitTypes()
      setKitDrafts(current => current.map(draft => {
        if (!draft.kit_type_id) {
          return {
            ...draft,
            kit_type_id: kitType.id as string,
            kit_type_name: kitType.name as string
          }
        }
        return draft
      }))
    } catch (error) {
      setKitTypeError(error instanceof Error ? error.message : 'Failed to create kit type')
    } finally {
      setCreatingKitType(false)
    }
  }, [loadKitTypes, newKitTypeDescription, newKitTypeName, study.id])

  const applyKitDrafts = () => {
    if (!kitModalVisitId) return
    // Validate kit types and quantities
    for (const draft of kitDrafts) {
      if (!draft.kit_type_id) {
        alert('Select a kit type for each entry')
        return
      }
      if (!draft.quantity || draft.quantity < 1) {
        alert('Quantity must be at least 1')
        return
      }
    }

    setVisits(prev => prev.map(visit => {
      if (visit.id !== kitModalVisitId) return visit
      return {
        ...visit,
        kitRequirements: kitDrafts.map(draft => ({
          id: draft.id,
          tempId: draft.tempId || draft.id || generateTempId(),
          kit_type_id: draft.kit_type_id,
          kit_type_name: draft.kit_type_id ? (kitTypeMap.get(draft.kit_type_id) || draft.kit_type_name || null) : (draft.kit_type_name || null),
          quantity: draft.quantity,
          is_optional: !!draft.is_optional,
          notes: draft.notes ? draft.notes.trim() : null
        })),
        requirementsToDelete: Array.from(new Set([...(visit.requirementsToDelete || []), ...kitRemovedIds]))
      }
    }))

    setKitRemovedIds([])
    closeKitModal()
  }

  const summarizeKitRequirements = (visit: Visit) => {
    if (!visit.kitRequirements.length) {
      return 'None'
    }
    return visit.kitRequirements
      .map(req => {
        const name = req.kit_type_id ? (kitTypeMap.get(req.kit_type_id) || req.kit_type_name || 'Kit') : (req.kit_type_name || 'Kit')
        const parts: string[] = [name]
        if (req.quantity > 1) parts.push(`×${req.quantity}`)
        if (req.is_optional) parts.push('(Optional)')
        return parts.join(' ')
      })
      .join(', ')
  }

  const toggleProcedure = (procedureId: string, visitId: string) => {
    setProcedures(procedures.map(proc => {
      if (proc.id === procedureId) {
        const currentValue = proc.visits[visitId]
        const newValue = currentValue ? null : true
        return {
          ...proc,
          visits: {
            ...proc.visits,
            [visitId]: newValue
          }
        }
      }
      return proc
    }))
  }

  const addVisit = () => {
    const newVisitNumber = visits.length + 1
    const newVisit: Visit = {
      id: `visit-new-${Date.now()}`,
      visitNumber: `V${newVisitNumber}`, // This will be editable by the user
      visitName: `Visit ${newVisitNumber}`,
      timingValue: 1,
      timingUnit: 'weeks',
      visitWindowBefore: 7,
      visitWindowAfter: 7,
      isNew: true,
      originalVisitNumber: undefined, // This is a new visit, no original number
      kitRequirements: [],
      requirementsToDelete: []
    }
    setVisits([...visits, newVisit])
  }

  // Remove unused functions to keep procedures fixed

  const updateVisit = <K extends keyof Visit>(visitId: string, field: K, value: Visit[K]) => {
    setVisits(visits.map(v => {
      if (v.id === visitId) {
        const updatedVisit: Visit = { ...v, [field]: value }
        if (field === 'visitNumber') {
          updatedVisit.originalVisitNumber = value as Visit['visitNumber']
        }
        return updatedVisit
      }
      return v
    }))
  }

  const removeVisit = (visitId: string) => {
    const visit = visits.find(v => v.id === visitId)
    if (!visit) return

    const label = visit.visitNumber || visit.visitName
    const shouldRemove = window.confirm(`Delete visit "${label}"? This will remove associated procedures and kit requirements when you save.`)
    if (!shouldRemove) return

    setVisits(prev => prev.filter(v => v.id !== visitId))
    setProcedures(prev => prev.map(proc => {
      if (!(visitId in proc.visits)) return proc
      const { [visitId]: _removed, ...remaining } = proc.visits
      return { ...proc, visits: remaining }
    }))
    nextEditingCellRef.current = null
    setEditingCell(current => (current?.id === visitId ? null : current))
    if (kitModalVisitId === visitId) {
      setKitModalVisitId(null)
      setKitDrafts([])
    }
  }

  const updateProcedure = (procedureId: string, field: keyof Procedure, value: string) => {
    setProcedures(procedures.map(p => 
      p.id === procedureId ? { ...p, [field]: value } : p
    ))
  }

  const saveSchedule = async () => {
    setIsSaving(true)
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        throw new Error('Authentication required')
      }

      // Convert visits to database format
      const visitSchedulesToSave = visits.map((visit, index) => {
        // Get procedures that are required for this visit
        const requiredProcedures = procedures
          .filter(proc => proc.visits[visit.id] === true || proc.visits[visit.id] === 'X')
          .map(proc => proc.name)

        const candidateUnit = visit.timingUnit
        const timingUnit: 'days' | 'weeks' | 'months' = candidateUnit === 'weeks' || candidateUnit === 'months' ? candidateUnit : 'days'
        const rawTimingValue = Number.isFinite(visit.timingValue) ? visit.timingValue : 0
        const timingValue = Math.trunc(rawTimingValue)
        const visitDay = toVisitDay(timingValue, timingUnit)

        const scheduleToSave = {
          study_id: study.id,
          visit_name: visit.visitName,
          visit_number: visit.originalVisitNumber || visit.visitNumber, // Use original or current visit number (text)
          visit_day: visitDay,
          timing_value: timingValue,
          timing_unit: timingUnit,
          window_before_days: visit.visitWindowBefore,
          window_after_days: visit.visitWindowAfter,
          is_required: true, // Default to required
          visit_type: (visit.visitName.toLowerCase().includes('screening') ? 'screening' : 
                       visit.visitName.toLowerCase().includes('baseline') || visit.visitName.toLowerCase().includes('rand') ? 'baseline' :
                       visit.visitName.toLowerCase().includes('early') || visit.visitName.toLowerCase().includes('term') ? 'early_termination' :
                       visit.visitName.toLowerCase().includes('follow') || visit.visitName.toLowerCase().includes('unscheduled') ? 'unscheduled' : 
                       'regular') as 'screening' | 'baseline' | 'regular' | 'unscheduled' | 'early_termination',
          procedures: requiredProcedures,
          notes: null
        }
        
        console.warn(`Visit ${index + 1} data:`, {
          displayVisitNumber: visit.visitNumber,
          originalVisitNumber: visit.originalVisitNumber,
          finalVisitNumber: scheduleToSave.visit_number,
          visitName: visit.visitName,
          timingUnit,
          timingValue,
          visitDay
        })

        return scheduleToSave
      })

      console.warn('Saving visit schedules:', JSON.stringify(visitSchedulesToSave, null, 2))

      // Save via API route (handles RLS properly)
      const response = await fetch('/api/visit-schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          study_id: study.id,
          visit_schedules: visitSchedulesToSave.map(s => ({ ...s, section_id: selectedSectionId }))
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('API Error Response:', errorData)
        console.error('Response status:', response.status)
        throw new Error(errorData.details || errorData.error || 'Failed to save schedule')
      }

      // Sync kit requirements after schedule save
      const sectionQuery = selectedSectionId ? `&section_id=${selectedSectionId}` : ''
      const visitLookupKey = (visitNumber: string, visitName: string) => `${visitNumber}|||${visitName}`
      const visitDraftMap = new Map<string, Visit>
      visits.forEach(v => {
        const key = visitLookupKey(v.originalVisitNumber || v.visitNumber, v.visitName)
        visitDraftMap.set(key, v)
      })

      const latestResponse = await fetch(`/api/visit-schedules?study_id=${study.id}${sectionQuery}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (latestResponse.ok) {
        const { visitSchedules: latestSchedules = [] } = await latestResponse.json()

        const kitOps: Promise<Response>[] = []
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }

        latestSchedules.forEach((schedule: any) => {
          const key = visitLookupKey(schedule.visit_number, schedule.visit_name)
          const visitDraft = visitDraftMap.get(key)
          if (!visitDraft) return

          const desired = visitDraft.kitRequirements || []
          const existing: any[] = schedule.kit_requirements || []

          const desiredById = new Map<string, VisitKitRequirementDraft>()
          desired.forEach(req => {
            if (req.id) desiredById.set(req.id, req)
          })

          const existingById = new Map<string, any>()
          existing.forEach(req => {
            existingById.set(req.id as string, req)
          })

          const deleteIds = new Set<string>((visitDraft.requirementsToDelete || []))
          existing.forEach(req => {
            if (!desiredById.has(req.id as string)) {
              deleteIds.add(req.id as string)
            }
          })

          deleteIds.forEach(id => {
            kitOps.push(fetch(`/api/visit-kit-requirements?id=${id}&study_id=${study.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            }))
          })

          desired.filter(req => !req.id).forEach(req => {
            kitOps.push(fetch('/api/visit-kit-requirements', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                study_id: study.id,
                visit_schedule_id: schedule.id,
                kit_type_id: req.kit_type_id,
                quantity: req.quantity,
                is_optional: req.is_optional,
                notes: req.notes
              } as VisitKitRequirementInsert)
            }))
          })

          desired.filter(req => req.id).forEach(req => {
            const existingReq = existingById.get(req.id!)
            if (!existingReq) return
            const hasChanges = (existingReq.kit_type_id as string | null) !== (req.kit_type_id || null)
              || Number(existingReq.quantity ?? 1) !== req.quantity
              || !!existingReq.is_optional !== !!req.is_optional
              || (existingReq.notes || null) !== (req.notes || null)
            if (hasChanges) {
              kitOps.push(fetch('/api/visit-kit-requirements', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                  id: req.id,
                  study_id: study.id,
                  visit_schedule_id: schedule.id,
                  kit_type_id: req.kit_type_id,
                  quantity: req.quantity,
                  is_optional: req.is_optional,
                  notes: req.notes
                } as VisitKitRequirementUpdate)
              }))
            }
          })
        })

        if (kitOps.length > 0) {
          const results = await Promise.all(kitOps)
          const failures = results.filter(res => !res.ok)
          if (failures.length > 0) {
            console.warn('Some kit requirement operations failed')
            alert('Warning: Some kit requirement updates failed. Please review the kit requirements and try again.')
          }
        }
      } else {
        console.warn('Unable to refresh visit schedules for kit requirements sync')
      }

      setIsLoading(true)
      await loadScheduleData(selectedSectionId || null)
      setIsLoading(false)

      // Save notes if any
      if (notes.trim()) {
        // Could save notes to a separate table or study notes field
        console.warn('Notes to save:', notes)
      }

      console.warn('Schedule saved successfully!')
      
      if (onSave) {
        // onSave expects full VisitSchedule objects, but we're just saving
        // For now, just call it with empty array to indicate success
        onSave([])
      }
    } catch (error) {
      console.error('Error saving schedule:', error)
      alert('Error saving schedule. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent"></div>
        <span className="ml-3 text-gray-300">Loading schedule...</span>
      </div>
    )
  }

  const categories = Array.from(new Set(procedures.map(p => p.category)))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Schedule of Events</h3>
          <p className="text-gray-300 text-sm mt-1">
            Protocol: {study.protocol_number} - {study.study_title}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setShowAddSection(v => !v)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm border border-gray-600"
            title="Add a new section for this study"
          >
            + Add Section
          </button>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {showNotes ? 'Hide' : 'Show'} Notes
          </button>
          <button
            onClick={saveSchedule}
            disabled={isSaving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>

      {showAddSection && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-gray-300 text-xs mb-1">Code</label>
              <input
                value={newSectionCode}
                onChange={e => setNewSectionCode(e.target.value.toUpperCase())}
                placeholder="S2"
                className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600"
              />
            </div>
            <div className="min-w-[200px]">
              <label className="block text-gray-300 text-xs mb-1">Name (optional)</label>
              <input
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder="Open Label Extension"
                className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full"
              />
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600"
                onClick={() => { setShowAddSection(false); setNewSectionCode(''); setNewSectionName('') }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded"
                onClick={async () => {
                  try {
                    const code = (newSectionCode || '').trim()
                    if (!code) {
                      alert('Please enter a section code (e.g., S2)')
                      return
                    }
                    const { data: { session } } = await supabase.auth.getSession()
                    const token = session?.access_token
                    if (!token) throw new Error('Authentication required')
                    const resp = await fetch('/api/study-sections', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ study_id: study.id, code, name: newSectionName })
                    })
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => ({}))
                      throw new Error(err.details || err.error || 'Failed to create section')
                    }
                    // Reload sections and switch to the new one
                    const resp2 = await fetch(`/api/study-sections?study_id=${study.id}`, {
                      headers: { 'Authorization': `Bearer ${token}` }
                    })
                    if (!resp2.ok) throw new Error('Failed to reload sections')
                    const data2 = await resp2.json()
                    const reloaded = (data2?.sections || []) as StudySection[]
                    setSections(reloaded)
                    const created = reloaded.find((s: any) => s.code === code)
                    const newId = created?.id || null
                    setSelectedSectionId(newId)
                    setShowAddSection(false)
                    setNewSectionCode('')
                    setNewSectionName('')
                    setIsLoading(true)
                    await loadScheduleData(newId)
                  } catch (e) {
                    console.error(e)
                    alert((e as Error).message || 'Unable to add section')
                  } finally {
                    setIsLoading(false)
                  }
                }}
              >
                Save Section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Schedule Table */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Header Rows */}
            <thead>
              {sections.length > 1 && (
                <tr className="bg-gray-900/50 border-b border-gray-700">
                  <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">Section</th>
                  <th colSpan={visits.length} className="px-2 py-2 text-left">
                    <select
                      value={selectedSectionId || ''}
                      onChange={async (e) => {
                        const newId = e.target.value || null
                        setSelectedSectionId(newId)
                        setIsLoading(true)
                        await loadScheduleData(newId)
                        setIsLoading(false)
                      }}
                      className="bg-gray-800 text-gray-200 px-2 py-1 rounded border border-gray-700"
                    >
                      {sections
                        .slice()
                        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                        .map(sec => (
                          <option key={sec.id} value={sec.id}>
                            {sec.code}{sec.name ? ` — ${sec.name}` : ''}
                          </option>
                        ))}
                    </select>
                  </th>
                  <th></th>
                </tr>
              )}
              
              {/* Column Actions Row */}
              <tr className="bg-gray-900/40 border-b border-gray-700">
                <th colSpan={2} className="px-4 py-2 border-r border-gray-700 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Delete Visit
                </th>
                {visits.map(visit => (
                  <th key={`${visit.id}-actions`} className="px-2 py-2 text-center border-r border-gray-600">
                    <button
                      type="button"
                      onClick={() => removeVisit(visit.id)}
                      className="text-[11px] uppercase tracking-wide text-red-400 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-400"
                      title={`Delete ${visit.visitNumber}`}
                    >
                      Delete
                    </button>
                  </th>
                ))}
                <th></th>
              </tr>
              
              {/* Visit Number Row */}
              <tr className="bg-gray-900/30 border-b border-gray-700">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Visit Number/Title
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600 min-w-[96px] align-top">
                    <div className="flex flex-col items-center gap-1">
                      {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'number' ? (
                        <input
                          type="text"
                          value={visit.visitNumber}
                          onChange={(e) => updateVisit(visit.id, 'visitNumber', e.target.value)}
                          onBlur={commitQueuedEditingCell}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey) {
                              e.preventDefault()
                              focusVisitField(visit.id, 'name')
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full bg-gray-700 text-white text-sm px-1 py-0.5 rounded text-center"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-white font-semibold cursor-pointer hover:bg-gray-700 rounded px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
                          onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'number' })}
                        >
                          {visit.visitNumber}
                        </button>
                      )}
                      {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'name' ? (
                        <input
                          type="text"
                          value={visit.visitName}
                          onChange={(e) => updateVisit(visit.id, 'visitName', e.target.value)}
                          onBlur={commitQueuedEditingCell}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              if (e.shiftKey) {
                                focusVisitField(visit.id, 'number')
                              } else {
                                focusVisitField(visit.id, 'timing')
                              }
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-gray-400 text-xs mt-1 cursor-pointer hover:text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
                          onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'name' })}
                        >
                          {visit.visitName}
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2">
                  <button
                    onClick={addVisit}
                    className="text-green-400 hover:text-green-300 text-xs"
                    title="Add Visit"
                  >
                    + Add
                  </button>
                </th>
              </tr>
              
              {/* Week/Day Row */}
              <tr className="bg-gray-900/30 border-b border-gray-700">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Week/Day
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600">
                    {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'timing' ? (
                      <div 
                        className="space-y-1"
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            commitQueuedEditingCell()
                          }
                        }}
                      >
                        <input
                          type="number"
                          value={visit.timingValue}
                          onChange={(e) => updateVisit(visit.id, 'timingValue', parseInt(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && e.shiftKey) {
                              e.preventDefault()
                              focusVisitField(visit.id, 'name')
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                          placeholder="#"
                          autoFocus
                        />
                        <select
                          value={visit.timingUnit}
                          onChange={(e) => updateVisit(visit.id, 'timingUnit', e.target.value as Visit['timingUnit'])}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey) {
                              e.preventDefault()
                              focusVisitField(visit.id, 'window')
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                        >
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                          <option value="months">Months</option>
                        </select>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-gray-300 text-xs cursor-pointer hover:text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 mx-auto flex flex-col items-center"
                        onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'timing' })}
                      >
                        <div className="font-semibold">{visit.timingValue}</div>
                        <div className="text-gray-400 capitalize">{visit.timingUnit}</div>
                      </button>
                    )}
                  </th>
                ))}
                <th></th>
              </tr>
              
              {/* Visit Window Row */}
              <tr className="bg-gray-900/30 border-b-2 border-gray-600">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Visit Window
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600">
                    {editingCell?.type === 'visit' && editingCell?.id === visit.id && editingCell?.field === 'window' ? (
                      <div 
                        className="space-y-1"
                        onBlur={(e) => {
                          // Only close if clicking outside the entire container
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            commitQueuedEditingCell()
                          }
                        }}
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span className="text-xs text-gray-400">-</span>
                          <input
                            type="number"
                            value={visit.visitWindowBefore}
                            onChange={(e) => updateVisit(visit.id, 'visitWindowBefore', parseInt(e.target.value) || 0)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && e.shiftKey) {
                                e.preventDefault()
                                focusVisitField(visit.id, 'timing')
                                e.currentTarget.blur()
                              }
                            }}
                            className="w-10 bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                            min="0"
                            autoFocus
                          />
                        </div>
                        <div className="flex items-center justify-center space-x-1">
                          <span className="text-xs text-gray-400">+</span>
                          <input
                            type="number"
                            value={visit.visitWindowAfter}
                            onChange={(e) => updateVisit(visit.id, 'visitWindowAfter', parseInt(e.target.value) || 0)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                const moved = focusAdjacentVisitField(visit.id, 1, 'number')
                                if (moved) {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                }
                              }
                            }}
                            className="w-10 bg-gray-700 text-gray-200 text-xs px-1 py-0.5 rounded text-center"
                            min="0"
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-gray-400 text-xs cursor-pointer hover:text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
                        onClick={() => setEditingCell({ type: 'visit', id: visit.id, field: 'window' })}
                      >
                        {visit.visitWindowBefore === 0 && visit.visitWindowAfter === 0 ? 'N/A' : `-${visit.visitWindowBefore}/+${visit.visitWindowAfter} days`}
                      </button>
                    )}
                  </th>
                ))}
                <th></th>
              </tr>

              <tr className="bg-gray-900/30 border-b border-gray-700">
                <th colSpan={2} className="text-left px-4 py-2 font-semibold text-gray-300 border-r border-gray-700">
                  Kit Requirements
                </th>
                {visits.map(visit => (
                  <th key={visit.id} className="px-2 py-2 text-center border-r border-gray-600">
                    <div className="text-xs text-gray-300 min-h-[32px] flex items-center justify-center text-center px-1">
                      {summarizeKitRequirements(visit)}
                    </div>
                    <button
                      type="button"
                      onClick={() => openKitModal(visit.id)}
                      className="mt-2 text-xs px-2 py-1 border border-gray-600 text-gray-200 rounded hover:bg-gray-700 transition-colors"
                    >
                      Manage
                    </button>
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            
            {/* Procedures Body */}
            <tbody>
              {categories.map((category) => {
                const categoryProcedures = procedures.filter(p => p.category === category)
                
                return (
                  <React.Fragment key={category}>
                    {/* Category Header */}
                    <tr className="bg-gray-800/70">
                      <td colSpan={visits.length + 3} className="px-4 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-200">{category}</span>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Procedures in Category */}
                    {categoryProcedures.map((procedure, procIndex) => (
                      <tr 
                        key={procedure.id} 
                        className={`hover:bg-gray-700/30 ${procIndex % 2 === 0 ? 'bg-gray-800/20' : ''}`}
                      >
                        <td className="w-8 px-2 border-r border-gray-700">
                          {/* Fixed procedures - no remove button */}
                        </td>
                        <td className="px-4 py-2 border-r border-gray-700">
                          {editingCell?.type === 'procedure' && editingCell?.id === procedure.id ? (
                            <input
                              type="text"
                              value={procedure.name}
                              onChange={(e) => updateProcedure(procedure.id, 'name', e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              className="w-full bg-gray-700 text-gray-200 px-2 py-1 rounded"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-gray-200 cursor-pointer hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
                              onClick={() => setEditingCell({ type: 'procedure', id: procedure.id })}
                            >
                              {procedure.name}
                            </button>
                          )}
                        </td>
                        {visits.map(visit => (
                          <td 
                            key={visit.id} 
                            className="text-center border-r border-gray-700/50 hover:bg-gray-600/30 cursor-pointer focus-within:bg-gray-600/40"
                            onClick={() => toggleProcedure(procedure.id, visit.id)}
                            tabIndex={0}
                            role="button"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleProcedure(procedure.id, visit.id)
                              }
                            }}
                          >
                            {procedure.visits[visit.id] && (
                              <span className="text-green-400 text-lg">✓</span>
                            )}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes Section */}
      {showNotes && (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h4 className="text-lg font-semibold text-white mb-3">Notes</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add schedule notes, footnotes, or special instructions..."
            className="w-full h-32 bg-gray-700/50 text-gray-200 rounded-lg p-3 border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
          />
          <div className="mt-3 text-xs text-gray-400">
          </div>
        </div>
      )}

      {kitModalVisitId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800/95 border border-gray-700 rounded-2xl max-w-2xl w-full shadow-xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Manage Kit Requirements</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Specify required kit types for this visit. Quantities reflect kits needed per subject.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeKitModal}
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>

              <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-400 mb-1">New Kit Type</label>
                    <input
                      type="text"
                      value={newKitTypeName}
                      onChange={(e) => setNewKitTypeName(e.target.value)}
                      placeholder="e.g., Q12 Lab Kit"
                      className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={newKitTypeDescription}
                      onChange={(e) => setNewKitTypeDescription(e.target.value)}
                      placeholder="Notes about handling, cadence, etc."
                      className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleCreateKitType}
                      disabled={creatingKitType}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {creatingKitType ? 'Adding…' : 'Add Kit Type'}
                    </button>
                  </div>
                </div>
                {kitTypeError && (
                  <div className="text-sm text-red-400">{kitTypeError}</div>
                )}
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {kitDrafts.length === 0 && (
                  <div className="text-sm text-gray-400 bg-gray-900/50 border border-dashed border-gray-700 rounded-lg p-4 text-center">
                    No kit requirements yet. Add one below.
                  </div>
                )}

                {kitDrafts.map(draft => (
                  <div key={draft.tempId || draft.id} className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Kit Type *</label>
                        <select
                          value={draft.kit_type_id || ''}
                          onChange={(e) => updateKitDraft(draft.tempId || draft.id || '', 'kit_type_id', e.target.value || null)}
                          className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a kit type</option>
                          {kitTypes.map(type => (
                            <option key={type.id} value={type.id}>
                              {type.name}{!type.is_active ? ' (Inactive)' : ''}
                            </option>
                          ))}
                        </select>
                        {kitTypesLoading && (
                          <p className="text-xs text-gray-500 mt-1">Loading kit types…</p>
                        )}
                        {!kitTypesLoading && !kitTypes.length && (
                          <p className="text-xs text-gray-500 mt-1">Add a kit type above to start tracking requirements.</p>
                        )}
                        {draft.kit_type_id && !kitTypeMap.get(draft.kit_type_id) && (
                          <p className="text-xs text-yellow-400 mt-1">Kit type no longer available. Select another.</p>
                        )}
                      </div>
                      <div className="w-full sm:w-28">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Quantity *</label>
                        <input
                          type="number"
                          min={1}
                          value={draft.quantity}
                          onChange={(e) => updateKitDraft(draft.tempId || draft.id || '', 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <label className="inline-flex items-center space-x-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={draft.is_optional}
                          onChange={(e) => updateKitDraft(draft.tempId || draft.id || '', 'is_optional', e.target.checked)}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span>Optional kit</span>
                      </label>

                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => removeKitDraft(draft.tempId || draft.id || '')}
                      >
                        Remove
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Notes</label>
                      <textarea
                        value={draft.notes || ''}
                        onChange={(e) => updateKitDraft(draft.tempId || draft.id || '', 'notes', e.target.value)}
                        rows={2}
                        className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Special handling, storage, etc."
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={addKitDraft}
                  className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  + Add Kit Requirement
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeKitModal}
                    className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyKitDrafts}
                    className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
