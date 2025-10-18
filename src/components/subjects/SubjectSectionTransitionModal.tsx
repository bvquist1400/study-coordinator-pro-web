'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { StudySection } from '@/types/database'

interface Props {
  studyId: string
  subjectId: string
  onClose: () => void
  onDone: () => void
}

export default function SubjectSectionTransitionModal({ studyId, subjectId, onClose, onDone }: Props) {
  const [sections, setSections] = useState<StudySection[]>([])
  const [toSectionId, setToSectionId] = useState('')
  const [anchorDate, setAnchorDate] = useState('')
  const [endReason, setEndReason] = useState('')
  const [cancelPolicy, setCancelPolicy] = useState<'cancel_all' | 'keep'>('cancel_all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const resp = await fetch(`/api/study-sections?study_id=${studyId}`, { headers: { Authorization: `Bearer ${token}` } })
        if (resp.ok) {
          const { sections } = await resp.json()
          const list = (sections || []) as StudySection[]
          setSections(list)
          setToSectionId(list[0]?.id || '')
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [studyId])

  const submit = async () => {
    try {
      setSubmitting(true)
      setError('')
      if (!toSectionId || !anchorDate) {
        setError('Select a section and anchor date')
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required')
      const resp = await fetch('/api/subject-sections/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject_id: subjectId, to_section_id: toSectionId, anchor_date: anchorDate, end_reason: endReason, cancel_policy: cancelPolicy })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to transition section')
      }
      onDone()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-white">Transition Subject Section</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
          </div>
          {loading ? (
            <div className="text-gray-300">Loading…</div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>
              )}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Next Section</label>
                <select value={toSectionId} onChange={(e) => setToSectionId(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-3 py-2">
                  {sections.map(sec => (
                    <option key={sec.id} value={sec.id}>{sec.code}{sec.name ? ` — ${sec.name}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Anchor Date (for next section)</label>
                <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Transition Notes (optional)</label>
                <input value={endReason} onChange={(e) => setEndReason(e.target.value)} placeholder="Reason or notes" className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Policy</label>
                <select value={cancelPolicy} onChange={(e) => setCancelPolicy(e.target.value as any)} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded px-3 py-2">
                  <option value="cancel_all">Cancel all future visits in previous section</option>
                  <option value="keep">Keep previously scheduled visits</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Close</button>
                <button onClick={submit} disabled={submitting || !anchorDate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Transition'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
