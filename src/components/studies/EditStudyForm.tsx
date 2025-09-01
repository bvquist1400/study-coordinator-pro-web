'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Study } from '@/types/database'

interface EditStudyFormProps {
  study: Study
  onClose: () => void
  onSuccess: () => void
}

export default function EditStudyForm({ study, onClose, onSuccess }: EditStudyFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
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

  useEffect(() => {
    if (study) {
      setFormData({
        protocol_number: study.protocol_number || '',
        study_title: study.study_title || '',
        protocol_version: study.protocol_version || '',
        status: study.status || 'enrolling',
        sponsor: study.sponsor || '',
        principal_investigator: study.principal_investigator || '',
        phase: study.phase || '',
        indication: study.indication || '',
        target_enrollment: study.target_enrollment ? String(study.target_enrollment) : '',
        start_date: (study.start_date || '').split('T')[0] || '',
        end_date: (study.end_date || '').split('T')[0] || '',
        dosing_frequency: study.dosing_frequency || 'QD',
        compliance_threshold: study.compliance_threshold ? String(study.compliance_threshold) : '80',
        anchor_day: study.anchor_day ? String(study.anchor_day) : '0',
        notes: study.notes || ''
      })
    }
  }, [study])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.protocol_number.trim()) newErrors.protocol_number = 'Protocol number is required'
    if (!formData.study_title.trim()) newErrors.study_title = 'Study title is required'
    if (!formData.sponsor.trim()) newErrors.sponsor = 'Sponsor is required'
    if (!formData.principal_investigator.trim()) newErrors.principal_investigator = 'Principal investigator is required'
    const threshold = Number(formData.compliance_threshold)
    if (isNaN(threshold) || threshold < 1 || threshold > 100) newErrors.compliance_threshold = 'Compliance threshold must be between 1 and 100'
    if (formData.start_date && formData.end_date) {
      const s = new Date(formData.start_date)
      const e = new Date(formData.end_date)
      if (s >= e) newErrors.end_date = 'End date must be after start date'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const payload = {
        id: study.id,
        protocol_number: formData.protocol_number.trim(),
        study_title: formData.study_title.trim(),
        protocol_version: formData.protocol_version.trim() || null,
        status: formData.status,
        sponsor: formData.sponsor.trim() || null,
        principal_investigator: formData.principal_investigator.trim() || null,
        phase: formData.phase.trim() || null,
        indication: formData.indication.trim() || null,
        target_enrollment: formData.target_enrollment || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        dosing_frequency: formData.dosing_frequency,
        compliance_threshold: formData.compliance_threshold,
        anchor_day: formData.anchor_day,
        notes: formData.notes.trim() || null
      }
      const resp = await fetch('/api/studies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      if (resp.ok) {
        onSuccess()
      } else {
        const _err = await resp.json().catch(() => ({}))
        setErrors({ general: _err.error || 'Failed to update study' })
      }
    } catch {
      setErrors({ general: 'Unexpected error updating study' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCloseOut = async () => {
    if (!confirm('Mark this study as Completed?')) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const payload = {
        id: study.id,
        // preserve current values to avoid default overrides on server
        protocol_number: formData.protocol_number.trim(),
        study_title: formData.study_title.trim(),
        sponsor: formData.sponsor.trim() || null,
        principal_investigator: formData.principal_investigator.trim() || null,
        phase: formData.phase.trim() || null,
        indication: formData.indication.trim() || null,
        target_enrollment: formData.target_enrollment || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        dosing_frequency: formData.dosing_frequency,
        protocol_version: formData.protocol_version.trim() || null,
        compliance_threshold: formData.compliance_threshold,
        anchor_day: formData.anchor_day,
        notes: formData.notes.trim() || null,
        status: 'completed'
      }
      const resp = await fetch('/api/studies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      if (resp.ok) {
        onSuccess()
      } else {
        const err = await resp.json().catch(() => ({}))
        setErrors({ general: err.error || 'Failed to close out study' })
      }
    } catch (_e) {
      setErrors({ general: 'Unexpected error closing out study' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('This will permanently delete the study. Continue?')) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const resp = await fetch(`/api/studies/${study.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (resp.ok) {
        onSuccess()
      } else {
        const err = await resp.json().catch(() => ({}))
        setErrors({ general: err.error || 'Failed to delete study' })
      }
    } catch (_e) {
      setErrors({ general: 'Unexpected error deleting study' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Edit Study</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isSubmitting}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {errors.general && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{errors.general}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Protocol Number *</label>
                <input name="protocol_number" value={formData.protocol_number} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
                {errors.protocol_number && <p className="text-red-400 text-sm mt-1">{errors.protocol_number}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Protocol Version</label>
                <input name="protocol_version" value={formData.protocol_version} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Study Title *</label>
              <input name="study_title" value={formData.study_title} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
              {errors.study_title && <p className="text-red-400 text-sm mt-1">{errors.study_title}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select name="status" value={formData.status} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting}>
                  <option value="enrolling">Enrolling</option>
                  <option value="active">Active</option>
                  <option value="closed_to_enrollment">Closed to Enrollment</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Dosing Frequency</label>
                <select name="dosing_frequency" value={formData.dosing_frequency} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting}>
                  <option value="QD">Once daily</option>
                  <option value="BID">Twice daily</option>
                  <option value="TID">Three times daily</option>
                  <option value="QID">Four times daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Sponsor *</label>
                <input name="sponsor" value={formData.sponsor} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
                {errors.sponsor && <p className="text-red-400 text-sm mt-1">{errors.sponsor}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Principal Investigator *</label>
                <input name="principal_investigator" value={formData.principal_investigator} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
                {errors.principal_investigator && <p className="text-red-400 text-sm mt-1">{errors.principal_investigator}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phase</label>
                <input name="phase" value={formData.phase} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Indication</label>
                <input name="indication" value={formData.indication} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target Enrollment</label>
                <input name="target_enrollment" value={formData.target_enrollment} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Compliance Threshold (%)</label>
                <input name="compliance_threshold" value={formData.compliance_threshold} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
                {errors.compliance_threshold && <p className="text-red-400 text-sm mt-1">{errors.compliance_threshold}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                <input type="date" name="start_date" value={formData.start_date} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
                <input type="date" name="end_date" value={formData.end_date} onChange={handleInputChange} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
                {errors.end_date && <p className="text-red-400 text-sm mt-1">{errors.end_date}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={3} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" disabled={isSubmitting} />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <button type="button" onClick={handleDelete} className="px-4 py-2 text-red-400 hover:text-red-300" disabled={isSubmitting}>Delete</button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white" disabled={isSubmitting}>Cancel</button>
                <button type="button" onClick={handleCloseOut} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50" disabled={isSubmitting}>Close Out</button>
                <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
