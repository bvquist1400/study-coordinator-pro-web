'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { todayLocalISODate } from '@/lib/date-utils'

interface CreateShipmentModalProps {
  studyId: string
  onClose: () => void
  onSuccess: () => void
}

interface LabKit {
  id: string
  accession_number: string
  kit_type: string | null
  status: string
  received_date: string | null
  expiration_date: string | null
  visit_schedules?: {
    visit_name: string
    visit_number: number
  }
  lab_kit_usage?: Array<{
    subject_visits: {
      id: string
      visit_date: string
      subjects: {
        subject_number: string
      }
    }
  }>
}

interface ExternalLabKit {
  id: string
  accession_number: string
  kit_type: string
  study_name: string
  subject_number: string
  notes: string
}

export default function CreateShipmentModal({ studyId, onClose, onSuccess }: CreateShipmentModalProps) {
  const [availableKits, setAvailableKits] = useState<LabKit[]>([])
  const [selectedKitIds, setSelectedKitIds] = useState<Set<string>>(new Set())
  const [externalKits, setExternalKits] = useState<ExternalLabKit[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal')
  
  // Form fields
  const [airwayBillNumber, setAirwayBillNumber] = useState('')
  const [carrier, setCarrier] = useState('fedex')
  const [shippedDate, setShippedDate] = useState(todayLocalISODate())
  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  
  // External kit form
  const [newExternalKit, setNewExternalKit] = useState({
    accession_number: '',
    kit_type: '',
    study_name: '',
    subject_number: '',
    notes: ''
  })

  const loadAvailableKits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/lab-kits/pending-shipment?studyId=${studyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setAvailableKits(data.labKits || [])
      } else {
        console.error('Failed loading available kits:', response.status)
        setAvailableKits([])
      }
    } catch (error) {
      console.error('Error loading available kits:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadAvailableKits()
  }, [loadAvailableKits])

  const handleKitSelection = (kitId: string, selected: boolean) => {
    const newSelection = new Set(selectedKitIds)
    if (selected) {
      newSelection.add(kitId)
    } else {
      newSelection.delete(kitId)
    }
    setSelectedKitIds(newSelection)
  }

  const handleSelectAll = () => {
    if (selectedKitIds.size === filteredKits.length) {
      setSelectedKitIds(new Set())
    } else {
      setSelectedKitIds(new Set(filteredKits.map(kit => kit.id)))
    }
  }

  const addExternalKit = () => {
    if (!newExternalKit.accession_number.trim()) {
      setErrorMsg('Accession number is required for external kits')
      return
    }

    const existingAccessions = [
      ...availableKits.map(k => k.accession_number),
      ...externalKits.map(k => k.accession_number)
    ]

    if (existingAccessions.includes(newExternalKit.accession_number.trim())) {
      setErrorMsg('Accession number already exists')
      return
    }

    const externalKit: ExternalLabKit = {
      id: `external_${Date.now()}`,
      accession_number: newExternalKit.accession_number.trim(),
      kit_type: newExternalKit.kit_type.trim() || 'External Kit',
      study_name: newExternalKit.study_name.trim() || 'External Study',
      subject_number: newExternalKit.subject_number.trim(),
      notes: newExternalKit.notes.trim()
    }

    setExternalKits(prev => [...prev, externalKit])
    setSelectedKitIds(prev => new Set([...prev, externalKit.id]))
    setNewExternalKit({
      accession_number: '',
      kit_type: '',
      study_name: '',
      subject_number: '',
      notes: ''
    })
    setErrorMsg(null)
  }

  const removeExternalKit = (id: string) => {
    setExternalKits(prev => prev.filter(kit => kit.id !== id))
    setSelectedKitIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }

  const filteredKits = availableKits.filter(kit =>
    kit.accession_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    kit.kit_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    kit.lab_kit_usage?.[0]?.subject_visits?.subjects?.subject_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSubmit = async () => {
    if (selectedKitIds.size === 0) {
      setErrorMsg('Please select at least one lab kit')
      return
    }

    if (!airwayBillNumber.trim()) {
      setErrorMsg('Airway bill number is required')
      return
    }

    try {
      setSubmitting(true)
      setErrorMsg(null)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          labKitIds: Array.from(selectedKitIds).filter(id => !id.startsWith('external_')),
          externalKits: externalKits.filter(kit => selectedKitIds.has(kit.id)),
          airwayBillNumber: airwayBillNumber.trim(),
          carrier,
          shippedDate: shippedDate || null,
          estimatedDelivery: estimatedDelivery || null,
          notes: notes.trim() || null,
          studyId
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.warn('Shipment created:', result)
        onSuccess()
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to create shipment' }))
        setErrorMsg(error.error)
      }
    } catch (error) {
      console.error('Error creating shipment:', error)
      setErrorMsg('Failed to create shipment')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full"
    
    switch (status) {
      case 'pending_shipment':
        return `${baseClasses} bg-orange-900/50 text-orange-300 border border-orange-600`
      case 'used':
        return `${baseClasses} bg-purple-900/50 text-purple-300 border border-purple-600`
      default:
        return `${baseClasses} bg-gray-900/50 text-gray-300 border border-gray-600`
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Create Shipment</h2>
            <p className="text-gray-400 mt-1">Select lab kits and enter shipping details</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Shipping Details */}
          <div className="bg-gray-700/30 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Shipping Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Airway Bill Number *
                </label>
                <input
                  type="text"
                  value={airwayBillNumber}
                  onChange={(e) => setAirwayBillNumber(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter tracking number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Carrier
                </label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="fedex">FedEx</option>
                  <option value="ups">UPS</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Shipped Date
                </label>
                <input
                  type="date"
                  value={shippedDate}
                  onChange={(e) => setShippedDate(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Estimated Delivery
                </label>
                <input
                  type="date"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional shipping notes"
              />
            </div>
          </div>

          {/* Lab Kit Selection */}
          <div className="bg-gray-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Select Lab Kits ({selectedKitIds.size} selected)
              </h3>
              {activeTab === 'internal' && (
                <input
                  type="text"
                  placeholder="Search kits..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-gray-800/50 rounded-lg p-1 mb-6">
              <button
                onClick={() => setActiveTab('internal')}
                className={`flex-1 px-4 py-2 text-sm rounded-md transition-colors ${
                  activeTab === 'internal'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Built Studies ({availableKits.length})
              </button>
              <button
                onClick={() => setActiveTab('external')}
                className={`flex-1 px-4 py-2 text-sm rounded-md transition-colors ${
                  activeTab === 'external'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Additional Studies ({externalKits.length})
              </button>
            </div>

            {/* Built Studies Tab */
            {activeTab === 'internal' && (
              <>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-3 text-gray-300">Loading available kits...</span>
                  </div>
                ) : filteredKits.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>No lab kits available for shipping</p>
                    <p className="text-sm mt-1">Lab kits must be marked as &quot;used&quot; or &quot;pending shipment&quot;</p>
                  </div>
                ) : (
              <>
                <div className="mb-4">
                  <button
                    onClick={handleSelectAll}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    {selectedKitIds.size === filteredKits.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                
                <div className="max-h-64 overflow-y-auto border border-gray-600 rounded-lg">
                  <table className="w-full">
                    <thead className="bg-gray-700/50 sticky top-0">
                      <tr>
                        <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4 w-12">
                          <input
                            type="checkbox"
                            checked={selectedKitIds.size === filteredKits.length && filteredKits.length > 0}
                            onChange={handleSelectAll}
                            className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Accession #</th>
                        <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Kit Type</th>
                        <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Status</th>
                        <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Subject</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredKits.map((kit) => (
                        <tr key={kit.id} className="border-t border-gray-700 hover:bg-gray-700/25">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedKitIds.has(kit.id)}
                              onChange={(e) => handleKitSelection(kit.id, e.target.checked)}
                              className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-3 px-4 text-gray-100">{kit.accession_number}</td>
                          <td className="py-3 px-4 text-gray-300">{kit.kit_type || '-'}</td>
                          <td className="py-3 px-4">
                            <span className={getStatusBadge(kit.status)}>
                              {kit.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {kit.lab_kit_usage?.[0]?.subject_visits?.subjects?.subject_number || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </>
            )}

            {/* Additional Studies Tab */
            {activeTab === 'external' && (
              <div className="space-y-6">
                {/* Add External Kit Form */}
                <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-600">
                  <h4 className="text-md font-semibold text-white mb-4">Add Lab Kit from Additional Study</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Accession Number *
                      </label>
                      <input
                        type="text"
                        value={newExternalKit.accession_number}
                        onChange={(e) => setNewExternalKit(prev => ({ ...prev, accession_number: e.target.value }))}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., EXT-001, ONCO-2024-001"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Kit Type
                      </label>
                      <input
                        type="text"
                        value={newExternalKit.kit_type}
                        onChange={(e) => setNewExternalKit(prev => ({ ...prev, kit_type: e.target.value }))}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Blood Sample, Tissue Biopsy"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Study Name
                      </label>
                      <input
                        type="text"
                        value={newExternalKit.study_name}
                        onChange={(e) => setNewExternalKit(prev => ({ ...prev, study_name: e.target.value }))}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Oncology Trial ABC-123"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Subject Number
                      </label>
                      <input
                        type="text"
                        value={newExternalKit.subject_number}
                        onChange={(e) => setNewExternalKit(prev => ({ ...prev, subject_number: e.target.value }))}
                        className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Subject-001"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={newExternalKit.notes}
                      onChange={(e) => setNewExternalKit(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional notes about this kit"
                    />
                  </div>

                  <button
                    onClick={addExternalKit}
                    disabled={!newExternalKit.accession_number.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add External Kit</span>
                  </button>
                </div>

                {/* External Kits List */}
                {externalKits.length > 0 && (
                  <div className="border border-gray-600 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-700/50">
                        <tr>
                          <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4 w-12">
                            <input
                              type="checkbox"
                              checked={externalKits.every(kit => selectedKitIds.has(kit.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedKitIds(prev => new Set([...prev, ...externalKits.map(kit => kit.id)]))
                                } else {
                                  setSelectedKitIds(prev => {
                                    const newSet = new Set(prev)
                                    externalKits.forEach(kit => newSet.delete(kit.id))
                                    return newSet
                                  })
                                }
                              }}
                              className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Accession #</th>
                          <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Kit Type</th>
                          <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Study</th>
                          <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Subject</th>
                          <th className="text-left text-sm font-semibold text-gray-300 py-3 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {externalKits.map((kit) => (
                          <tr key={kit.id} className="border-t border-gray-700 hover:bg-gray-700/25">
                            <td className="py-3 px-4">
                              <input
                                type="checkbox"
                                checked={selectedKitIds.has(kit.id)}
                                onChange={(e) => handleKitSelection(kit.id, e.target.checked)}
                                className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-3 px-4 text-gray-100 font-medium">{kit.accession_number}</td>
                            <td className="py-3 px-4 text-gray-300">{kit.kit_type}</td>
                            <td className="py-3 px-4 text-gray-300">{kit.study_name}</td>
                            <td className="py-3 px-4 text-gray-300">{kit.subject_number || '-'}</td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => removeExternalKit(kit.id)}
                                className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                                title="Remove kit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {externalKits.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p>No additional lab kits added yet</p>
                    <p className="text-sm mt-1">Use the form above to add lab kits from additional studies</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedKitIds.size === 0 || !airwayBillNumber.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {submitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            <span>{submitting ? 'Creating...' : 'Create Shipment'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}