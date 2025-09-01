'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { todayLocalISODate } from '@/lib/date-utils'

interface AddLabKitModalProps {
  studyId: string
  onClose: () => void
  onAdd: () => void
}

interface VisitSchedule {
  id: string
  visit_name: string
  visit_number: number
  visit_type: string
}

interface LabKitFormData {
  accession_number: string
  kit_type: string
  visit_schedule_id: string
  expiration_date: string
  received_date: string
  notes: string
}

export default function AddLabKitModal({ studyId, onClose, onAdd }: AddLabKitModalProps) {
  const [visitSchedules, setVisitSchedules] = useState<VisitSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [formData, setFormData] = useState<LabKitFormData>({
    accession_number: '',
    kit_type: '',
    visit_schedule_id: '',
    expiration_date: '',
    received_date: todayLocalISODate(), // Default to today (local)
    notes: ''
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})

  const loadVisitSchedules = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/visit-schedules?studyId=${studyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setVisitSchedules(data.visitSchedules || [])
      }
    } catch (error) {
      console.error('Error loading visit schedules:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadVisitSchedules()
  }, [loadVisitSchedules])

  const handleChange = (field: keyof LabKitFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
    
    // Auto-populate kit type based on visit selection
    if (field === 'visit_schedule_id' && value) {
      const selectedVisit = visitSchedules.find(v => v.id === value)
      if (selectedVisit && !formData.kit_type) {
        setFormData(prev => ({ 
          ...prev, 
          kit_type: `${selectedVisit.visit_name} Lab Kit`,
          visit_schedule_id: value 
        }))
      }
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Required fields
    if (!formData.accession_number.trim()) {
      newErrors.accession_number = 'Accession number is required'
    }

    if (!formData.kit_type.trim()) {
      newErrors.kit_type = 'Kit type is required'
    }

    if (!formData.received_date) {
      newErrors.received_date = 'Received date is required'
    }

    // Validate expiration date is in the future
    if (formData.expiration_date) {
      const expDate = (require('@/lib/date-utils').parseDateUTC(formData.expiration_date) || new Date(formData.expiration_date)) as Date
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (expDate <= today) {
        newErrors.expiration_date = 'Expiration date must be in the future'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setSaving(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const submitData = {
        study_id: studyId,
        accession_number: formData.accession_number.trim(),
        kit_type: formData.kit_type.trim(),
        visit_schedule_id: formData.visit_schedule_id || null,
        expiration_date: formData.expiration_date || null,
        received_date: formData.received_date,
        notes: formData.notes.trim() || null,
        status: 'available' as const
      }

      const response = await fetch('/api/lab-kits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(submitData)
      })

      if (response.ok) {
        alert(`Lab kit ${formData.accession_number} added successfully!`)
        onAdd()
      } else {
        const error = await response.json()
        if (response.status === 409) {
          setErrors({ accession_number: error.error })
        } else {
          alert(`Error: ${error.details || error.error}`)
        }
      }

    } catch (error) {
      console.error('Error adding lab kit:', error)
      alert('Failed to add lab kit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
          <div className="animate-pulse flex items-center space-x-4">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Add New Lab Kit</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Accession Number */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Accession Number *
              </label>
              <input
                type="text"
                value={formData.accession_number}
                onChange={(e) => handleChange('accession_number', e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., LK-2024-001"
              />
              {errors.accession_number && (
                <p className="text-red-400 text-sm mt-1">{errors.accession_number}</p>
              )}
            </div>

            {/* Visit Assignment */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Visit Assignment
              </label>
              <select
                value={formData.visit_schedule_id}
                onChange={(e) => handleChange('visit_schedule_id', e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Not assigned to specific visit</option>
                {visitSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.visit_name} (V{schedule.visit_number})
                  </option>
                ))}
              </select>
              <p className="text-gray-400 text-xs mt-1">
                Optional: Assign this kit to a specific visit type from the protocol
              </p>
            </div>

            {/* Kit Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Kit Type *
              </label>
              <input
                type="text"
                value={formData.kit_type}
                onChange={(e) => handleChange('kit_type', e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., Baseline Labs, Week 4 Labs, Safety Labs"
              />
              {errors.kit_type && (
                <p className="text-red-400 text-sm mt-1">{errors.kit_type}</p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Received Date *
                </label>
                <input
                  type="date"
                  value={formData.received_date}
                  onChange={(e) => handleChange('received_date', e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                {errors.received_date && (
                  <p className="text-red-400 text-sm mt-1">{errors.received_date}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Expiration Date
                </label>
                <input
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) => handleChange('expiration_date', e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                {errors.expiration_date && (
                  <p className="text-red-400 text-sm mt-1">{errors.expiration_date}</p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-vertical"
                placeholder="Additional notes about this lab kit..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>{saving ? 'Adding...' : 'Add Lab Kit'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
