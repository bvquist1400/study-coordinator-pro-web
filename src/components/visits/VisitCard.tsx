'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { 
  calculateDrugCompliance as calcDrugCompliance, 
  calculateVisitCompliance as calcVisitCompliance,
  ComplianceResult,
  DrugComplianceData,
  VisitComplianceData 
} from '@/lib/compliance-calculator'
import ComplianceWidget from '@/components/compliance/ComplianceWidget'
import { formatDateUTC } from '@/lib/date-utils'

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
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed'
  
  // Lab Kit Accountability
  lab_kit_required?: boolean
  accession_number?: string
  airway_bill_number?: string
  lab_kit_shipped_date?: string
  
  // Drug Accountability
  previous_dispense_date?: string
  IP_dispensed?: number
  IP_returned?: number
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
  const [drugCompliance, setDrugCompliance] = useState<ComplianceResult | null>(null)
  const [visitCompliance, setVisitCompliance] = useState<ComplianceResult | null>(null)
  
  // Multi-bottle IP rows for accountability
  type BottleRow = { ip_id: string; dispensed: number; returned: number }
  const [bottles, setBottles] = useState<BottleRow[]>([
    { ip_id: '', dispensed: 0, returned: 0 }
  ])

  useEffect(() => {
    loadVisitData()
  }, [visitId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visitData) {
      calculateCompliances()
    }
  }, [visitData]) // eslint-disable-line react-hooks/exhaustive-deps

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
        setVisitData(data as unknown as VisitData)
      } else {
        // Initialize new visit data
        setVisitData({
          id: visitId,
          study_id: studyId,
          visit_name: visitName,
          visit_date: scheduledDate,
          status: 'scheduled'
        })
      }
    } catch (error) {
      console.error('Error loading visit data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const calculateCompliances = () => {
    if (!visitData) return

    // Calculate drug compliance
    if (visitData.IP_dispensed && visitData.previous_dispense_date) {
      const drugData: DrugComplianceData = {
        tabletsDispensed: visitData.IP_dispensed,
        tabletsReturned: visitData.IP_returned || 0,
        dispensingDate: new Date(visitData.previous_dispense_date),
        expectedReturnDate: new Date(scheduledDate),
        actualReturnDate: undefined,
        dosingFrequency: 1, // Default to QD - could be made dynamic based on study
        studyDrug: 'Study Medication'
      }

      const drugResult = calcDrugCompliance(drugData)
      setDrugCompliance(drugResult)
    }

    // Calculate visit compliance
    const visitData_: VisitComplianceData = {
      scheduledDate: new Date(scheduledDate),
      actualDate: undefined,
      visitWindow: 7, // Default visit window - could be made dynamic based on study
      visitName: visitName,
      status: visitData.status
    }

    const visitResult = calcVisitCompliance(visitData_)
    setVisitCompliance(visitResult)
  }

  const handleInputChange = (field: keyof VisitData, value: string | number | boolean) => {
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
      const { data: saved, error } = await supabase
        .from('subject_visits')
        .upsert(visitData as unknown as never)
        .select()
        .single()

      if (error) throw error

      // Create/update drug_compliance per bottle row
      const meaningful = bottles.filter(b => (b.ip_id && (b.dispensed > 0 || b.returned > 0)))
      if (meaningful.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const subjectId = (saved as { subject_id?: string })?.subject_id || ''
          const visitDay = visitData.visit_date || scheduledDate
          const msPerDay = 1000 * 60 * 60 * 24
          // Load dosing frequency for expected taken multiplier
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
              case 'weekly': factor = 1/7; break
              default: factor = 1
            }
          } catch { /* ignore */ }
          for (const b of meaningful) {
            const ipId = b.ip_id.trim()
            if (b.dispensed > 0) {
              await supabase
                .from('drug_compliance')
                .insert({
                  subject_id: subjectId,
                  user_id: user.id,
                  assessment_date: visitDay,
                  dispensed_count: b.dispensed,
                  returned_count: 0,
                  expected_taken: 0,
                  visit_id: visitId,
                  ip_id: ipId,
                  dispensing_date: visitDay
                } as unknown as never)
            }
            if (b.returned > 0) {
              const { data: existing } = await supabase
                .from('drug_compliance')
                .select('*')
                .eq('subject_id', subjectId)
                .eq('ip_id', ipId)
                .order('assessment_date', { ascending: false })
                .limit(1)
              if (existing && existing.length > 0) {
                const row = existing[0]
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
                  } as unknown as never)
                  .eq('id', row.id)
              }
            }
          }
        }
      }

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
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-2xl w-full max-w-4xl my-8">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{visitName}</h2>
              <p className="text-gray-300">Scheduled: {formatDateUTC(scheduledDate)}</p>
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

              <div className="space-y-3">
                {bottles.map((b, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={b.ip_id}
                      onChange={(e) => setBottles(prev => prev.map((x,i) => i===idx ? { ...x, ip_id: e.target.value } : x))}
                      className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none"
                      placeholder="IP ID"
                    />
                    <input
                      type="number"
                      value={b.dispensed || ''}
                      onChange={(e) => setBottles(prev => prev.map((x,i) => i===idx ? { ...x, dispensed: parseInt(e.target.value)||0 } : x))}
                      className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none"
                      placeholder="Dispensed"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        value={b.returned || ''}
                        onChange={(e) => setBottles(prev => prev.map((x,i) => i===idx ? { ...x, returned: parseInt(e.target.value)||0 } : x))}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none"
                        placeholder="Returned"
                      />
                      <button
                        type="button"
                        className="px-2 py-2 text-red-400 hover:text-red-300"
                        onClick={() => setBottles(prev => prev.filter((_,i) => i!==idx))}
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-green-400 hover:text-green-300 text-sm"
                  onClick={() => setBottles(prev => [...prev, { ip_id: '', dispensed: 0, returned: 0 }])}
                >
                  + Add bottle row
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    IP Dispensed
                  </label>
                  <input
                    type="number"
                    value={visitData.IP_dispensed || ''}
                    onChange={(e) => handleInputChange('IP_dispensed', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    IP Returned
                  </label>
                  <input
                    type="number"
                    value={visitData.IP_returned || ''}
                    onChange={(e) => handleInputChange('IP_returned', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Compliance Display */}
              <div className="space-y-3">
                {/* Drug Compliance */}
                {drugCompliance && (
                  <ComplianceWidget
                    compliance={drugCompliance}
                    title="Drug Compliance"
                    subtitle="Based on IP accountability"
                    showDetails={true}
                  />
                )}

                {/* Visit Compliance */}
                {visitCompliance && (
                  <ComplianceWidget
                    compliance={visitCompliance}
                    title="Visit Timing"
                    subtitle="Adherence to scheduled date"
                    showDetails={true}
                  />
                )}
              </div>
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
