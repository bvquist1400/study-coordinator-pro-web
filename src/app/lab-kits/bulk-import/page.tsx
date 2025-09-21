'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useSite } from '@/components/site/SiteProvider'
import { todayLocalISODate } from '@/lib/date-utils'

interface Study {
  id: string
  protocol_number: string
  study_title: string
  site_id: string | null
}

interface VisitSchedule {
  id: string
  visit_name: string
  visit_number: number
  visit_day: number
}

interface StudyKitType {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

interface VisitKitRequirementSummary {
  visit_schedule_id: string | null
  kit_type_id: string
  quantity: number
  is_optional: boolean
}

interface LabKitRow {
  id: string
  accession_number: string
  error?: string
}

export default function BulkImportPage() {
  const router = useRouter()
  const { currentSiteId } = useSite()
  const [studies, setStudies] = useState<Study[]>([])
  const [visitSchedules, setVisitSchedules] = useState<VisitSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  
  // Form state
  const CUSTOM_OPTION = '__custom__'
  const [selectedStudyId, setSelectedStudyId] = useState('')
  const [selectedVisitScheduleId, setSelectedVisitScheduleId] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [kitTypes, setKitTypes] = useState<StudyKitType[]>([])
  const [kitTypesLoading, setKitTypesLoading] = useState(false)
  const [kitTypeError, setKitTypeError] = useState<string | null>(null)
  const [selectedKitTypeId, setSelectedKitTypeId] = useState('')
  const [customKitName, setCustomKitName] = useState('')
  const [requirementsByKitType, setRequirementsByKitType] = useState<Record<string, VisitKitRequirementSummary[]>>({})
  const [receivedDate, setReceivedDate] = useState(todayLocalISODate())
  
  // Grid state
  const [labKitRows, setLabKitRows] = useState<LabKitRow[]>([
    { id: '1', accession_number: '' },
    { id: '2', accession_number: '' },
    { id: '3', accession_number: '' },
    { id: '4', accession_number: '' },
    { id: '5', accession_number: '' }
  ])

  const loadStudies = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        console.warn('Studies loaded:', data.studies)
        setStudies(data.studies || [])
      } else {
        console.error('Failed to load studies:', response.status, await response.text())
      }
    } catch (error) {
      console.error('Error loading studies:', error)
    } finally {
      setLoading(false)
    }
  }, [currentSiteId])

  useEffect(() => {
    loadStudies()
  }, [loadStudies])

  const loadVisitSchedules = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/visit-schedules?study_id=${selectedStudyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setVisitSchedules(data.visitSchedules || [])
      }
    } catch (error) {
      console.error('Error loading visit schedules:', error)
    }
  }, [selectedStudyId])

  const loadKitTypesAndRequirements = useCallback(async () => {
    if (!selectedStudyId) return
    try {
      setKitTypesLoading(true)
      setKitTypeError(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const [kitTypesResp, requirementsResp] = await Promise.all([
        fetch(`/api/study-kit-types?study_id=${selectedStudyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/visit-kit-requirements?study_id=${selectedStudyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])

      if (kitTypesResp.ok) {
        const { kitTypes: serverKitTypes } = await kitTypesResp.json()
        setKitTypes(Array.isArray(serverKitTypes) ? serverKitTypes : [])
      } else {
        setKitTypes([])
        setKitTypeError('Failed to load kit types')
      }

      if (requirementsResp.ok) {
        const { requirements } = await requirementsResp.json()
        const grouped = (requirements || []).reduce((acc: Record<string, VisitKitRequirementSummary[]>, req: any) => {
          const kitTypeId = req.kit_type_id as string | undefined
          if (!kitTypeId) return acc
          if (!acc[kitTypeId]) acc[kitTypeId] = []
          acc[kitTypeId].push({
            kit_type_id: kitTypeId,
            visit_schedule_id: req.visit_schedule_id as string | null,
            quantity: req.quantity ?? 1,
            is_optional: !!req.is_optional
          })
          return acc
        }, {})
        setRequirementsByKitType(grouped)
      } else {
        setRequirementsByKitType({})
      }
    } catch (error) {
      console.error('Error loading kit types or requirements:', error)
      setKitTypes([])
      setRequirementsByKitType({})
      setKitTypeError('Failed to load kit types')
    } finally {
      setKitTypesLoading(false)
    }
  }, [selectedStudyId])

  useEffect(() => {
    if (selectedStudyId) {
      loadVisitSchedules()
      loadKitTypesAndRequirements()
    } else {
      setVisitSchedules([])
      setKitTypes([])
      setRequirementsByKitType({})
      setSelectedKitTypeId('')
      setCustomKitName('')
      setKitTypeError(null)
      setKitTypesLoading(false)
    }
  }, [selectedStudyId, loadVisitSchedules, loadKitTypesAndRequirements])

  useEffect(() => {
    if (kitTypes.length === 1 && !selectedKitTypeId) {
      setSelectedKitTypeId(kitTypes[0].id)
    } else if (selectedKitTypeId && !kitTypes.find(type => type.id === selectedKitTypeId)) {
      setSelectedKitTypeId('')
    }
  }, [kitTypes, selectedKitTypeId])

  const addRow = () => {
    const newId = String(Date.now())
    setLabKitRows(prev => [...prev, { id: newId, accession_number: '' }])
  }

  const removeRow = (id: string) => {
    if (labKitRows.length > 1) {
      setLabKitRows(prev => prev.filter(row => row.id !== id))
    }
  }

  const updateRow = (id: string, field: keyof LabKitRow, value: string) => {
    setLabKitRows(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value, error: undefined } : row
    ))
  }

  const useCustomKitType = useMemo(() => kitTypes.length === 0 || selectedKitTypeId === CUSTOM_OPTION, [kitTypes, selectedKitTypeId])

  const selectedKitType = useMemo(() => {
    if (useCustomKitType) return null
    return kitTypes.find(type => type.id === selectedKitTypeId) || null
  }, [useCustomKitType, kitTypes, selectedKitTypeId])

  const selectedRequirements = useMemo(() => {
    if (!selectedStudyId || useCustomKitType || !selectedKitTypeId) return []
    return requirementsByKitType[selectedKitTypeId] || []
  }, [selectedStudyId, useCustomKitType, selectedKitTypeId, requirementsByKitType])

  const recommendedVisitIds = useMemo(() => new Set(selectedRequirements.map(req => req.visit_schedule_id).filter((id): id is string => !!id)), [selectedRequirements])

  const visitScheduleMap = useMemo(() => new Map(visitSchedules.map(schedule => [schedule.id, schedule])), [visitSchedules])

  const recommendedVisits = useMemo(
    () => visitSchedules.filter(schedule => recommendedVisitIds.has(schedule.id)),
    [visitSchedules, recommendedVisitIds]
  )

  const otherVisits = useMemo(
    () => visitSchedules.filter(schedule => !recommendedVisitIds.has(schedule.id)),
    [visitSchedules, recommendedVisitIds]
  )

  useEffect(() => {
    if (
      selectedVisitScheduleId &&
      !useCustomKitType &&
      selectedKitTypeId &&
      recommendedVisitIds.size > 0 &&
      !recommendedVisitIds.has(selectedVisitScheduleId)
    ) {
      setSelectedVisitScheduleId('')
    }
  }, [selectedVisitScheduleId, useCustomKitType, selectedKitTypeId, recommendedVisitIds])

  const validateRows = () => {
    let hasErrors = false
    const accessionNumbers = new Set<string>()
    
    const updatedRows = labKitRows.map(row => {
      const errors: string[] = []
      
      if (!row.accession_number.trim()) {
        errors.push('Accession number required')
      } else if (accessionNumbers.has(row.accession_number.trim())) {
        errors.push('Duplicate accession number')
      } else {
        accessionNumbers.add(row.accession_number.trim())
      }
      
      if (errors.length > 0) {
        hasErrors = true
        return { ...row, error: errors.join(', ') }
      }
      
      return { ...row, error: undefined }
    })
    
    setLabKitRows(updatedRows)
    return !hasErrors
  }

  const handleSubmit = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)
    if (!selectedStudyId) {
      setErrorMsg('Please select a study')
      return
    }

    if (!validateRows()) {
      setErrorMsg('Please fix the errors in the grid')
      return
    }

    const validRows = labKitRows.filter(row => 
      row.accession_number.trim()
    )

    if (validRows.length === 0) {
      setErrorMsg('Please add at least one lab kit')
      return
    }

    const kitTypeRecord = useCustomKitType ? null : selectedKitType
    const kitTypeName = useCustomKitType ? customKitName.trim() : (kitTypeRecord?.name?.trim() ?? '')

    if (!useCustomKitType && !kitTypeRecord) {
      setErrorMsg('Please select a kit type')
      return
    }

    if (useCustomKitType && !kitTypeName) {
      setErrorMsg('Please enter a kit name')
      return
    }

    try {
      setSubmitting(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const labKits = validRows.map(row => ({
        study_id: selectedStudyId,
        visit_schedule_id: selectedVisitScheduleId || null,
        accession_number: row.accession_number.trim(),
        kit_type_id: kitTypeRecord ? kitTypeRecord.id : null,
        kit_type: kitTypeName || null,
        lot_number: lotNumber.trim() || null,
        expiration_date: expirationDate || null,
        received_date: receivedDate || null,
        status: 'available'
      }))

      const response = await fetch('/api/lab-kits/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ labKits })
      })

      if (response.ok) {
        const result = await response.json()
        setSuccessMsg(`Successfully imported ${result.imported} lab kits`)
        router.push('/lab-kits')
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to import lab kits' }))
        setErrorMsg(`Error importing lab kits: ${error.error}`)
      }
    } catch (error) {
      console.error('Error submitting:', error)
      setErrorMsg('Failed to import lab kits')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-white">Loading studies...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {errorMsg && (
          <div className="mb-4 bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
            <div className="flex items-start justify-between">
              <span>{errorMsg}</span>
              <button aria-label="Dismiss error" className="text-red-300 hover:text-red-200" onClick={() => setErrorMsg(null)}>×</button>
            </div>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 bg-green-900/20 border border-green-700 text-green-300 px-4 py-3 rounded-lg" role="status">
            <div className="flex items-start justify-between">
              <span>{successMsg}</span>
              <button aria-label="Dismiss" className="text-green-300 hover:text-green-200" onClick={() => setSuccessMsg(null)}>×</button>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Bulk Import Lab Kits</h1>
            <p className="text-gray-400 mt-2">Import multiple lab kits at once</p>
          </div>
          <button
            onClick={() => router.push('/lab-kits')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Lab Kits
          </button>
        </div>

        <div className="space-y-8">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold mr-2">1</div>
                <span className="text-blue-400">Study & Kit Details</span>
              </div>
              <div className="w-8 h-0.5 bg-gray-600"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-white font-semibold mr-2">2</div>
                <span className="text-gray-400">Accession Numbers</span>
              </div>
              <div className="w-8 h-0.5 bg-gray-600"></div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-white font-semibold mr-2">3</div>
                <span className="text-gray-400">Review & Import</span>
              </div>
            </div>
          </div>

          {/* Step 1: Common Information */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mr-4">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Kit Information</h2>
                <p className="text-gray-400">Set common details that apply to all kits in this shipment</p>
              </div>
            </div>
            
            {/* Study Selection - Full Width */}
            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                Study Selection *
              </label>
              <select
                value={selectedStudyId}
                onChange={(e) => setSelectedStudyId(e.target.value)}
                className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Choose the study for these lab kits...</option>
                {studies.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.protocol_number} - {study.study_title}
                  </option>
                ))}
              </select>
            </div>

            {/* Kit Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">
                  Kit Type{kitTypes.length > 0 ? ' *' : ''}
                </label>
                {kitTypesLoading ? (
                  <div className="px-4 py-3 bg-gray-700/60 border border-gray-600/40 rounded-xl text-gray-300 text-sm">
                    Loading kit types…
                  </div>
                ) : kitTypes.length > 0 ? (
                  <>
                    <select
                      value={selectedKitTypeId || (useCustomKitType && kitTypes.length > 0 ? CUSTOM_OPTION : '')}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === CUSTOM_OPTION) {
                          setSelectedKitTypeId(CUSTOM_OPTION)
                        } else {
                          setSelectedKitTypeId(value)
                          setCustomKitName('')
                        }
                      }}
                      className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Select the SOE kit type…</option>
                      {kitTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}{!type.is_active ? ' (Inactive)' : ''}
                        </option>
                      ))}
                      <option value={CUSTOM_OPTION}>Other / custom kit name…</option>
                    </select>
                    {kitTypeError && (
                      <p className="text-xs text-red-400 mt-2">{kitTypeError}</p>
                    )}
                    {selectedKitType && selectedKitType.description && (
                      <p className="text-xs text-gray-400 mt-2">{selectedKitType.description}</p>
                    )}
                    {selectedRequirements.length > 0 && (
                      <div className="mt-3 text-xs text-gray-400 space-y-1">
                        <p className="font-semibold text-gray-300">Used in:</p>
                        <ul className="space-y-1">
                          {selectedRequirements.map((req, index) => {
                            const schedule = req.visit_schedule_id ? visitScheduleMap.get(req.visit_schedule_id) : null
                            const label = schedule ? `${schedule.visit_name} (V${schedule.visit_number})` : 'Unassigned'
                            const requirementText = req.is_optional ? 'Optional' : `Required ×${req.quantity}`
                            return (
                              <li key={`${req.kit_type_id}-${index}`} className="list-none text-gray-300">
                                {label} · {requirementText}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                    {selectedKitType && selectedRequirements.length === 0 && (
                      <p className="text-xs text-gray-400 mt-3">
                        This kit type is not yet linked to visits in the Schedule of Events.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-300">No kit catalog entries found for this study. Enter a kit name below.</p>
                    <input
                      type="text"
                      value={customKitName}
                      onChange={(e) => setCustomKitName(e.target.value)}
                      placeholder="e.g., Stool Kit"
                      className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                )}
                {useCustomKitType && kitTypes.length > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-300 mb-2">Custom kit name</label>
                    <input
                      type="text"
                      value={customKitName}
                      onChange={(e) => setCustomKitName(e.target.value)}
                      placeholder="e.g., Q12 Sample Kit"
                      className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">
                  Lot Number
                </label>
                <input
                  type="text"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  placeholder="e.g., LOT12345"
                  className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">
                  Visit Assignment
                </label>
                <select
                  value={selectedVisitScheduleId}
                  onChange={(e) => setSelectedVisitScheduleId(e.target.value)}
                  className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={!selectedStudyId}
                >
                  <option value="">No specific visit</option>
                  {recommendedVisits.length > 0 && (
                    <optgroup label="Recommended (SOE)">
                      {recommendedVisits.map(schedule => {
                        const req = selectedRequirements.find(r => r.visit_schedule_id === schedule.id)
                        const requirementText = req ? (req.is_optional ? 'Optional' : `Required ×${req.quantity}`) : ''
                        return (
                          <option key={schedule.id} value={schedule.id}>
                            {schedule.visit_name} (Day {schedule.visit_day}){requirementText ? ` · ${requirementText}` : ''}
                          </option>
                        )
                      })}
                    </optgroup>
                  )}
                  {otherVisits.length > 0 && (
                    <optgroup label={recommendedVisits.length > 0 ? 'Other Visits' : 'All Visits'}>
                      {otherVisits.map(schedule => (
                        <option key={schedule.id} value={schedule.id}>
                          {schedule.visit_name} (Day {schedule.visit_day})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-gray-400 mt-2">
                  {selectedRequirements.length > 0
                    ? 'Assign if these kits are reserved for a specific visit. Otherwise leave unassigned and allocate later.'
                    : 'Leave unassigned when these kits can be used across visits; you can assign them when scheduling or shipping.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">
                  Expiration Date
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">
                  Received Date
                </label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-full bg-gray-700/60 border border-gray-600/50 text-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Accession Numbers */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center mr-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Accession Numbers</h2>
                  <p className="text-gray-400">Enter the unique identifier for each lab kit</p>
                </div>
              </div>
              <button
                onClick={addRow}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all flex items-center space-x-2 shadow-lg hover:shadow-blue-500/25"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Row</span>
              </button>
            </div>

            <div className="bg-gray-900/40 rounded-xl border border-gray-600/30 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/50 border-b border-gray-600/50">
                      <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6 w-16">#</th>
                      <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Accession Number *</th>
                      <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6 w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labKitRows.map((row, index) => (
                      <tr key={row.id} className={`border-b border-gray-700/30 hover:bg-gray-800/20 transition-colors ${row.error ? 'bg-red-900/10' : ''}`}>
                        <td className="py-4 px-6 text-gray-400 font-medium">{index + 1}</td>
                        <td className="py-4 px-6">
                          <input
                            type="text"
                            value={row.accession_number}
                            onChange={(e) => updateRow(row.id, 'accession_number', e.target.value)}
                            placeholder="e.g., ACC001, KIT-2024-001"
                            className={`w-full bg-gray-700/40 border ${row.error ? 'border-red-500/50' : 'border-gray-600/40'} text-gray-100 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                          />
                          {row.error && (
                            <p className="text-red-400 text-sm mt-2 flex items-center">
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {row.error}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <button
                            onClick={() => removeRow(row.id)}
                            disabled={labKitRows.length === 1}
                            className="text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded-lg hover:bg-red-500/10 transition-all"
                            title="Remove row"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Add Instructions */}
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-blue-400 mb-1">Pro Tip</p>
                  <p className="text-sm text-gray-300">
                    All kits will use the same details from Step 1. Only the accession number needs to be unique for each kit.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Review & Import */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center mr-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Ready to Import</h2>
                  <p className="text-gray-400">Review your lab kits and import them to the inventory</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.push('/lab-kits')}
                  className="px-6 py-3 text-gray-400 hover:text-white transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !selectedStudyId}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-lg hover:shadow-purple-500/25"
                >
                  {submitting && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>{submitting ? 'Importing...' : 'Import Lab Kits'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
