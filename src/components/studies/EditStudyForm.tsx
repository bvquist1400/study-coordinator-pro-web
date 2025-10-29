'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Study, StudySection } from '@/types/database'

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
    recruitment: 'enrolling',
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
    inventory_buffer_days: '14',
    visit_window_buffer_days: '0',
    delivery_days_default: '5',
    notes: ''
  })
  const [sections, setSections] = useState<StudySection[]>([])
  const [secLoading, setSecLoading] = useState(false)
  const [newSecCode, setNewSecCode] = useState('')
  const [newSecName, setNewSecName] = useState('')
  const [secError, setSecError] = useState('')
  // Study Drugs management
  const [drugs, setDrugs] = useState<Array<{ id: string, code: string, name: string, dosing_frequency?: string | null, dose_per_day?: number | null }>>([])
  const [newDrug, setNewDrug] = useState<{ code?: string; name?: string; dosing_frequency?: string; dose_per_day?: number | null }>({})
  const refreshDrugs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const resp = await fetch(`/api/study-drugs?studyId=${study.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (resp.ok) {
        const { drugs } = await resp.json()
        setDrugs(drugs || [])
      }
    } catch {}
  }

  useEffect(() => {
    if (study) {
      setFormData({
        protocol_number: study.protocol_number || '',
        study_title: study.study_title || '',
        protocol_version: study.protocol_version || '',
        status: study.status || 'enrolling',
        recruitment: (study.recruitment as any) || 'enrolling',
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
        inventory_buffer_days: study.inventory_buffer_days !== undefined && study.inventory_buffer_days !== null ? String(study.inventory_buffer_days) : '14',
        visit_window_buffer_days: study.visit_window_buffer_days !== undefined && study.visit_window_buffer_days !== null ? String(study.visit_window_buffer_days) : '0',
        delivery_days_default: study.delivery_days_default !== undefined && study.delivery_days_default !== null ? String(study.delivery_days_default) : '5',
        notes: study.notes || ''
      })
    }
    // Load sections
    ;(async () => {
      try {
        setSecLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const resp = await fetch(`/api/study-sections?study_id=${study.id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (resp.ok) {
          const { sections } = await resp.json()
          setSections(sections || [])
        }
      } catch {
        // ignore
      } finally {
        setSecLoading(false)
      }
    })()
    // Load study drugs
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const resp = await fetch(`/api/study-drugs?studyId=${study.id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (resp.ok) {
          const { drugs } = await resp.json()
          setDrugs(drugs || [])
        }
      } catch {}
    })()
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
    const inventoryBuffer = Number(formData.inventory_buffer_days)
    if (isNaN(inventoryBuffer) || inventoryBuffer < 0 || inventoryBuffer > 120) newErrors.inventory_buffer_days = 'Inventory buffer must be between 0 and 120 days'
    const visitWindowBuffer = Number(formData.visit_window_buffer_days)
    if (isNaN(visitWindowBuffer) || visitWindowBuffer < 0 || visitWindowBuffer > 60) newErrors.visit_window_buffer_days = 'Visit window buffer must be between 0 and 60 days'
    const deliveryDays = Number(formData.delivery_days_default)
    if (isNaN(deliveryDays) || deliveryDays < 0 || deliveryDays > 120) newErrors.delivery_days_default = 'Delivery time must be between 0 and 120 days'
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
        recruitment: formData.recruitment,
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
        inventory_buffer_days: formData.inventory_buffer_days,
        visit_window_buffer_days: formData.visit_window_buffer_days,
        delivery_days_default: formData.delivery_days_default,
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
        inventory_buffer_days: formData.inventory_buffer_days,
        visit_window_buffer_days: formData.visit_window_buffer_days,
        notes: formData.notes.trim() || null,
        status: 'completed',
        recruitment: formData.recruitment
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
    } catch {
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
    } catch {
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
          <div className="flex items-center gap-3">
            <Link
              href={`/studies/${study.id}/workload`}
              target="_blank"
              className="text-sm text-blue-400 hover:text-blue-300 border border-blue-500/50 rounded-lg px-3 py-1.5 transition-colors"
            >
              Open Workload Engine
            </Link>
            <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isSubmitting}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

          {errors.general && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{errors.general}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sections Management */}
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold">Sections</h3>
                {secLoading && <span className="text-xs text-gray-400">Loading…</span>}
              </div>
              {secError && (
                <div className="mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{secError}</div>
              )}
              <div className="space-y-2">
                {sections.length === 0 && (
                  <p className="text-gray-400 text-sm">No sections yet. Add one below.</p>
                )}
                {sections
                  .slice()
                  .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                  .map((sec) => (
                    <div key={sec.id} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        className="col-span-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1"
                        value={sec.code}
                        onChange={(e) => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, code: e.target.value.toUpperCase() } : s))}
                      />
                      <input
                        className="col-span-5 bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1"
                        value={sec.name || ''}
                        onChange={(e) => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, name: e.target.value } : s))}
                        placeholder="Name (optional)"
                      />
                      <input
                        type="number"
                        className="col-span-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1"
                        value={sec.order_index || 0}
                        onChange={(e) => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, order_index: Number(e.target.value) } : s))}
                        placeholder="Order"
                      />
                      <label className="col-span-2 inline-flex items-center gap-2 text-gray-200">
                        <input
                          type="checkbox"
                          checked={!!sec.is_active}
                          onChange={(e) => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, is_active: e.target.checked } : s))}
                          className="accent-blue-600"
                        />
                        Active
                      </label>
                      <div className="col-span-1 flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-sm px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600"
                          onClick={async () => {
                            try {
                              setSecError('')
                              const { data: { session } } = await supabase.auth.getSession()
                              const token = session?.access_token
                              if (!token) throw new Error('Auth required')
                              const resp = await fetch(`/api/study-sections/${sec.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({
                                  code: (sec.code || '').toUpperCase(),
                                  name: sec.name || null,
                                  order_index: sec.order_index || 0,
                                  is_active: !!sec.is_active
                                })
                              })
                              if (!resp.ok) {
                                const err = await resp.json().catch(() => ({}))
                                throw new Error(err.error || 'Failed to save section')
                              }
                            } catch (e) {
                              setSecError((e as Error).message)
                            }
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="text-sm px-2 py-1 bg-red-700/70 hover:bg-red-700 rounded border border-red-600"
                          onClick={async () => {
                            if (!confirm('Delete this section? This does not delete existing visits.')) return
                            try {
                              setSecError('')
                              const { data: { session } } = await supabase.auth.getSession()
                              const token = session?.access_token
                              if (!token) throw new Error('Auth required')
                              const resp = await fetch(`/api/study-sections/${sec.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
                              if (!resp.ok) {
                                const err = await resp.json().catch(() => ({}))
                                throw new Error(err.error || 'Failed to delete')
                              }
                              setSections(prev => prev.filter(s => s.id !== sec.id))
                            } catch (e) {
                              setSecError((e as Error).message)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              {/* Add new section */}
              <div className="mt-4 grid grid-cols-12 gap-2 items-end">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Code</label>
                  <input value={newSecCode} onChange={e => setNewSecCode(e.target.value.toUpperCase())} placeholder="S2" className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1" />
                </div>
                <div className="col-span-6">
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input value={newSecName} onChange={e => setNewSecName(e.target.value)} placeholder="Open Label Extension" className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Order</label>
                  <input type="number" value={(sections.length + 1)} readOnly className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-2 py-1" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <button
                    type="button"
                    className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded"
                    onClick={async () => {
                      try {
                        setSecError('')
                        const code = (newSecCode || '').trim().toUpperCase()
                        if (!code) throw new Error('Enter a section code (e.g., S2)')
                        const { data: { session } } = await supabase.auth.getSession()
                        const token = session?.access_token
                        if (!token) throw new Error('Auth required')
                        const resp = await fetch('/api/study-sections', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ study_id: study.id, code, name: newSecName || null, order_index: (sections.length + 1) })
                        })
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({}))
                          throw new Error(err.error || 'Failed to add section')
                        }
                        const { sections: reloaded } = await fetch(`/api/study-sections?study_id=${study.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
                        setSections(reloaded || [])
                        setNewSecCode('')
                        setNewSecName('')
                      } catch (e) {
                        setSecError((e as Error).message)
                      }
                    }}
                  >
                    Add Section
                  </button>
                </div>
              </div>
            </div>

            {/* Study Drugs */}
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold">Study Drugs</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left text-gray-300">
                  <thead className="text-xs uppercase text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Dosing Freq</th>
                      <th className="px-3 py-2">Dose/Day</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drugs.map((d) => (
                      <tr key={d.id} className="border-t border-gray-700/60">
                        <td className="px-3 py-2"><input defaultValue={d.code} onBlur={async (e) => { await updateDrugReq(d.id, { code: e.target.value }); await refreshDrugs() }} className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1" /></td>
                        <td className="px-3 py-2"><input defaultValue={d.name} onBlur={async (e) => { await updateDrugReq(d.id, { name: e.target.value }); await refreshDrugs() }} className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1" /></td>
                        <td className="px-3 py-2">
                          <select defaultValue={d.dosing_frequency || ''} onChange={async (e) => { await updateDrugReq(d.id, { dosing_frequency: e.target.value || null }); await refreshDrugs() }} className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1">
                            <option value="">(none)</option>
                            <option value="QD">QD</option>
                            <option value="BID">BID</option>
                            <option value="TID">TID</option>
                            <option value="QID">QID</option>
                            <option value="weekly">weekly</option>
                            <option value="custom">custom</option>
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="number" step="0.1" defaultValue={d.dose_per_day || ''} onBlur={async (e) => { await updateDrugReq(d.id, { dose_per_day: e.target.value ? Number(e.target.value) : null }); await refreshDrugs() }} className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1" /></td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-red-400 hover:text-red-300" onClick={async () => { await deleteDrugReq(d.id); await refreshDrugs() }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-700/60">
                      <td className="px-3 py-2"><input value={newDrug.code || ''} onChange={(e) => setNewDrug({ ...newDrug, code: e.target.value })} placeholder="Code" className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1" /></td>
                      <td className="px-3 py-2"><input value={newDrug.name || ''} onChange={(e) => setNewDrug({ ...newDrug, name: e.target.value })} placeholder="Name" className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1" /></td>
                      <td className="px-3 py-2">
                        <select value={newDrug.dosing_frequency || ''} onChange={(e) => setNewDrug({ ...newDrug, dosing_frequency: e.target.value || undefined })} className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1">
                          <option value="">(none)</option>
                          <option value="QD">QD</option>
                          <option value="BID">BID</option>
                          <option value="TID">TID</option>
                          <option value="QID">QID</option>
                          <option value="weekly">weekly</option>
                          <option value="custom">custom</option>
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="number" step="0.1" value={newDrug.dose_per_day as any || ''} onChange={(e) => setNewDrug({ ...newDrug, dose_per_day: e.target.value ? Number(e.target.value) : null })} placeholder="1" className="w-full bg-gray-700/50 border border-gray-600 rounded px-2 py-1" /></td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className="text-blue-400 hover:text-blue-300" onClick={async () => {
                          const tokenRes = await supabase.auth.getSession();
                          const token = tokenRes.data.session?.access_token
                          if (!token) return
                          await fetch(`/api/study-drugs/create?studyId=${study.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newDrug) })
                          setNewDrug({})
                          await refreshDrugs()
                        }}>Add</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <label className="block text-sm font-medium text-gray-300 mb-2">Recruitment Status</label>
                <select
                  name="recruitment"
                  value={formData.recruitment}
                  onChange={handleInputChange}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2"
                  disabled={isSubmitting}
                >
                  <option value="enrolling">Enrolling (active accrual)</option>
                  <option value="paused">Paused</option>
                  <option value="closed_to_accrual">Closed to Accrual</option>
                  <option value="on_hold">On Hold</option>
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
                <label className="block text-sm font-medium text-gray-300 mb-2">Inventory Buffer (days)</label>
                <input
                  name="inventory_buffer_days"
                  value={formData.inventory_buffer_days}
                  onChange={handleInputChange}
                  type="number"
                  min={0}
                  max={120}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2"
                  disabled={isSubmitting}
                />
                <p className="text-gray-400 text-xs mt-1">
                  Keeps extra lab kit inventory by projecting demand this many days beyond the main forecast window.
                </p>
                {errors.inventory_buffer_days && <p className="text-red-400 text-sm mt-1">{errors.inventory_buffer_days}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Visit Window Buffer (days)</label>
                <input
                  name="visit_window_buffer_days"
                  value={formData.visit_window_buffer_days}
                  onChange={handleInputChange}
                  type="number"
                  min={0}
                  max={60}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2"
                  disabled={isSubmitting}
                />
                <p className="text-gray-400 text-xs mt-1">
                  Extends the lookahead for upcoming visits so kit shortages are flagged earlier.
                </p>
                {errors.visit_window_buffer_days && <p className="text-red-400 text-sm mt-1">{errors.visit_window_buffer_days}</p>}
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

async function updateDrugReq(id: string, patch: any) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return
  await fetch(`/api/study-drugs/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(patch) })
}

async function deleteDrugReq(id: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return
  await fetch(`/api/study-drugs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
}
