'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface StudyDetailsModalProps {
  studyId: string
  onClose: () => void
}

interface Study {
  id: string
  protocol_number: string
  study_title: string
  status: string
  sponsor: string | null
  principal_investigator: string | null
  phase: string | null
  indication: string | null
  target_enrollment: number | null
  start_date: string | null
  end_date: string | null
  dosing_frequency: string | null
  compliance_threshold: number
  anchor_day: number
  inventory_buffer_days: number
  visit_window_buffer_days: number
  delivery_days_default: number
  notes: string | null
  protocol_version?: string | null
  updated_at?: string
}

export default function StudyDetailsModal({ studyId, onClose }: StudyDetailsModalProps) {
  const [study, setStudy] = useState<Study | null>(null)
  const [loading, setLoading] = useState(true)
  const [windowSummary, setWindowSummary] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const timeAgo = (iso?: string | null) => {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diff = Math.max(0, now - then)
    const sec = Math.floor(diff / 1000)
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    const day = Math.floor(hr / 24)
    const mon = Math.floor(day / 30)
    const yr = Math.floor(day / 365)
    if (yr > 0) return `${yr} year${yr>1?'s':''} ago`
    if (mon > 0) return `${mon} month${mon>1?'s':''} ago`
    if (day > 0) return `${day} day${day>1?'s':''} ago`
    if (hr > 0) return `${hr} hour${hr>1?'s':''} ago`
    if (min > 0) return `${min} minute${min>1?'s':''} ago`
    return 'just now'
  }

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return

        const [studyRes, vsRes] = await Promise.all([
          fetch(`/api/studies/${studyId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/visit-schedules?study_id=${studyId}`, { headers: { Authorization: `Bearer ${token}` } })
        ])
        if (studyRes.ok) {
          const { study } = await studyRes.json()
          setStudy(study)
        }
        if (vsRes.ok) {
          const { visitSchedules } = await vsRes.json()
          const arr: Array<{ window_before_days?: number; window_after_days?: number }> = visitSchedules || []
          if (arr.length > 0) {
            const beforeVals = arr.map(v => v.window_before_days ?? 0)
            const afterVals = arr.map(v => v.window_after_days ?? 0)
            const minBefore = Math.min(...beforeVals)
            const maxAfter = Math.max(...afterVals)
            setWindowSummary(`Variable by visit (−${minBefore} to +${maxAfter} days) · ${arr.length} visits`)
          } else {
            setWindowSummary('No visit schedules configured')
          }
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [studyId])

  const dosingLabel = (abbr?: string | null) => {
    switch ((abbr || '').toUpperCase()) {
      case 'QD': return 'Once daily'
      case 'BID': return 'Twice daily'
      case 'TID': return 'Three times daily'
      case 'QID': return 'Four times daily'
      case 'WEEKLY': return 'Weekly'
      case 'CUSTOM': return 'Custom'
      default: return abbr || 'Not specified'
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 text-gray-200">Loading...</div>
      </div>
    )
  }

  if (!study) return null

  const copyStudyInfo = async () => {
    const lines = [
      `${study.study_title}`,
      `Protocol: ${study.protocol_number}${study.protocol_version ? ` (Version: ${study.protocol_version})` : ''}`,
      `Status: ${study.status}`,
      study.sponsor ? `Sponsor: ${study.sponsor}` : null,
      study.principal_investigator ? `PI: ${study.principal_investigator}` : null,
      study.phase ? `Phase: ${study.phase}` : null,
      study.indication ? `Indication: ${study.indication}` : null,
      `Target Enrollment: ${study.target_enrollment ?? 'Not set'}`,
      `Dosing: ${dosingLabel(study.dosing_frequency)}`,
      `Compliance Threshold: ${study.compliance_threshold}%`,
      `Visit Windows: ${windowSummary || 'Variable by visit'}`,
      `Inventory Buffer: ${study.inventory_buffer_days} day${study.inventory_buffer_days === 1 ? '' : 's'}`,
      `Visit Window Buffer: ${study.visit_window_buffer_days} day${study.visit_window_buffer_days === 1 ? '' : 's'}`,
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // noop
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-2xl w-full max-w-3xl my-8">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{study.study_title}</h2>
              <div className="flex items-center gap-3">
                <p className="text-gray-300 flex items-center gap-2">
                  <span>Protocol: {study.protocol_number}</span>
                  <button
                    type="button"
                    className="text-blue-400 hover:text-blue-300"
                    title="Copy protocol number"
                    onClick={async () => { try { await navigator.clipboard.writeText(String(study.protocol_number || '')) } catch {} }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h8a2 2 0 002-2v-6M8 16l-2 2m0 0l2 2m-2-2h6" />
                    </svg>
                  </button>
                </p>
                <span className="text-xs text-gray-500" title={study.updated_at ? new Date(study.updated_at as string).toLocaleString() : ''}>
                  Last updated: {timeAgo(study.updated_at ?? null)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={copyStudyInfo} className="text-blue-400 hover:text-blue-300 text-sm border border-blue-600/40 rounded px-3 py-1">
                {copied ? 'Copied!' : 'Copy Info'}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 text-gray-200">
              {study.sponsor && <div><span className="text-gray-400">Sponsor:</span> {study.sponsor}</div>}
              {study.principal_investigator && <div><span className="text-gray-400">PI:</span> {study.principal_investigator}</div>}
              {study.phase && <div><span className="text-gray-400">Phase:</span> {study.phase}</div>}
              {study.indication && <div><span className="text-gray-400">Indication:</span> {study.indication}</div>}
            </div>
            <div className="space-y-2 text-gray-200">
              <div><span className="text-gray-400">Target Enrollment:</span> {study.target_enrollment ?? 'Not set'}</div>
              {study.protocol_version && (
                <div><span className="text-gray-400">Protocol Version:</span> {study.protocol_version}</div>
              )}
              <div><span className="text-gray-400">Dosing:</span> {dosingLabel(study.dosing_frequency)}</div>
              <div><span className="text-gray-400">Compliance Threshold:</span> {study.compliance_threshold}%</div>
              <div><span className="text-gray-400">Visit Windows:</span> {windowSummary || 'Variable by visit'}</div>
              <div><span className="text-gray-400">Inventory Buffer:</span> {study.inventory_buffer_days} day{study.inventory_buffer_days === 1 ? '' : 's'}</div>
              <div><span className="text-gray-400">Visit Window Buffer:</span> {study.visit_window_buffer_days} day{study.visit_window_buffer_days === 1 ? '' : 's'}</div>
              <div><span className="text-gray-400">Delivery Time to Site:</span> {study.delivery_days_default} day{study.delivery_days_default === 1 ? '' : 's'}</div>
            </div>
          </div>

          {study.notes && (
            <div className="mt-6">
              <div className="text-gray-400 mb-1">Notes</div>
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-gray-200 whitespace-pre-wrap">{study.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
