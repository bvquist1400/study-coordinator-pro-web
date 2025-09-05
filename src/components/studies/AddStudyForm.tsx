'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSite } from '@/components/site/SiteProvider'

interface AddStudyFormProps {
  onClose: () => void
  onSuccess: () => void
}

interface StudyFormData {
  protocol_number: string
  study_title: string
  protocol_version: string
  status: 'enrolling' | 'active' | 'closed_to_enrollment' | 'completed'
  sponsor: string
  principal_investigator: string
  phase: string
  indication: string
  target_enrollment: string
  start_date: string
  end_date: string
  dosing_frequency: 'QD' | 'BID' | 'TID' | 'QID' | 'weekly' | 'custom'
  compliance_threshold: string
  anchor_day: '0' | '1'
  notes: string
}

export default function AddStudyForm({ onClose, onSuccess }: AddStudyFormProps) {
  const router = useRouter()
  const { currentSiteId } = useSite()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const [formData, setFormData] = useState<StudyFormData>({
    protocol_number: '',
    study_title: '',
    protocol_version: '',
    status: 'enrolling',
    sponsor: '',
    principal_investigator: '',
    phase: '',
    indication: '',
    target_enrollment: '',
    start_date: '',
    end_date: '',
    dosing_frequency: 'QD',
    compliance_threshold: '80',
    anchor_day: '0',
    notes: ''
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Required fields validation
    if (!formData.protocol_number.trim()) {
      newErrors.protocol_number = 'Protocol number is required'
    }
    if (!formData.study_title.trim()) {
      newErrors.study_title = 'Study title is required'
    }
    if (!formData.sponsor.trim()) {
      newErrors.sponsor = 'Sponsor is required'
    }
    if (!formData.principal_investigator.trim()) {
      newErrors.principal_investigator = 'Principal investigator is required'
    }
    
    // Target enrollment validation
    if (formData.target_enrollment && (isNaN(Number(formData.target_enrollment)) || Number(formData.target_enrollment) < 1)) {
      newErrors.target_enrollment = 'Target enrollment must be a positive number'
    }
    
    // Compliance threshold validation
    const threshold = Number(formData.compliance_threshold)
    if (isNaN(threshold) || threshold < 1 || threshold > 100) {
      newErrors.compliance_threshold = 'Compliance threshold must be between 1 and 100'
    }
    
    // Date validation
    if (formData.start_date && formData.end_date) {
      const startDate = new Date(formData.start_date)
      const endDate = new Date(formData.end_date)
      if (startDate >= endDate) {
        newErrors.end_date = 'End date must be after start date'
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

    setIsSubmitting(true)
    
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      
      if (userError || !userData.user) {
        router.push('/login')
        return
      }

      // Resolve a site_id for the current user (first membership), fallback to null
      // Prefer current site selection; fallback to first membership if none
      let siteId: string | null = currentSiteId || null
      if (!siteId) {
        try {
          const { data: memberships } = await supabase
            .from('site_members')
            .select('site_id')
            .eq('user_id', userData.user.id)
            .limit(1)
          siteId = memberships && memberships.length > 0 ? memberships[0].site_id : null
        } catch {
          // ignore
        }
      }

      // Prepare data for insertion
      const insertData = {
        user_id: userData.user.id, // legacy/audit
        site_id: siteId,
        created_by: userData.user.id,
        protocol_number: formData.protocol_number.trim(),
        study_title: formData.study_title.trim(),
        protocol_version: formData.protocol_version.trim() || null,
        status: formData.status,
        sponsor: formData.sponsor.trim() || null,
        principal_investigator: formData.principal_investigator.trim() || null,
        phase: formData.phase.trim() || null,
        indication: formData.indication.trim() || null,
        target_enrollment: formData.target_enrollment ? Number(formData.target_enrollment) : null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        visit_window_days: 7, // Default value as defined in schema
        dosing_frequency: formData.dosing_frequency,
        compliance_threshold: Number(formData.compliance_threshold),
        anchor_day: Number(formData.anchor_day),
        notes: formData.notes.trim() || null
      }

      const { data, error } = await supabase
        .from('studies')
        .insert([insertData])
        .select()

      if (error) {
        console.error('Error creating study:', error)
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        console.error('Insert data:', insertData)
        
        if (error.code === '23505') {
          setErrors({ protocol_number: 'Protocol number already exists for your account' })
        } else {
          setErrors({ general: `Database error: ${error.message}` })
        }
        return
      }

      console.warn('Study created successfully:', data)
      onSuccess()
      onClose()
      
    } catch (error) {
      console.error('Unexpected error:', error)
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Add New Study</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled={isSubmitting}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {errors.general && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{errors.general}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Protocol Number & Study Title */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Protocol Number *
                </label>
                <input
                  type="text"
                  name="protocol_number"
                  value={formData.protocol_number}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., ABC-123-001"
                  disabled={isSubmitting}
                />
                {errors.protocol_number && (
                  <p className="text-red-400 text-sm mt-1">{errors.protocol_number}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Study Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSubmitting}
                >
                  <option value="enrolling">Enrolling</option>
                  <option value="active">Active</option>
                  <option value="closed_to_enrollment">Closed to Enrollment</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Study Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Study Title *
              </label>
              <input
                type="text"
                name="study_title"
                value={formData.study_title}
                onChange={handleInputChange}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter the full study title"
                disabled={isSubmitting}
              />
              {errors.study_title && (
                <p className="text-red-400 text-sm mt-1">{errors.study_title}</p>
              )}
            </div>

            {/* Protocol Version */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Protocol Version
              </label>
              <input
                type="text"
                name="protocol_version"
                value={formData.protocol_version}
                onChange={handleInputChange}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., v1.2, Amendment 3"
                disabled={isSubmitting}
              />
            </div>

            {/* Sponsor & Principal Investigator */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sponsor *
                </label>
                <input
                  type="text"
                  name="sponsor"
                  value={formData.sponsor}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Pharmaceutical company"
                  disabled={isSubmitting}
                />
                {errors.sponsor && (
                  <p className="text-red-400 text-sm mt-1">{errors.sponsor}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Principal Investigator *
                </label>
                <input
                  type="text"
                  name="principal_investigator"
                  value={formData.principal_investigator}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Dr. John Smith"
                  disabled={isSubmitting}
                />
                {errors.principal_investigator && (
                  <p className="text-red-400 text-sm mt-1">{errors.principal_investigator}</p>
                )}
              </div>
            </div>

            {/* Phase & Indication */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Phase
                </label>
                <input
                  type="text"
                  name="phase"
                  value={formData.phase}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Phase I, II, III, IV"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Indication
                </label>
                <input
                  type="text"
                  name="indication"
                  value={formData.indication}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Disease or condition"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Target Enrollment & Dosing Frequency */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target Enrollment
                </label>
                <input
                  type="number"
                  name="target_enrollment"
                  value={formData.target_enrollment}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Number of subjects"
                  min="1"
                  disabled={isSubmitting}
                />
                {errors.target_enrollment && (
                  <p className="text-red-400 text-sm mt-1">{errors.target_enrollment}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Dosing Frequency
                </label>
                <select
                  name="dosing_frequency"
                  value={formData.dosing_frequency}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSubmitting}
                >
                  <option value="QD">Once Daily (QD)</option>
                  <option value="BID">Twice Daily (BID)</option>
                  <option value="TID">Three Times Daily (TID)</option>
                  <option value="QID">Four Times Daily (QID)</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {/* Start & End Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSubmitting}
                />
                {errors.end_date && (
                  <p className="text-red-400 text-sm mt-1">{errors.end_date}</p>
                )}
              </div>
            </div>

            {/* Compliance Threshold & Anchor Day */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Compliance Threshold (%)
                </label>
                <input
                  type="number"
                  name="compliance_threshold"
                  value={formData.compliance_threshold}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="80"
                  min="1"
                  max="100"
                  disabled={isSubmitting}
                />
                {errors.compliance_threshold && (
                  <p className="text-red-400 text-sm mt-1">{errors.compliance_threshold}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Anchor Day
                </label>
                <select
                  name="anchor_day"
                  value={formData.anchor_day}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSubmitting}
                >
                  <option value="0">Day 0 (Baseline = Day 0)</option>
                  <option value="1">Day 1 (Baseline = Day 1)</option>
                </select>
                <p className="text-gray-400 text-xs mt-1">
                  Determines how visit windows are calculated from the baseline date.
                </p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={4}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                placeholder="Additional study notes..."
                disabled={isSubmitting}
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Study</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// Icon component
function XMarkIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
