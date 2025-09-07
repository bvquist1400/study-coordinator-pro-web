'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'
import MultiBottleEntry, { type BottleEntry } from './MultiBottleEntry'

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
  lab_kit_shipped_date: string | null

  // Drug Accountability - Legacy fields for backward compatibility
  drug_dispensing_required: boolean | null
  ip_start_date: string | null
  ip_last_dose_date: string | null
  ip_dispensed: number | null
  ip_returned: number | null
  ip_id: string | null
  return_ip_id: string | null

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
  status: VisitStatus
  procedures_completed: string[]
  accession_number: string
  lab_kit_shipped_date: string
  dispensed_bottles: BottleEntry[]
  returned_bottles: BottleEntry[]
  local_labs_completed: boolean
  notes: string
  period_last_dose_date: string
}

interface VisitDetailModalProps {
  visitId: string
  onClose: () => void
  onUpdate: () => void
}

interface _DrugComplianceRow {
  subject_id: string
  user_id: string
  assessment_date: string
  dispensed_count: number
  returned_count: number
  expected_taken: number
  visit_id: string
  ip_id: string
  dispensing_date?: string | null
  ip_last_dose_date?: string | null
}

export default function VisitDetailModal({ visitId, onClose, onUpdate }: VisitDetailModalProps) {
  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [availableLabKits, setAvailableLabKits] = useState<Array<{ id: string; accession_number: string; kit_type: string; expiration_date: string }>>([])
  const [showAccessionDropdown, setShowAccessionDropdown] = useState(false)
  const [_dosingFactor, _setDosingFactor] = useState(1)

  const [formData, setFormData] = useState<FormData>({
    status: 'scheduled',
    procedures_completed: [],
    accession_number: '',
    lab_kit_shipped_date: '',
    dispensed_bottles: [],
    returned_bottles: [],
    local_labs_completed: false,
    notes: '',
    period_last_dose_date: ''
  })

  const [inferredRequirements, setInferredRequirements] = useState({
    lab_kit_required: false,
    drug_dispensing_required: false,
    local_labs_required: false
  })

  const loadVisit = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        console.error('No session token')
        return
      }

      const response = await fetch(`/api/subject-visits/${visitId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })

      if (response.ok) {
        const { visit } = await response.json()
        setVisit(visit)

        // Convert single bottle data to multi-bottle format for backward compatibility
        const dispensedBottles: BottleEntry[] = []
        const returnedBottles: BottleEntry[] = []

        // If there's existing single bottle data, convert it to multi-bottle format
        if (visit.ip_dispensed && visit.ip_dispensed > 0 && visit.ip_id) {
          dispensedBottles.push({
            id: 'existing-dispensed',
            ip_id: visit.ip_id,
            count: visit.ip_dispensed,
            start_date: visit.ip_start_date?.split('T')[0] || ''
          })
        }

        if (visit.ip_returned && visit.ip_returned > 0 && visit.return_ip_id) {
          returnedBottles.push({
            id: 'existing-returned',
            ip_id: visit.return_ip_id,
            count: visit.ip_returned,
            last_dose_date: visit.ip_last_dose_date?.split('T')[0] || ''
          })
        }

        setFormData({
          status: visit.status as VisitStatus,
          procedures_completed: visit.procedures_completed || [],
          accession_number: visit.accession_number || '',
          lab_kit_shipped_date: visit.lab_kit_shipped_date?.split('T')[0] || '',
          dispensed_bottles: dispensedBottles,
          returned_bottles: returnedBottles,
          local_labs_completed: visit.local_labs_completed || false,
          notes: visit.notes || '',
          period_last_dose_date: visit.ip_last_dose_date?.split('T')[0] || ''
        })

        // Infer requirements from visit name
        if (visit.visit_name) {
          const visitName = visit.visit_name.toLowerCase()
          setInferredRequirements({
            lab_kit_required: visitName.includes('lab') || visitName.includes('sample'),
            drug_dispensing_required: visitName.includes('dispensing') || visitName.includes('medication'),
            local_labs_required: visitName.includes('local lab')
          })
        }
      }
    } catch (error) {
      console.error('Error loading visit:', error)
    } finally {
      setLoading(false)
    }
  }, [visitId])

  useEffect(() => {
    loadVisit()
  }, [loadVisit])

  // Pre-populate candidate returns from previous visit via API (bypasses client RLS issues)
  useEffect(() => {
    const prefillReturns = async () => {
      if (!visit || formData.returned_bottles.length > 0) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const resp = await fetch(`/api/subject-visits/${visit.id}/prefill-returns`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        if (!resp.ok) return
        const data = await resp.json()
        const candidates = (data?.candidates || []) as Array<{ ip_id: string; suggested_return_count?: number }>
        if (candidates.length === 0) return
        const returnedBottles: BottleEntry[] = candidates.map((c, idx) => ({
          id: `prefill-${idx}`,
          ip_id: c.ip_id,
          count: c.suggested_return_count ?? 0,
          last_dose_date: ''
        }))
        setFormData(prevState => ({ ...prevState, returned_bottles: returnedBottles }))
      } catch (e) {
        console.error('Prefill returns error:', e)
      }
    }
    prefillReturns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit])

  // Load available lab kits for autocomplete
  useEffect(() => {
    const loadLabKits = async () => {
      if (!visit?.study_id) return

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const response = await fetch(`/api/lab-kits?studyId=${visit.study_id}&status=available`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })

        if (response.ok) {
          const { labKits } = await response.json()
          setAvailableLabKits(labKits || [])
        }
      } catch (error) {
        console.error('Error loading lab kits:', error)
      }
    }

    loadLabKits()
  }, [visit?.study_id])

  // Form validation
  const validateForm = () => {
    const warnings: string[] = []

    // Validate dispensed bottles
    formData.dispensed_bottles.forEach((bottle, index) => {
      if (!bottle.ip_id.trim()) {
        warnings.push(`Dispensed bottle ${index + 1}: IP ID is required`)
      }
      if (bottle.count <= 0) {
        warnings.push(`Dispensed bottle ${index + 1}: Count must be greater than 0`)
      }
      if (!bottle.start_date) {
        warnings.push(`Dispensed bottle ${index + 1}: Start date is required`)
      }
    })

    // Validate returned bottles
    formData.returned_bottles.forEach((bottle, index) => {
      if (!bottle.ip_id.trim()) {
        warnings.push(`Returned bottle ${index + 1}: IP ID is required`)
      }
      if (bottle.count <= 0) {
        warnings.push(`Returned bottle ${index + 1}: Count must be greater than 0`)
      }
      if (!bottle.last_dose_date && !formData.period_last_dose_date) {
        warnings.push(`Returned bottle ${index + 1}: Last dose date is required (or set the period last dose date above) `)
      }
    })

    // Lab kit validation
    if (formData.accession_number && !availableLabKits.some(kit => kit.accession_number === formData.accession_number)) {
      warnings.push('Lab kit with this accession number not found or not available')
    }

    return warnings
  }

  // Send multi-bottle data to API endpoint instead of direct database insertion
  const saveMultiBottleCompliance = async (token: string) => {
    // Fill defaults for dates when missing
    const returnedWithPeriod = formData.returned_bottles.map(b => ({
      ...b,
      last_dose_date: b.last_dose_date || formData.period_last_dose_date || ''
    }))

    const defaultVisitDate = visit?.visit_date?.split('T')[0] || ''
    const dispensedWithDefaults = formData.dispensed_bottles.map(b => ({
      ...b,
      start_date: b.start_date || defaultVisitDate
    }))

    // Send multi-bottle data to the existing IP accountability API
    const multiBottleData = {
      dispensed_bottles: dispensedWithDefaults,
      returned_bottles: returnedWithPeriod,
      period_last_dose_date: formData.period_last_dose_date || undefined
    }

    const response = await fetch(`/api/subject-visits/${visitId}/ip-accountability`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(multiBottleData)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to save IP accountability data')
    }
  }

  const handleSave = async () => {
    const warnings = validateForm()
    if (warnings.length > 0) {
      alert('Please fix the following issues:\n\n' + warnings.join('\n'))
      return
    }

    try {
      setSaving(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Save multi-bottle drug compliance data via API
      if (formData.dispensed_bottles.length > 0 || formData.returned_bottles.length > 0) {
        await saveMultiBottleCompliance(session.access_token)
      }

      // Update lab kit status if accession number is provided
      if (formData.accession_number && formData.status === 'completed') {
        await updateLabKitStatus(formData.accession_number, 'pending_shipment', session.access_token)
      }

      // Update visit record with multi-bottle summary (for backward compatibility)
      const updatePayload = {
        status: formData.status,
        procedures_completed: formData.procedures_completed,
        accession_number: formData.accession_number || null,
        lab_kit_shipped_date: formData.lab_kit_shipped_date || null,
        local_labs_completed: formData.local_labs_completed,
        notes: formData.notes || null,
        // Legacy fields - use first bottle for backward compatibility
        ip_dispensed: formData.dispensed_bottles[0]?.count || null,
        ip_returned: formData.returned_bottles[0]?.count || null,
        ip_id: formData.dispensed_bottles[0]?.ip_id || null,
        return_ip_id: formData.returned_bottles[0]?.ip_id || null,
        ip_start_date: formData.dispensed_bottles[0]?.start_date || null,
        ip_last_dose_date: formData.returned_bottles[0]?.last_dose_date || null
      }

      const response = await fetch(`/api/subject-visits/${visitId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(updatePayload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save visit')
      }

      onUpdate()
      setIsEditing(false)
      await loadVisit() // Reload to get updated data
      
    } catch (error) {
      console.error('Error saving visit:', error)
      alert('Failed to save visit: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // Helper function to update lab kit status
  const updateLabKitStatus = async (accessionNumber: string, status: string, token: string) => {
    const availableKit = availableLabKits.find(kit => kit.accession_number === accessionNumber)
    if (!availableKit) {
      throw new Error('Lab kit not found')
    }

    const response = await fetch(`/api/lab-kits/${availableKit.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    })

    if (!response.ok) {
      throw new Error('Failed to update lab kit status')
    }
  }

  const handleChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Autocomplete functions
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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-300 mt-2">Loading visit details...</p>
        </div>
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 p-6 rounded-lg">
          <p className="text-red-400">Failed to load visit details</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-600 text-white rounded">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">{visit.visit_name}</h2>
            <p className="text-gray-400">Subject {visit.subject_number} • {formatDateUTC(visit.visit_date)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Visit Status */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Visit Status</label>
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
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  visit.status === 'completed' ? 'bg-green-900/50 text-green-300 border border-green-600/50' :
                  visit.status === 'scheduled' ? 'bg-blue-900/50 text-blue-300 border border-blue-600/50' :
                  visit.status === 'missed' ? 'bg-red-900/50 text-red-300 border border-red-600/50' :
                  'bg-gray-900/50 text-gray-300 border border-gray-600/50'
                }`}>
                  {visit.status}
                </span>
              </div>
            )}
          </div>

          {/* Lab Kit Section */}
          {(inferredRequirements.lab_kit_required || visit.lab_kit_required) && (
            <div className="bg-gray-700/30 rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-semibold text-white">Lab Kit Accountability</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Accession Number</label>
                  {isEditing ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.accession_number}
                        onChange={(e) => handleAccessionNumberChange(e.target.value)}
                        onFocus={() => setShowAccessionDropdown(formData.accession_number.length > 0 && filteredLabKits.length > 0)}
                        onBlur={() => setTimeout(() => setShowAccessionDropdown(false), 200)}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Search or enter accession number"
                      />
                      {showAccessionDropdown && (
                        <div className="absolute top-full left-0 right-0 bg-gray-700 border border-gray-600 rounded-lg mt-1 max-h-40 overflow-y-auto z-10">
                          {filteredLabKits.map(kit => (
                            <button
                              key={kit.id}
                              type="button"
                              onClick={() => handleAccessionSelect(kit.accession_number)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-600 text-gray-100 text-sm border-b border-gray-600 last:border-b-0"
                            >
                              <div className="font-mono">{kit.accession_number}</div>
                              <div className="text-xs text-gray-400">{kit.kit_type} • Expires: {formatDateUTC(kit.expiration_date)}</div>
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
                  <label className="block text-sm font-medium text-gray-300 mb-1">Shipped Date</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={formData.lab_kit_shipped_date}
                      onChange={(e) => handleChange('lab_kit_shipped_date', e.target.value)}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-100">{visit.lab_kit_shipped_date ? formatDateUTC(visit.lab_kit_shipped_date) : '-'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Multi-Bottle Drug Accountability Section (always available for multi-drug support) */}
          {(() => {
            const ipSectionRequired = Boolean(inferredRequirements.drug_dispensing_required || visit.drug_dispensing_required)
            return (
              <div className="bg-gray-700/30 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Investigational Product Accountability</h3>
                  {!ipSectionRequired && (
                    <span className="text-xs text-gray-400">Optional for this visit</span>
                  )}
                </div>

                {/* Period-level last dose date for returns */}
                {isEditing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Return period last dose date</label>
                    <input
                      type="date"
                      value={formData.period_last_dose_date}
                      onChange={(e) => handleChange('period_last_dose_date', e.target.value)}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Applies to returned bottles without a date.</p>
                  </div>
                )}

                {/* Dispensed Bottles */}
                <div>
                  <MultiBottleEntry
                    bottles={formData.dispensed_bottles}
                    onChange={(bottles) => handleChange('dispensed_bottles', bottles)}
                    type="dispensing"
                    disabled={!isEditing}
                    defaultStartDate={visit.visit_date?.split('T')[0] || ''}
                  />
                </div>

                {/* Returned Bottles */}
                <div className="mt-6">
                  <MultiBottleEntry
                    bottles={formData.returned_bottles}
                    onChange={(bottles) => handleChange('returned_bottles', bottles)}
                    type="returns"
                    disabled={!isEditing}
                    defaultLastDoseDate={formData.period_last_dose_date}
                  />
                </div>
              </div>
            )
          })()}

          {/* Local Labs */}
          {(inferredRequirements.local_labs_required || visit.local_labs_required) && (
            <div className="bg-gray-700/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Local Labs</h3>
              <div className="flex items-center space-x-2">
                {isEditing ? (
                  <input
                    type="checkbox"
                    checked={formData.local_labs_completed}
                    onChange={(e) => handleChange('local_labs_completed', e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                ) : (
                  <div className={`w-4 h-4 rounded ${visit.local_labs_completed ? 'bg-green-600' : 'bg-gray-600'}`} />
                )}
                <label className="text-gray-300">Local labs completed</label>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
            {isEditing ? (
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Visit notes..."
              />
            ) : (
              <p className="text-gray-100">{visit.notes || '-'}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Close
          </button>
          
          <div className="flex items-center space-x-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Edit Visit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
