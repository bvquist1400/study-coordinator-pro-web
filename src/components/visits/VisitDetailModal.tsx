'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { VisitSchedule } from '@/types/database'

interface VisitDetail {
  id: string
  study_id: string
  visit_name: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  is_within_window: boolean | null
  days_from_scheduled: number | null
  procedures_completed: string[]
  visit_schedule_id: string | null

  // Lab Kit Accountability
  lab_kit_required: boolean | null
  accession_number: string | null
  airway_bill_number: string | null
  lab_kit_shipped_date: string | null

  // Drug Accountability
  drug_dispensing_required: boolean | null
  previous_dispense_date: string | null
  tablets_dispensed: number | null
  tablets_returned: number | null
  actual_start_date: string | null

  // Local Labs
  local_labs_required: boolean | null
  local_labs_completed: boolean | null

  notes: string | null

  // Subject info
  subject_number: string
  subject_id: string
}

type VisitStatus = VisitDetail['status']

interface FormData {
  actual_start_date: string
  status: VisitStatus
  procedures_completed: string[]
  accession_number: string
  airway_bill_number: string
  lab_kit_shipped_date: string
  tablets_dispensed: string
  tablets_returned: string
  local_labs_completed: boolean
  notes: string
}

interface VisitDetailModalProps {
  visitId: string
  onClose: () => void
  onUpdate: () => void
}

type DispenseRow = { ip_id: string; dispensed: number }
type ReturnRow = { ip_id: string; returned: number }

type DrugComplianceRow = {
  subject_id: string
  user_id: string
  assessment_date: string
  dispensed_count: number
  returned_count: number
  expected_taken: number
  visit_id: string
  ip_id: string
  dispensing_date?: string | null
}

export default function VisitDetailModal({ visitId, onClose, onUpdate }: VisitDetailModalProps) {
  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const [dispenseRows, setDispenseRows] = useState<DispenseRow[]>([{ ip_id: '', dispensed: 0 }])
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([{ ip_id: '', returned: 0 }])

  // Autocomplete for lab kits
  const [availableLabKits, setAvailableLabKits] = useState<Array<{id: string; accession_number: string; kit_type?: string; expiration_date?: string}>>([])
  const [showAccessionDropdown, setShowAccessionDropdown] = useState(false)

  const [dosingFactor, setDosingFactor] = useState(1)
  const [dosingLabel, setDosingLabel] = useState('Once daily')

  const [formData, setFormData] = useState<FormData>({
    actual_start_date: '',
    status: 'scheduled',
    procedures_completed: [],
    accession_number: '',
    airway_bill_number: '',
    lab_kit_shipped_date: '',
    tablets_dispensed: '',
    tablets_returned: '',
    local_labs_completed: false,
    notes: ''
  })

  const [inferredRequirements, setInferredRequirements] = useState({
    lab_kit_required: false,
    drug_dispensing_required: false,
    local_labs_required: false
  })

  useEffect(() => {
    loadVisitDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

  const loadVisitDetail = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const response = await fetch('/api/subject-visits/' + visitId, {
        headers: { Authorization: 'Bearer ' + token }
      })

      if (response.ok) {
        const { visit } = await response.json()
        setVisit(visit)

        setFormData({
          actual_start_date: visit.actual_start_date?.split('T')[0] || '',
          status: visit.status as VisitStatus,
          procedures_completed: visit.procedures_completed || [],
          accession_number: visit.accession_number || '',
          airway_bill_number: visit.airway_bill_number || '',
          lab_kit_shipped_date: visit.lab_kit_shipped_date?.split('T')[0] || '',
          tablets_dispensed: visit.tablets_dispensed?.toString() || '',
          tablets_returned: visit.tablets_returned?.toString() || '',
          local_labs_completed: visit.local_labs_completed || false,
          notes: visit.notes || ''
        })

        // dosing frequency
        try {
          const { data: studyRow } = await supabase
            .from('studies')
            .select('dosing_frequency')
            .eq('id', visit.study_id)
            .single()
          const df = (studyRow?.dosing_frequency || 'QD') as string
          let factor = 1
          let label = 'Once daily'
          switch (df) {
            case 'QD': factor = 1; label = 'Once daily'; break
            case 'BID': factor = 2; label = 'Twice daily'; break
            case 'TID': factor = 3; label = 'Three times daily'; break
            case 'QID': factor = 4; label = 'Four times daily'; break
            case 'weekly': factor = 1 / 7; label = 'Weekly'; break
            default: factor = 1; label = df
          }
          setDosingFactor(factor)
          setDosingLabel(label)
        } catch {
          /* ignore */
        }

        // Load available lab kits for autocomplete
        try {
          const labKitsResponse = await fetch(`/api/lab-kits?studyId=${visit.study_id}&status=available`, {
            headers: { Authorization: 'Bearer ' + token }
          })
          if (labKitsResponse.ok) {
            const labKitsData = await labKitsResponse.json()
            setAvailableLabKits(labKitsData.labKits || [])
          }
        } catch (error) {
          console.warn('Failed to load lab kits for autocomplete:', error)
        }

        // infer required flags from visit schedule
        if (
          visit.visit_schedule_id &&
          (visit.lab_kit_required === null || visit.drug_dispensing_required === null || visit.local_labs_required === null)
        ) {
          try {
            const vsRes = await fetch('/api/visit-schedules?study_id=' + visit.study_id, {
              headers: { Authorization: 'Bearer ' + token }
            })
            if (vsRes.ok) {
              const { visitSchedules } = await vsRes.json()
              const vs = (visitSchedules as VisitSchedule[] | undefined)?.find(v => v.id === visit.visit_schedule_id)
              if (vs && Array.isArray(vs.procedures)) {
                const lower = vs.procedures.map((p: string) => p.toLowerCase())
                setInferredRequirements({
                  lab_kit_required: lower.includes('lab kit') || lower.includes('labkit'),
                  drug_dispensing_required: lower.includes('medication dispensing') || lower.includes('drug dispensing'),
                  local_labs_required: lower.includes('local labs') || lower.includes('local lab')
                })
              }
            }
          } catch {
            /* ignore */
          }
        }
      } else {
        const err = await response.json().catch(() => ({}))
        setLoadError(err.error || 'Failed to load visit (' + response.status + ')')
      }
    } catch (error) {
      console.error('Error loading visit detail:', error)
      setLoadError('Unexpected error loading visit details')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2200)
  }

  const computeDaysAndExpected = () => {
    if (!visit) return { days: 0, expectedBase: 0 }
    const startStr = (visit?.previous_dispense_date || formData.actual_start_date || '').toString()
    const endStr = (visit?.visit_date || '').toString()
    const msPerDay = 1000 * 60 * 60 * 24
    let days = 0
    if (startStr && endStr) {
      const start = new Date(startStr.split('T')[0])
      const end = new Date(endStr.split('T')[0])
      days = Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay))
    }
    const expectedBase = Math.max(0, Math.round(days * dosingFactor))
    return { days, expectedBase }
  }

  const copyComplianceSummary = () => {
    const { days, expectedBase } = computeDaysAndExpected()
    const lines = returnRows.map((r, i) => {
      const key = r.ip_id || 'Row ' + (i + 1)
      return `- ${key}: Expected ${expectedBase} (${days} days x ${dosingLabel}), Returned ${r.returned}`
    })
    const text = ['IP Compliance Summary', ...lines].join('\n')
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
      showToast('Compliance summary copied', 'success')
    } else {
      showToast('Copy not supported in this browser', 'error')
    }
  }

  const validateBottleRows = (): string[] => {
    const warnings: string[] = []
    dispenseRows.forEach((r, idx) => {
      if (r.dispensed > 0 && !r.ip_id.trim()) warnings.push(`Dispense row ${idx + 1}: IP ID required`)
      if (r.dispensed < 0) warnings.push(`Dispense row ${idx + 1}: Values cannot be negative`)
    })
    returnRows.forEach((r, idx) => {
      if (r.returned > 0 && !r.ip_id.trim()) warnings.push(`Return row ${idx + 1}: IP ID required`)
      if (r.returned < 0) warnings.push(`Return row ${idx + 1}: Values cannot be negative`)
    })
    return warnings
  }

  const upsertDrugComplianceForIP = async (assessmentDateISO: string) => {
    const meaningfulDispenses = dispenseRows.filter(r => r.ip_id && r.dispensed > 0)
    const meaningfulReturns = returnRows.filter(r => r.ip_id && r.returned > 0)
    if (!visit || (meaningfulDispenses.length === 0 && meaningfulReturns.length === 0)) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const subjectId = visit.subject_id
    const studyId = visit.study_id
    const visitDay = assessmentDateISO || (visit.visit_date || '')
    const msPerDay = 1000 * 60 * 60 * 24

    let factor = 1
    try {
      const { data: studyRow } = await supabase
        .from('studies')
        .select('dosing_frequency')
        .eq('id', studyId)
        .single()
      const df = (studyRow?.dosing_frequency || 'QD') as string
      switch (df) {
        case 'QD': factor = 1; break
        case 'BID': factor = 2; break
        case 'TID': factor = 3; break
        case 'QID': factor = 4; break
        case 'weekly': factor = 1 / 7; break
        default: factor = 1
      }
    } catch {
      /* ignore */
    }

    // Inserts for dispenses at this visit
    for (const b of meaningfulDispenses) {
      const payload: DrugComplianceRow = {
        subject_id: subjectId,
        user_id: user.id,
        assessment_date: visitDay,
        dispensed_count: b.dispensed,
        returned_count: 0,
        expected_taken: 0,
        visit_id: visitId,
        ip_id: b.ip_id.trim(),
        dispensing_date: visitDay
      }
      await supabase.from('drug_compliance').insert(payload)
    }

    // Updates for returns from prior visit
    for (const b of meaningfulReturns) {
      const ipId = b.ip_id.trim()
      const { data: existing } = await supabase
        .from('drug_compliance')
        .select('*')
        .eq('subject_id', subjectId)
        .eq('ip_id', ipId)
        .order('assessment_date', { ascending: false })
        .limit(1)

      if (existing && existing.length > 0) {
        const row = existing[0] as { id: string; dispensing_date?: string | null; assessment_date: string }
        const dispStr = row.dispensing_date || row.assessment_date
        const start = new Date(String(dispStr).split('T')[0])
        const end = new Date(String(visitDay).split('T')[0])
        const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay))
        const expected = Math.max(0, Math.round(days * factor))
        await supabase
          .from('drug_compliance')
          .update({
            returned_count: b.returned,
            assessment_date: visitDay,
            expected_taken: expected
          })
          .eq('id', row.id)
      }
    }
    showToast('IP compliance updated', 'success')
  }

  const handleSave = async () => {
    if (!visit) return
    try {
      setSaving(true)
      const warnings = validateBottleRows()
      if (warnings.length > 0) {
        showToast(warnings[0], 'error')
        setSaving(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const updateData = {
        actual_start_date: formData.actual_start_date || null,
        status: formData.status,
        procedures_completed: formData.procedures_completed,
        accession_number: formData.accession_number || null,
        airway_bill_number: formData.airway_bill_number || null,
        lab_kit_shipped_date: formData.lab_kit_shipped_date || null,
        tablets_dispensed: formData.tablets_dispensed ? parseInt(formData.tablets_dispensed) : null,
        tablets_returned: formData.tablets_returned ? parseInt(formData.tablets_returned) : null,
        local_labs_completed: formData.local_labs_completed,
        notes: formData.notes || null
      }

      const response = await fetch('/api/subject-visits/' + visitId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        setIsEditing(false)
        await loadVisitDetail()
        onUpdate()
      } else {
        const error = await response.json()
        alert('Error updating visit: ' + error.error)
      }
    } catch (error) {
      console.error('Error updating visit:', error)
      alert('Failed to update visit')
    } finally {
      setSaving(false)
    }
  }

  type FormDataValue = FormData[keyof FormData]
  const handleChange = (field: keyof FormData, value: FormDataValue) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Autocomplete functions for accession numbers
  const filteredLabKits = availableLabKits.filter(kit => 
    kit.accession_number.toLowerCase().includes((formData.accession_number || '').toLowerCase())
  )

  const handleAccessionNumberChange = (value: string) => {
    setFormData(prev => ({ ...prev, accession_number: value }))
    setShowAccessionDropdown(value.length > 0 && filteredLabKits.length > 0)
  }

  const handleAccessionSelect = (accessionNumber: string) => {
    setFormData(prev => ({ ...prev, accession_number: accessionNumber }))
    setShowAccessionDropdown(false)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const re = /(\d{4}-\d{2}-\d{2})/
    const match = String(dateString || '').match(re)
    const dt = match
      ? (() => {
          const [y, m, d] = match[1].split('-').map(Number)
          return new Date(y, (m || 1) - 1, d || 1)
        })()
      : new Date(dateString)
    if (isNaN(dt.getTime())) return '-'
    return dt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
          <div className="animate-pulse flex items-center space-x-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white">Loading visit details...</span>
          </div>
        </div>
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-lg w-full">
          <div className="p-6 relative">
            {toast ? (
              <div
                className={
                  'p-3 rounded-md mb-4 ' +
                  (toast.type === 'success'
                    ? 'bg-green-900/50 text-green-300 border border-green-600'
                    : toast.type === 'error'
                    ? 'bg-red-900/50 text-red-300 border border-red-600'
                    : 'bg-blue-900/50 text-blue-300 border border-blue-600')
                }
              >
                {toast.message}
              </div>
            ) : null}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Visit Details</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </button>
            </div>
            <div className="text-gray-300">{loadError || 'Visit could not be loaded.'}</div>
            <div className="mt-4 text-right">
              <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-[95vw] w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Visit Details</h2>
              <p className="text-gray-400 mt-1">
                {visit.subject_number} - {visit.visit_name}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Edit Visit
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              )}

              {/* Delete Visit */}
              <button
                onClick={async () => {
                  if (!confirm('Delete this visit? This action cannot be undone.')) return
                  try {
                    const { data: { session } } = await supabase.auth.getSession()
                    const token = session?.access_token
                    if (!token) return
                    const resp = await fetch('/api/subject-visits/' + visitId, {
                      method: 'DELETE',
                      headers: { Authorization: 'Bearer ' + token }
                    })
                    if (resp.ok) {
                      onUpdate()
                      showToast('Visit deleted', 'success')
                      onClose()
                    } else {
                      const r = await resp.json().catch(() => ({}))
                      alert('Failed to delete visit: ' + (r.error || resp.status))
                    }
                  } catch (e) {
                    console.error('Delete visit error:', e)
                    alert('Failed to delete visit')
                  }
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-medium transition-colors"
              >
                Delete Visit
              </button>

              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Visit Information */}
          <div className="space-y-6">
            <div className="bg-gray-700/30 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Visit Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Visit Date</label>
                  <p className="text-gray-100">{formatDate(visit.visit_date)}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                  {isEditing ? (
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value as VisitStatus)}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="missed">Missed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span
                        className={
                          'px-2 py-1 text-xs font-medium rounded-full ' +
                          (visit.status === 'completed'
                            ? visit.is_within_window
                              ? 'bg-green-900/50 text-green-300 border border-green-600'
                              : 'bg-yellow-900/50 text-yellow-300 border border-yellow-600'
                            : visit.status === 'scheduled'
                            ? 'bg-blue-900/50 text-blue-300 border border-blue-600'
                            : visit.status === 'missed'
                            ? 'bg-red-900/50 text-red-300 border border-red-600'
                            : 'bg-gray-900/50 text-gray-300 border border-gray-600')
                        }
                      >
                        {visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                      </span>
                      {visit.is_within_window === false && visit.status === 'completed' && (
                        <span className="text-sm text-yellow-400">(Outside Window)</span>
                      )}
                      {visit.days_from_scheduled !== null && (
                        <span className="text-sm text-gray-400">
                          ({visit.days_from_scheduled > 0 ? '+' : ''}
                          {visit.days_from_scheduled} days)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actual Start Date - for backfilling or when visit date differs from actual occurrence */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Actual Start Date 
                    <span className="text-gray-500 text-xs ml-1">(for backfilling past visits)</span>
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={formData.actual_start_date}
                      onChange={(e) => handleChange('actual_start_date', e.target.value)}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-100">
                      {visit.actual_start_date ? formatDate(visit.actual_start_date) : '-'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* GRID: Left + Right columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
            {/* LEFT: Lab Kit Accountability */}
            {(visit.lab_kit_required || inferredRequirements.lab_kit_required) && (
              <div className="bg-gray-700/30 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Lab Kit Accountability</h3>
                  <span className="text-xs px-2 py-1 rounded border border-blue-600 text-blue-300 bg-blue-900/30">
                    Required by schedule
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Accession Number</label>
                    {(isEditing || (visit.lab_kit_required || inferredRequirements.lab_kit_required)) ? (
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.accession_number}
                          onChange={(e) => handleAccessionNumberChange(e.target.value)}
                          onFocus={() => setShowAccessionDropdown(formData.accession_number.length > 0 && filteredLabKits.length > 0)}
                          onBlur={() => setTimeout(() => setShowAccessionDropdown(false), 200)} // Delay to allow click on dropdown
                          className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Type accession number..."
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {showAccessionDropdown && filteredLabKits.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {filteredLabKits.map((kit) => (
                              <button
                                key={kit.id}
                                onClick={() => handleAccessionSelect(kit.accession_number)}
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
                                      Exp: {new Date(kit.expiration_date).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-100">{visit.accession_number || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Airway Bill Number</label>
                    {(isEditing || (visit.lab_kit_required || inferredRequirements.lab_kit_required)) ? (
                      <input
                        type="text"
                        value={formData.airway_bill_number}
                        onChange={(e) => handleChange('airway_bill_number', e.target.value)}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-100">{visit.airway_bill_number || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Lab Kit Shipped Date</label>
                    {(isEditing || (visit.lab_kit_required || inferredRequirements.lab_kit_required)) ? (
                      <input
                        type="date"
                        value={formData.lab_kit_shipped_date}
                        onChange={(e) => handleChange('lab_kit_shipped_date', e.target.value)}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-100">
                        {visit.lab_kit_shipped_date ? formatDate(visit.lab_kit_shipped_date) : '-'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT: IP Accountability + Local Labs + Notes */}
            <div className="space-y-6">
              {/* IP Accountability */}
              <div className="bg-gray-700/30 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">IP Accountability</h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">IP Dispensed</label>
                      {isEditing ? (
                        <input
                          type="number"
                          value={formData.tablets_dispensed}
                          onChange={(e) => handleChange('tablets_dispensed', e.target.value)}
                          className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="text-gray-100">{visit.tablets_dispensed || '-'}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">IP Returned</label>
                      {isEditing ? (
                        <input
                          type="number"
                          value={formData.tablets_returned}
                          onChange={(e) => handleChange('tablets_returned', e.target.value)}
                          className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <p className="text-gray-100">{visit.tablets_returned || '-'}</p>
                      )}
                    </div>
                  </div>

                  {/* Multi-bottle IP rows */}
                  <div className="space-y-6">
                    {/* Dispense at this visit */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-md font-semibold text-gray-100">Dispense at this visit</h4>
                        <div className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            className="text-gray-300 hover:text-white"
                            onClick={() => setDispenseRows([{ ip_id: '', dispensed: 0 }])}
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            className="text-red-300 hover:text-red-200"
                            onClick={() => setDispenseRows([])}
                          >
                            Clear all
                          </button>
                        </div>
                      </div>
                      {dispenseRows.map((r, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-2">
                          <input
                            type="text"
                            value={r.ip_id}
                            onChange={(e) =>
                              setDispenseRows(prev => prev.map((x, i) => (i === idx ? { ...x, ip_id: e.target.value } : x)))
                            }
                            className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none"
                            placeholder="IP ID"
                          />
                          <input
                            type="number"
                            value={r.dispensed || ''}
                            onChange={(e) =>
                              setDispenseRows(prev =>
                                prev.map((x, i) => (i === idx ? { ...x, dispensed: parseInt(e.target.value) || 0 } : x))
                              )
                            }
                            className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none"
                            placeholder="Dispensed"
                          />
                          <div className="flex items-center">
                            <button
                              type="button"
                              className="ml-auto px-2 py-2 text-red-400 hover:text-red-300"
                              onClick={() => setDispenseRows(prev => prev.filter((_, i) => i !== idx))}
                              title="Remove row"
                            >
                              x
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-green-400 hover:text-green-300 text-sm"
                        onClick={() => setDispenseRows(prev => [...prev, { ip_id: '', dispensed: 0 }])}
                      >
                        + Add dispense row
                      </button>
                    </div>

                    {/* Returns from prior visit */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <h4 className="text-md font-semibold text-gray-100">Returns from prior visit</h4>
                          <span className="text-xs text-gray-500">Dosing: {dosingLabel}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            className="text-gray-300 hover:text-white"
                            onClick={() => setReturnRows([{ ip_id: '', returned: 0 }])}
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            className="text-red-300 hover:text-red-200"
                            onClick={() => setReturnRows([])}
                          >
                            Clear all
                          </button>
                          <button type="button" className="text-blue-300 hover:text-blue-200" onClick={copyComplianceSummary}>
                            Copy compliance summary
                          </button>
                        </div>
                      </div>

                      {returnRows.map((r, idx) => {
                        const startStr = (visit?.previous_dispense_date || formData.actual_start_date || '').toString()
                        const endStr = (visit?.visit_date || '').toString()
                        const msPerDay = 1000 * 60 * 60 * 24
                        let days = 0
                        let expected = 0
                        if (startStr && endStr) {
                          const start = new Date(startStr.split('T')[0])
                          const end = new Date(endStr.split('T')[0])
                          days = Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay))
                          expected = Math.max(0, Math.round(days * dosingFactor))
                        }
                        return (
                          <div key={idx} className="mb-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              <input
                                type="text"
                                value={r.ip_id}
                                onChange={(e) =>
                                  setReturnRows(prev => prev.map((x, i) => (i === idx ? { ...x, ip_id: e.target.value } : x)))
                                }
                                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none"
                                placeholder="IP ID"
                              />
                              <input
                                type="number"
                                value={r.returned || ''}
                                onChange={(e) =>
                                  setReturnRows(prev =>
                                    prev.map((x, i) => (i === idx ? { ...x, returned: parseInt(e.target.value) || 0 } : x))
                                  )
                                }
                                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none"
                                placeholder="Returned"
                              />
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  className="ml-auto px-2 py-2 text-red-400 hover:text-red-300"
                                  onClick={() => setReturnRows(prev => prev.filter((_, i) => i !== idx))}
                                  title="Remove row"
                                >
                                  x
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Expected = {days} days x {dosingLabel} = {expected}
                            </div>
                          </div>
                        )
                      })}
                      <button
                        type="button"
                        className="text-green-400 hover:text-green-300 text-sm"
                        onClick={() => setReturnRows(prev => [...prev, { ip_id: '', returned: 0 }])}
                      >
                        + Add return row
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Local Labs */}
              <div className="bg-gray-700/30 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Local Labs</h3>
                  {(visit.local_labs_required || inferredRequirements.local_labs_required) && (
                    <span className="text-xs px-2 py-1 rounded border border-blue-600 text-blue-300 bg-blue-900/30">
                      Required by schedule
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  {(visit.local_labs_required || inferredRequirements.local_labs_required) && (
                    <div className="flex items-center">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={formData.local_labs_completed}
                          onChange={(e) => handleChange('local_labs_completed', e.target.checked)}
                          className="mr-2 rounded"
                        />
                      ) : (
                        <div
                          className={
                            'w-4 h-4 mr-2 rounded border ' +
                            (visit.local_labs_completed ? 'bg-green-600 border-green-600' : 'border-gray-600')
                          }
                        >
                          {visit.local_labs_completed && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      )}
                      <span className="text-gray-300">Local labs completed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="bg-gray-700/30 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
                {isEditing ? (
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    rows={4}
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
                    placeholder="Add notes about this visit..."
                  />
                ) : (
                  <p className="text-gray-300 whitespace-pre-wrap">{visit.notes || 'No notes recorded'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-8 pt-6 border-t border-gray-700">
            <div className="flex items-center">
              <div className="flex-1">
                <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
                  Close
                </button>
              </div>
              <div className="flex-1 flex justify-center">
                <button
                  onClick={async () => {
                    if (!visit) return
                    try {
                      setSaving(true)
                      const { data: { session } } = await supabase.auth.getSession()
                      const token = session?.access_token
                      if (!token) return
                      const body = {
                        status: 'completed' as VisitStatus,
                        actual_start_date: formData.actual_start_date || visit.visit_date, // Use visit date if no actual date set
                        accession_number: formData.accession_number || null,
                        airway_bill_number: formData.airway_bill_number || null,
                        lab_kit_shipped_date: formData.lab_kit_shipped_date || null,
                        tablets_dispensed: formData.tablets_dispensed ? parseInt(formData.tablets_dispensed) : null,
                        tablets_returned: formData.tablets_returned ? parseInt(formData.tablets_returned) : null,
                        local_labs_completed: formData.local_labs_completed
                      }
                      const resp = await fetch('/api/subject-visits/' + visitId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                        body: JSON.stringify(body)
                      })
                      if (resp.ok) {
                        try {
                          await upsertDrugComplianceForIP(visit.visit_date)
                        } catch (e) {
                          console.warn('Bottle compliance upsert failed:', e)
                          showToast('IP compliance update failed', 'error')
                        }
                        onUpdate()
                        showToast('Visit completed', 'success')
                        onClose()
                      } else {
                        const r = await resp.json().catch(() => ({}))
                        alert('Failed to complete visit: ' + (r.error || resp.status))
                      }
                    } catch (e) {
                      console.error('Complete visit error:', e)
                      alert('Failed to complete visit')
                    } finally {
                      setSaving(false)
                    }
                  }}
                  className="px-6 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg font-semibold"
                >
                  Complete Visit
                </button>
              </div>
              <div className="flex-1 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
