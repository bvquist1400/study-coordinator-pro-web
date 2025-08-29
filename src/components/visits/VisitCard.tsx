'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface VisitCardProps {
  visitId: string
  studyId: string
  visitName: string
  scheduledDate: string
  onClose: () => void
  onSave?: () => void
}

interface VisitData {
  id: string
  study_id: string
  visit_name: string
  scheduled_date: string
  completed_date?: string
  status: 'scheduled' | 'completed' | 'missed'
  
  // Lab Kit Accountability
  lab_kit_required?: boolean
  accession_number?: string
  airway_bill_number?: string
  lab_kit_shipped_date?: string
  
  // Drug Accountability
  drug_dispensing_required?: boolean
  previous_dispense_date?: string
  tablets_dispensed?: number
  tablets_returned?: number
  actual_start_date?: string
  
  // Local Labs
  local_labs_required?: boolean
  local_labs_completed?: boolean
  
  notes?: string
}

export default function VisitCard({ 
  visitId, 
  studyId, 
  visitName, 
  scheduledDate, 
  onClose, 
  onSave 
}: VisitCardProps) {
  const [visitData, setVisitData] = useState<VisitData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [drugCompliance, setDrugCompliance] = useState<number | null>(null)

  useEffect(() => {
    loadVisitData()
  }, [visitId])

  useEffect(() => {
    if (visitData?.tablets_dispensed && visitData?.tablets_returned) {
      calculateDrugCompliance()
    }
  }, [visitData?.tablets_dispensed, visitData?.tablets_returned, visitData?.previous_dispense_date, visitData?.actual_start_date])

  const loadVisitData = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_visits')
        .select('*')
        .eq('id', visitId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        setVisitData(data)
      } else {
        // Initialize new visit data
        setVisitData({
          id: visitId,
          study_id: studyId,
          visit_name: visitName,
          scheduled_date: scheduledDate,
          status: 'scheduled'
        })
      }
    } catch (error) {
      console.error('Error loading visit data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const calculateDrugCompliance = () => {
    if (!visitData?.tablets_dispensed || !visitData?.tablets_returned || !visitData?.previous_dispense_date) {
      return
    }

    const startDate = new Date(visitData.actual_start_date || visitData.previous_dispense_date)
    const endDate = new Date(visitData.scheduled_date)
    const daysBetween = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    
    const tabletsExpected = daysBetween // Assuming QD dosing - this should be dynamic based on study dosing frequency
    const tabletsActuallyTaken = visitData.tablets_dispensed - visitData.tablets_returned
    
    const compliance = Math.min(100, Math.max(0, (tabletsActuallyTaken / tabletsExpected) * 100))
    setDrugCompliance(Math.round(compliance * 100) / 100)
  }

  const handleInputChange = (field: keyof VisitData, value: any) => {
    if (!visitData) return
    
    setVisitData(prev => ({
      ...prev!,
      [field]: value
    }))
  }

  const handleSave = async () => {
    if (!visitData) return
    
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('subject_visits')
        .upsert(visitData)

      if (error) throw error

      onSave?.()
      onClose()
    } catch (error) {
      console.error('Error saving visit data:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-300 text-center">Loading visit...</p>
        </div>
      </div>
    )
  }

  if (!visitData) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-2xl w-full max-w-2xl my-8">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{visitName}</h2>
              <p className="text-gray-300">
                Scheduled: {new Date(scheduledDate).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* Visit Status */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Visit Status
              </label>
              <select
                value={visitData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
              </select>
            </div>

            {/* Lab Kit Section */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Lab Kit Accountability</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Accession Number
                  </label>
                  <input
                    type="text"
                    value={visitData.accession_number || ''}
                    onChange={(e) => handleInputChange('accession_number', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter accession number"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Airway Bill Number
                  </label>
                  <input
                    type="text"
                    value={visitData.airway_bill_number || ''}
                    onChange={(e) => handleInputChange('airway_bill_number', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter tracking number"
                  />
                </div>
              </div>
            </div>

            {/* Drug Accountability Section */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Drug Accountability</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Previous Dispense Date
                  </label>
                  <input
                    type="date"
                    value={visitData.previous_dispense_date || ''}
                    onChange={(e) => handleInputChange('previous_dispense_date', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Actual Start Date
                    <span className="text-xs text-gray-400 ml-2">(if different)</span>
                  </label>
                  <input
                    type="date"
                    value={visitData.actual_start_date || ''}
                    onChange={(e) => handleInputChange('actual_start_date', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tablets Dispensed
                  </label>
                  <input
                    type="number"
                    value={visitData.tablets_dispensed || ''}
                    onChange={(e) => handleInputChange('tablets_dispensed', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tablets Returned
                  </label>
                  <input
                    type="number"
                    value={visitData.tablets_returned || ''}
                    onChange={(e) => handleInputChange('tablets_returned', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Drug Compliance Display */}
              {drugCompliance !== null && (
                <div className="bg-gray-900/50 border border-gray-600 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-300">
                      Calculated Compliance:
                    </span>
                    <span className={`text-lg font-bold ${
                      drugCompliance >= 80 ? 'text-green-400' : 
                      drugCompliance >= 70 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {drugCompliance}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Local Labs Section */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Local Labs</h3>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={visitData.local_labs_completed || false}
                  onChange={(e) => handleInputChange('local_labs_completed', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-gray-300">Local labs completed</span>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={visitData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add visit notes..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 mt-8 pt-6 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Visit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}