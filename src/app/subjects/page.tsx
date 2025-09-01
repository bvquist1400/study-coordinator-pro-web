'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSite } from '@/components/site/SiteProvider'
import { supabase } from '@/lib/supabase/client'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import SubjectList from '@/components/subjects/SubjectList'
import AddSubjectForm from '@/components/subjects/AddSubjectForm'
import EditSubjectForm from '@/components/subjects/EditSubjectForm'
import SubjectDetailModal from '@/components/subjects/SubjectDetailModal'
import ScheduleVisitModal from '@/components/visits/ScheduleVisitModal'

import type { Study } from '@/types/database'

function SubjectsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSiteId } = useSite()
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingSubjectId, setEditingSubjectId] = useState<string>('')
  const [viewingSubjectId, setViewingSubjectId] = useState<string>('')
  const [schedulingSubjectId, setSchedulingSubjectId] = useState<string>('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Get initial values from URL params
  useEffect(() => {
    const studyId = searchParams.get('studyId')
    if (studyId) setSelectedStudyId(studyId)
  }, [searchParams])

  const loadStudies = useCallback(async () => {
    try {
      // Get the auth session
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!session?.user) {
        console.error('No authenticated user')
        setLoading(false)
        return
      }

      // Try API first
      if (token) {
        try {
          const response = await fetch(currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })

          if (response.ok) {
            const { studies } = await response.json()
            setStudies(studies || [])
            
            // Auto-select first study if none selected
            if (!selectedStudyId && studies && studies.length > 0) {
              const firstStudyId = studies[0].id
              setSelectedStudyId(firstStudyId)
              // Update URL
              const params = new URLSearchParams()
              params.set('studyId', firstStudyId)
              router.push(`/subjects?${params.toString()}`, { scroll: false })
            }
            setLoading(false)
            return
          }
        } catch (apiError) {
          console.warn('API error, trying direct database access:', apiError)
        }
      }

      // Fallback: Direct database access
      const { data: studies, error } = await supabase
        .from('studies')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Database error:', error)
      } else {
        const filtered = currentSiteId ? (studies || []).filter((s: { site_id: string | null }) => s.site_id === currentSiteId) : (studies || [])
        setStudies(filtered)
        
        // Auto-select first study if none selected
        if (!selectedStudyId && filtered && filtered.length > 0) {
          const firstStudyId = filtered[0].id
          setSelectedStudyId(firstStudyId)
          // Update URL
          const params = new URLSearchParams()
          params.set('studyId', firstStudyId)
          router.push(`/subjects?${params.toString()}`, { scroll: false })
        }
      }

    } catch (error) {
      console.error('Error loading studies:', error)
    } finally {
      setLoading(false)
    }
  }, [currentSiteId, selectedStudyId, router])

  useEffect(() => {
    loadStudies()
  }, [loadStudies])


  const handleStudyChange = (studyId: string) => {
    setSelectedStudyId(studyId)
    
    // Update URL without page reload
    const params = new URLSearchParams()
    if (studyId) params.set('studyId', studyId)
    router.push(`/subjects?${params.toString()}`, { scroll: false })
  }

  const handleSubjectAdded = () => {
    setShowAddForm(false)
    setRefreshKey(prev => prev + 1)
  }

  const handleSubjectClick = (subjectId: string) => {
    setViewingSubjectId(subjectId)
    setShowDetailModal(true)
  }

  const handleScheduleVisit = (subjectId: string) => {
    setSchedulingSubjectId(subjectId)
    setShowScheduleModal(true)
  }

  // Removed unused handleSubjectEdit

  const handleSubjectUpdated = () => {
    setShowEditForm(false)
    setEditingSubjectId('')
    setRefreshKey(prev => prev + 1)
  }

  const handleDetailModalClose = () => {
    setShowDetailModal(false)
    setViewingSubjectId('')
  }

  const handleScheduleModalClose = () => {
    setShowScheduleModal(false)
    setSchedulingSubjectId('')
  }

  const handleVisitScheduled = () => {
    setShowScheduleModal(false)
    setSchedulingSubjectId('')
    setRefreshKey(prev => prev + 1)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded mb-4"></div>
            <div className="h-32 bg-gray-700 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-black">
        {/* Page Header with Controls */}
        <div className="bg-gray-800/50 border-b border-gray-700 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Subject Management</h1>
              <p className="text-gray-300">Enroll and manage study subjects</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Add Subject Button */}
              {selectedStudyId && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add Subject</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Study Selection Buttons */}
        {studies.length > 0 && (
          <div className="border-b border-gray-700 bg-gray-800/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Studies:</span>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {studies.map((study) => (
                  <button
                    key={study.id}
                    onClick={() => handleStudyChange(study.id)}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200 ${
                      selectedStudyId === study.id
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-semibold">{study.protocol_number}</span>
                      <span className="text-xs opacity-75 truncate max-w-48">{study.study_title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          {selectedStudyId ? (
            <SubjectList
              studyId={selectedStudyId}
              onSubjectClick={handleSubjectClick}
              onScheduleVisit={handleScheduleVisit}
              refreshKey={refreshKey}
            />
          ) : studies.length === 0 ? (
            /* No Studies Available State */
            <div className="p-6">
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-500">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 48 48">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="mt-2 text-lg font-medium text-white">No studies available</h3>
                <p className="mt-1 text-gray-400">
                  Create a study first to start enrolling subjects.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Add Subject Modal */}
        {showAddForm && selectedStudyId && (
          <AddSubjectForm
            studyId={selectedStudyId}
            onClose={() => setShowAddForm(false)}
            onSave={handleSubjectAdded}
          />
        )}

        {/* Edit Subject Modal */}
        {showEditForm && editingSubjectId && selectedStudyId && (
          <EditSubjectForm
            subjectId={editingSubjectId}
            studyId={selectedStudyId}
            onClose={() => {
              setShowEditForm(false)
              setEditingSubjectId('')
            }}
            onSave={handleSubjectUpdated}
          />
        )}

        {/* Subject Detail Modal */}
        {showDetailModal && viewingSubjectId && selectedStudyId && (
          <SubjectDetailModal
            subjectId={viewingSubjectId}
            studyId={selectedStudyId}
            isOpen={showDetailModal}
            onClose={handleDetailModalClose}
          />
        )}

        {/* Schedule Visit Modal */}
        {showScheduleModal && (
          <ScheduleVisitModal
            studyId={selectedStudyId}
            preSelectedSubjectId={schedulingSubjectId}
            allowStudySelection={true}
            onClose={handleScheduleModalClose}
            onSchedule={handleVisitScheduled}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default function SubjectsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded mb-4"></div>
            <div className="h-32 bg-gray-700 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    }>
      <SubjectsPageContent />
    </Suspense>
  )
}
