'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface EditSubjectFormProps {
  subjectId: string
  studyId: string
  onClose: () => void
  onSave: () => void
}

interface SubjectFormData {
  subject_number: string
  gender: 'M' | 'F' | 'Other' | ''
  enrollment_date: string
  randomization_date: string
  treatment_arm: string
  status: 'screening' | 'active' | 'completed' | 'discontinued' | 'withdrawn'
  notes: string
}

export default function EditSubjectForm({ subjectId, studyId, onClose, onSave }: EditSubjectFormProps) {
  const [formData, setFormData] = useState<SubjectFormData>({
    subject_number: '',
    gender: '',
    enrollment_date: '',
    randomization_date: '',
    treatment_arm: '',
    status: 'screening',
    notes: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  // Load existing subject data
  useEffect(() => {
    loadSubjectData()
  }, [subjectId])

  const loadSubjectData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        alert('Authentication error. Please refresh and try again.')
        return
      }

      const response = await fetch(`/api/subjects/${subjectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const { subject } = await response.json()
        setFormData({
          subject_number: subject.subject_number || '',
          gender: subject.gender || '',
          enrollment_date: subject.enrollment_date || '',
          randomization_date: subject.randomization_date || '',
          treatment_arm: subject.treatment_arm || '',
          status: subject.status || 'screening',
          notes: subject.notes || ''
        })
      } else {
        alert('Failed to load subject data')
      }
    } catch (error) {
      console.error('Error loading subject:', error)
      alert('Failed to load subject data')
    } finally {
      setInitialLoading(false)
    }
  }

  const handleChange = (field: keyof SubjectFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Required fields
    if (!formData.subject_number.trim()) {
      newErrors.subject_number = 'Subject number is required'
    }

    if (!formData.enrollment_date) {
      newErrors.enrollment_date = 'Enrollment date is required'
    }

    // Anchor date should be after enrollment
    if (formData.randomization_date && formData.enrollment_date) {
      if (new Date(formData.randomization_date) < new Date(formData.enrollment_date)) {
        newErrors.randomization_date = 'Anchor date must be after enrollment date'
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
      setLoading(true)

      // Get the auth session
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        alert('Authentication error. Please refresh and try again.')
        return
      }

      // Prepare data for submission
      const submitData = {
        subject_number: formData.subject_number.trim(),
        gender: formData.gender || null,
        enrollment_date: formData.enrollment_date,
        randomization_date: formData.randomization_date || null,
        treatment_arm: formData.treatment_arm.trim() || null,
        status: formData.status,
        notes: formData.notes.trim() || null
      }

      console.log('Updating subject data:', submitData)

      const response = await fetch(`/api/subjects/${subjectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(submitData)
      })

      const result = await response.json()

      if (response.ok) {
        alert(`Subject ${formData.subject_number} updated successfully!`)
        onSave()
      } else {
        console.error('API Error:', result)
        console.error('Response status:', response.status)
        if (response.status === 409) {
          setErrors({ subject_number: result.error })
        } else {
          alert(`Error: ${result.details || result.error}`)
        }
      }

    } catch (error) {
      console.error('Error updating subject:', error)
      alert('Failed to update subject. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
          <div className="animate-pulse flex items-center space-x-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white">Loading subject data...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Edit Subject</h2>
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
            {/* Subject Number */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Subject Number *
              </label>
              <input
                type="text"
                value={formData.subject_number}
                onChange={(e) => handleChange('subject_number', e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 001, S001"
              />
              {errors.subject_number && (
                <p className="text-red-400 text-sm mt-1">{errors.subject_number}</p>
              )}
            </div>

            {/* Demographics */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select...</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Study Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enrollment Date *
                </label>
                <input
                  type="date"
                  value={formData.enrollment_date}
                  onChange={(e) => handleChange('enrollment_date', e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.enrollment_date && (
                  <p className="text-red-400 text-sm mt-1">{errors.enrollment_date}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Anchor Date
                </label>
                <input
                  type="date"
                  value={formData.randomization_date}
                  onChange={(e) => handleChange('randomization_date', e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-gray-400 text-xs mt-1">
                  Visit windows will be calculated relative to this date, which serves as the anchor date for the study protocol.
                </p>
                {errors.randomization_date && (
                  <p className="text-red-400 text-sm mt-1">{errors.randomization_date}</p>
                )}
              </div>
            </div>

            {/* Treatment and Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Treatment Arm
                </label>
                <input
                  type="text"
                  value={formData.treatment_arm}
                  onChange={(e) => handleChange('treatment_arm', e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Active, Placebo, Arm A"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="screening">Screening</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="discontinued">Discontinued</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
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
                rows={4}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                placeholder="Additional notes about this subject..."
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
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>{loading ? 'Updating...' : 'Update Subject'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}