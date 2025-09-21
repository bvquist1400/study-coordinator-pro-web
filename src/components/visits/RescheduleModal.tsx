'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'

interface RescheduleModalProps {
  visit: {
    id: string
    visit_name: string
    visit_date: string
    scheduled_date: string
    status: 'scheduled' | 'completed' | 'missed' | 'cancelled' | 'upcoming' | 'not_scheduled'
    window_start: string | null
    window_end: string | null
    visit_schedule_id: string | null
    subject_section_id?: string | null
  }
  onClose: () => void
  onRescheduled: () => Promise<void> | void
}

export default function RescheduleModal({ visit, onClose, onRescheduled }: RescheduleModalProps) {
  const [newDate, setNewDate] = useState(() => visit.scheduled_date.slice(0, 10))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const windowLabel = visit.window_start && visit.window_end
    ? `${formatDateUTC(visit.window_start)} - ${formatDateUTC(visit.window_end)}`
    : 'No protocol window'

  const hasActualVisit = !visit.id.startsWith('schedule-')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!hasActualVisit) {
      alert('Please schedule this visit before attempting to reschedule.')
      return
    }
    if (!newDate) {
      alert('Select a new date')
      return
    }
    try {
      setSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        alert('Authentication required')
        return
      }

      const payload: Record<string, unknown> = {
        visit_date: newDate,
      }
      if (reason.trim()) {
        payload.reschedule_reason = reason.trim()
      }

      const response = await fetch(`/api/subject-visits/${visit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to reschedule visit' }))
        alert(error.error || 'Failed to reschedule visit')
        return
      }

      await onRescheduled()
      onClose()
    } catch (error) {
      console.error('Error rescheduling visit:', error)
      alert('Failed to reschedule visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 border border-gray-700 rounded-2xl max-w-lg w-full shadow-xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Reschedule Visit</h2>
              <p className="text-sm text-gray-400 mt-1">{visit.visit_name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>

          {!hasActualVisit && (
            <div className="bg-yellow-900/40 border border-yellow-700 text-yellow-200 text-sm rounded-lg p-3">
              This visit has not been scheduled yet. Schedule it first, then you can update the date.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4">
              <dl className="space-y-2 text-gray-300">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Current Date</dt>
                  <dd className="text-white font-medium">{formatDateUTC(visit.scheduled_date)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Window</dt>
                  <dd className="text-white font-medium">{windowLabel}</dd>
                </div>
                {visit.status === 'completed' && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Recorded Completion</dt>
                    <dd className="text-white font-medium">{formatDateUTC(visit.visit_date)}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">New Scheduled Date *</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!hasActualVisit}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this visit being rescheduled?"
                rows={3}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !hasActualVisit || !newDate}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
