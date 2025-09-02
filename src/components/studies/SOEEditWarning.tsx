'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface SOEEditWarningProps {
  studyId: string
  onConfirm: () => void
  onCancel: () => void
}

interface VisitSummary {
  total_visits: number
  total_subjects: number
  completed_visits: number
  scheduled_visits: number
}

export default function SOEEditWarning({ studyId, onConfirm, onCancel }: SOEEditWarningProps) {
  const [visitSummary, setVisitSummary] = useState<VisitSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [understood, setUnderstood] = useState(false)

  useEffect(() => {
    async function checkExistingVisits() {
      try {
        const { data: visits, error } = await supabase
          .from('subject_visits')
          .select('id, status, subject_id')
          .eq('study_id', studyId)

        if (error) throw error

        const totalVisits = visits?.length || 0
        const uniqueSubjects = new Set(visits?.map(v => v.subject_id)).size
        const completedVisits = visits?.filter(v => v.status === 'completed').length || 0
        const scheduledVisits = visits?.filter(v => v.status === 'scheduled').length || 0

        setVisitSummary({
          total_visits: totalVisits,
          total_subjects: uniqueSubjects,
          completed_visits: completedVisits,
          scheduled_visits: scheduledVisits
        })
      } catch (error) {
        console.error('Error checking visits:', error)
      } finally {
        setLoading(false)
      }
    }

    checkExistingVisits()
  }, [studyId])

  if (loading) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-yellow-600/30 rounded mb-2"></div>
          <div className="h-3 bg-yellow-600/20 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (!visitSummary || visitSummary.total_visits === 0) {
    // No existing visits, safe to proceed
    onConfirm()
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-yellow-600 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-yellow-400 mb-2">
              Warning: Existing Visits Detected
            </h3>
            
            <div className="bg-gray-900/50 rounded p-3 mb-4">
              <div className="text-sm text-gray-300 space-y-1">
                <div>📊 <strong>{visitSummary.total_visits}</strong> total visits across <strong>{visitSummary.total_subjects}</strong> subjects</div>
                <div>✅ <strong>{visitSummary.completed_visits}</strong> completed visits</div>
                <div>📅 <strong>{visitSummary.scheduled_visits}</strong> scheduled visits</div>
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-4">
              Modifying the Schedule of Events will attempt to automatically re-link existing visits 
              by matching visit names. However, some visits may become unlinked if names don&apos;t match exactly.
            </p>

            <div className="bg-blue-900/30 border border-blue-600/50 rounded p-3 mb-4">
              <h4 className="text-sm font-semibold text-blue-400 mb-1">What happens next:</h4>
              <ul className="text-xs text-blue-200 space-y-1">
                <li>• Visits with matching names will be automatically re-linked</li>
                <li>• Unmatched visits will need manual review</li>
                <li>• Visit progress tracking will be preserved where possible</li>
                <li>• Compliance calculations will be maintained</li>
              </ul>
            </div>

            <label className="flex items-start space-x-2 mb-4">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-blue-600 rounded border-gray-600 bg-gray-700"
              />
              <span className="text-sm text-gray-300">
                I understand the risks and want to proceed with SOE modifications
              </span>
            </label>

            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!understood}
                className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Proceed Carefully
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}