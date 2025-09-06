'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { type Study } from '@/types/database'
import { useSite } from '@/components/site/SiteProvider'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import AddStudyForm from '@/components/studies/AddStudyForm'
import EditStudyForm from '@/components/studies/EditStudyForm'
import StudyDetailsModal from '@/components/studies/StudyDetailsModal'
import ScheduleOfEventsBuilder from '@/components/studies/ScheduleOfEventsBuilder'

export default function StudiesPage() {
  const router = useRouter()
  const [studies, setStudies] = useState<Study[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedStudyForSoE, setSelectedStudyForSoE] = useState<Study | null>(null)
  const [showDetailsStudy, setShowDetailsStudy] = useState<Study | null>(null)
  const [editingStudy, setEditingStudy] = useState<Study | null>(null)
  const [windowSummaries, setWindowSummaries] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const pageSize = 10
  const { currentSiteId } = useSite()

  useEffect(() => {
    async function loadStudies() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        
        if (userError || !userData.user) {
          router.push('/login')
          return
        }
        
        // user is authenticated; no need to persist in state here

        // Try API first for membership-scoped studies, with optional site filter
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token
          if (token) {
            const url = currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies'
            const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            if (resp.ok) {
              const { studies } = await resp.json()
              setStudies(studies || [])
              return
            }
          }
        } catch (apiErr) {
          console.warn('API error loading studies, falling back to direct DB:', apiErr)
        }

        // Fallback: direct DB (RLS should restrict to memberships); filter client-side by site
        const { data: studiesData, error: studiesError } = await supabase
          .from('studies')
          .select('*')
          .order('created_at', { ascending: false })

        if (studiesError) {
          console.error('Error loading studies:', studiesError)
        } else {
          const filtered = currentSiteId ? (studiesData || []).filter((s: { site_id: string | null }) => s.site_id === currentSiteId) : (studiesData || [])
          setStudies(filtered)
        }
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStudies()
  }, [router, currentSiteId])

  const handleStudyAdded = () => {
    // Reload studies after successful addition
    async function reloadStudies() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        
        if (userError || !userData.user) {
          return
        }

        const { data: studiesData, error: studiesError } = await supabase
          .from('studies')
          .select('*')
          .order('created_at', { ascending: false })

        if (!studiesError) {
          setStudies(studiesData || [])
        }
      } catch (error) {
        console.error('Error reloading studies:', error)
      }
    }
    
    reloadStudies()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enrolling':
        return 'text-blue-400 bg-blue-400/10 border-blue-400/20'
      case 'active':
        return 'text-green-400 bg-green-400/10 border-green-400/20'
      case 'closed_to_enrollment':
        return 'text-orange-400 bg-orange-400/10 border-orange-400/20'
      case 'completed':
        return 'text-gray-400 bg-gray-400/10 border-gray-400/20'
      default:
        return 'text-gray-400 bg-gray-400/10 border-gray-400/20'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'enrolling':
        return 'Enrolling'
      case 'active':
        return 'Active'
      case 'closed_to_enrollment':
        return 'Closed to Enrollment'
      case 'completed':
        return 'Completed'
      default:
        return status
    }
  }

  const getDosingLabel = (abbr?: Study['dosing_frequency'] | null) => {
    const v = (abbr ?? '').toString().toUpperCase()
    switch (v) {
      case 'QD': return 'Once daily'
      case 'BID': return 'Twice daily'
      case 'TID': return 'Three times daily'
      case 'QID': return 'Four times daily'
      case 'WEEKLY': return 'Weekly'
      case 'CUSTOM': return 'Custom'
      default: return (abbr as string) || 'Not specified'
    }
  }

  const timeAgo = (iso?: string) => {
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

  // Load per-study visit window summaries (min/max across visit schedules)
  useEffect(() => {
    const loadSummaries = async () => {
      try {
        if (studies.length === 0) return
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const start = (page - 1) * pageSize
        const visible = studies.slice(start, start + pageSize)
        const entries = await Promise.all(visible.map(async (s) => {
          try {
            const resp = await fetch(`/api/visit-schedules?study_id=${s.id}`, { headers: { Authorization: `Bearer ${token}` } })
            if (!resp.ok) return [s.id, 'No visit schedules'] as const
            const { visitSchedules } = await resp.json()
            const arr = (visitSchedules || []) as Array<{ window_before_days?: number; window_after_days?: number }>
            if (arr.length === 0) return [s.id, 'No visit schedules'] as const
            const beforeVals = arr.map(v => v.window_before_days ?? 0)
            const afterVals = arr.map(v => v.window_after_days ?? 0)
            const minBefore = Math.min(...beforeVals)
            const maxAfter = Math.max(...afterVals)
            return [s.id, `−${minBefore} to +${maxAfter} days · ${arr.length} visits`] as const
          } catch {
            return [s.id, 'No visit schedules'] as const
          }
        }))
        const map: Record<string, string> = {}
        for (const [id, summary] of entries) map[id] = summary
        setWindowSummaries(map)
      } catch {
        // best-effort; ignore errors
      }
    }
    loadSummaries()
  }, [studies, page])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-400 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading studies...</p>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Studies</h1>
            <p className="text-gray-300">Manage your clinical research studies</p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 hover:scale-105 text-white px-6 py-3 rounded-lg font-semibold transition-all hover:shadow-xl border border-blue-500"
          >
            Add New Study
          </button>
        </div>

        {studies.length === 0 ? (
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Studies Yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first study to start managing clinical research coordination workflows.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-gradient-to-br from-purple-500 to-purple-700 hover:scale-105 text-white px-8 py-3 rounded-lg font-semibold transition-all hover:shadow-xl"
            >
              Create First Study
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            {studies.slice((page-1)*pageSize, (page-1)*pageSize + pageSize).map((study) => (
              <div key={study.id} className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:scale-[1.02] transition-transform hover:shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">{study.study_title}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(study.status)}`}>
                        {getStatusLabel(study.status)}
                      </span>
                    </div>
                    <p className="text-blue-400 font-mono text-sm mb-1 flex items-center gap-2">
                      <span>Protocol: {study.protocol_number}</span>
                      <button
                        type="button"
                        className="text-blue-300 hover:text-blue-200"
                        title="Copy protocol number"
                        onClick={async (e) => {
                          e.preventDefault();
                          try { await navigator.clipboard.writeText(String(study.protocol_number || '')) } catch {}
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h8a2 2 0 002-2v-6M8 16l-2 2m0 0l2 2m-2-2h6" />
                        </svg>
                      </button>
                    </p>
                    {Boolean(study.protocol_version) && (
                      <p className="text-blue-300 font-mono text-xs mb-2">Version: {study.protocol_version}</p>
                    )}
                    {study.sponsor && (
                      <p className="text-gray-300 text-sm mb-1">Sponsor: {study.sponsor}</p>
                    )}
                    {study.principal_investigator && (
                      <p className="text-gray-300 text-sm mb-1">PI: {study.principal_investigator}</p>
                    )}
                    {study.phase && (
                      <p className="text-gray-300 text-sm">Phase: {study.phase}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-400 mb-2">
                      Target Enrollment: {study.target_enrollment || 'Not set'}
                    </div>
                    <div className="text-sm text-gray-400">
                      Dosing: {getDosingLabel(study.dosing_frequency)}
                    </div>
                    <div className="text-xs text-gray-500 mt-2" title={new Date(study.updated_at).toLocaleString()}>
                      Last updated: {timeAgo(study.updated_at)}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                  <div className="flex space-x-4 text-sm text-gray-400">
                    <span>Compliance: {study.compliance_threshold}%</span>
                    <span>Visit Windows: {windowSummaries[study.id] || 'Loading...'}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setSelectedStudyForSoE(study)}
                      className="text-purple-400 hover:text-purple-300 px-3 py-1 rounded transition-colors font-medium"
                    >
                      Schedule of Events
                    </button>
                    <button 
                      className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded transition-colors"
                      onClick={() => setShowDetailsStudy(study)}
                    >
                      View Details
                    </button>
                    <button 
                      className="text-green-400 hover:text-green-300 px-3 py-1 rounded transition-colors"
                      onClick={() => setEditingStudy(study)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {studies.length > pageSize && (
          <div className="flex justify-between items-center mt-6">
            <div className="text-sm text-gray-400">
              Page {page} of {Math.ceil(studies.length / pageSize)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-700/50 border border-gray-600 text-gray-200 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(studies.length / pageSize), p + 1))}
                disabled={page >= Math.ceil(studies.length / pageSize)}
                className="px-3 py-1 bg-gray-700/50 border border-gray-600 text-gray-200 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Schedule of Events Builder Modal */}
        {selectedStudyForSoE && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-2xl w-full max-w-7xl my-8">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Schedule of Events</h2>
                    <p className="text-gray-300">
                      {selectedStudyForSoE.study_title} ({selectedStudyForSoE.protocol_number})
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedStudyForSoE(null)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <ScheduleOfEventsBuilder
                  study={selectedStudyForSoE}
                  onSave={() => {
                    // Optionally close the modal after save
                    // setSelectedStudyForSoE(null)
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Add Study Form Modal */}
        {showAddForm && (
          <AddStudyForm
            onClose={() => setShowAddForm(false)}
            onSuccess={handleStudyAdded}
          />
        )}

        {/* Study Details Modal */}
        {showDetailsStudy && (
          <StudyDetailsModal 
            studyId={showDetailsStudy.id}
            onClose={() => setShowDetailsStudy(null)}
          />
        )}

        {/* Edit Study Modal */}
        {editingStudy && (
          <EditStudyForm
            study={editingStudy}
            onClose={() => setEditingStudy(null)}
            onSuccess={() => {
              setEditingStudy(null)
              handleStudyAdded()
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
