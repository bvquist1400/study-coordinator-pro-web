'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import VisitSummaryCards from '@/components/visits/VisitSummaryCards'
import VisitCalendarView from '@/components/visits/VisitCalendarView'
import VisitListView from '@/components/visits/VisitListView'
import VisitDetailModal from '@/components/visits/VisitDetailModal'
import ScheduleVisitModal from '@/components/visits/ScheduleVisitModal'
import { useSite } from '@/components/site/SiteProvider'

interface Study {
  id: string
  protocol_number: string
  study_title: string
}

type ViewMode = 'calendar' | 'list'

export default function VisitsPage() {
  const searchParams = useSearchParams()
  const initialDate = searchParams?.get('date') || undefined
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>('')
  const [userId, setUserId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('visits:viewMode') as ViewMode | null
      if (v === 'calendar' || v === 'list') return v
    }
    return 'list'
  })
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const { currentSiteId } = useSite()

  // Load studies on mount
  const loadStudies = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) setUserId(user.id)
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const { studies } = await response.json()
        setStudies(studies)
        // Prefer stored selection per user + site, else first study
        try {
          const key = `visits:selectedStudyId:${(user?.id)||'anon'}:${currentSiteId||'all'}`
          const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null
          const exists = stored && (studies || []).some((s: { id: string }) => s.id === stored)
          if (exists) {
            setSelectedStudyId(stored as string)
          } else if (studies.length > 0 && !selectedStudyId) {
            setSelectedStudyId(studies[0].id)
          }
        } catch {
          if (studies.length > 0 && !selectedStudyId) {
            setSelectedStudyId(studies[0].id)
          }
        }
      }
    } catch (error) {
      console.error('Error loading studies:', error)
    } finally {
      setLoading(false)
    }
  }, [currentSiteId, selectedStudyId])

  useEffect(() => {
    loadStudies()
  }, [loadStudies])

  // Persist view mode to localStorage (generic and per-user if available)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('visits:viewMode', viewMode)
        if (userId) {
          localStorage.setItem(`visits:viewMode:${userId}`, viewMode)
        }
      }
    } catch {}
  }, [viewMode, userId])

  // When userId becomes available, prefer per-user stored preference if set
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    try {
      const perUser = localStorage.getItem(`visits:viewMode:${userId}`) as ViewMode | null
      if (perUser === 'calendar' || perUser === 'list') {
        setViewMode(perUser)
      } else {
        // initialize per-user with current value
        localStorage.setItem(`visits:viewMode:${userId}`, viewMode)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Persist selected study per user + site
  useEffect(() => {
    if (!selectedStudyId) return
    try {
      const key = `visits:selectedStudyId:${userId||'anon'}:${currentSiteId||'all'}`
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, selectedStudyId)
      }
    } catch {}
  }, [selectedStudyId, userId, currentSiteId])

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleVisitClick = (visitId: string) => {
    setSelectedVisitId(visitId)
  }

  const handleCloseModals = () => {
    setSelectedVisitId(null)
    setShowScheduleModal(false)
  }

  const handleScheduleComplete = () => {
    handleCloseModals()
    handleRefresh()
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-700 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-700 rounded"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Visit Management</h1>
            <p className="text-gray-400 mt-1">Schedule and track subject visits</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Study Selector */}
            <select
              value={selectedStudyId}
              onChange={(e) => setSelectedStudyId(e.target.value)}
              className="px-4 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={studies.length === 0}
            >
              <option value="">Select Study...</option>
              {studies.map((study) => (
                <option key={study.id} value={study.id}>
                  {study.protocol_number} - {study.study_title}
                </option>
              ))}
            </select>

            {/* View Toggle */}
            <div className="flex bg-gray-700/30 rounded-lg p-1">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                List
              </button>
            </div>

            {/* Schedule Visit Button */}
            <button
              onClick={() => setShowScheduleModal(true)}
              disabled={!selectedStudyId}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Schedule Visit</span>
            </button>
          </div>
        </div>

        {/* No Study Selected State */}
        {!selectedStudyId ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4l6 6m0-6l-6 6" />
              </svg>
              <p className="text-lg">Select a study to view visits</p>
              <p className="text-sm mt-2">Choose a study from the dropdown above to start managing visits</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <VisitSummaryCards 
              studyId={selectedStudyId} 
              refreshKey={refreshKey}
            />

            {/* Main Content */}
            {viewMode === 'calendar' ? (
              <VisitCalendarView
                studyId={selectedStudyId}
                onVisitClick={handleVisitClick}
                refreshKey={refreshKey}
                initialDate={initialDate}
              />
            ) : (
              <VisitListView
                studyId={selectedStudyId}
                onVisitClick={handleVisitClick}
                refreshKey={refreshKey}
              />
            )}
          </>
        )}

        {/* Modals */}
        {selectedVisitId && (
          <VisitDetailModal
            visitId={selectedVisitId}
            onClose={handleCloseModals}
            onUpdate={handleRefresh}
          />
        )}

        {showScheduleModal && (
          <ScheduleVisitModal
            studyId={selectedStudyId}
            onClose={handleCloseModals}
            onSchedule={handleScheduleComplete}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
