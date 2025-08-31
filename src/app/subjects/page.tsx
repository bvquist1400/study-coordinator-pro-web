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
  const [editingSubjectId, setEditingSubjectId] = useState<string>('')
  const [viewingSubjectId, setViewingSubjectId] = useState<string>('')
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
            
            if (!selectedStudyId && studies && studies.length > 0) {
              setSelectedStudyId(studies[0].id)
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
        
        if (!selectedStudyId && studies && studies.length > 0) {
          setSelectedStudyId(studies[0].id)
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

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Study Selector */}
              <div>
                <label htmlFor="study-select" className="sr-only">Select Study</label>
                <select
                  id="study-select"
                  value={selectedStudyId}
                  onChange={(e) => handleStudyChange(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base bg-gray-700/50 border border-gray-600 text-gray-100 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  <option value="">Select a study...</option>
                  {studies.map((study) => (
                    <option key={study.id} value={study.id}>
                      {study.protocol_number} - {study.study_title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Subject Button */}
              {selectedStudyId && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
                >
                  Add Subject
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          {selectedStudyId ? (
            <SubjectList
              studyId={selectedStudyId}
              onSubjectClick={handleSubjectClick}
              refreshKey={refreshKey}
            />
          ) : (
            /* No Study Selected State */
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
                <h3 className="mt-2 text-lg font-medium text-white">No study selected</h3>
                <p className="mt-1 text-gray-400">
                  Choose a study from the dropdown above to manage subjects.
                </p>
                {studies.length === 0 && (
                  <p className="mt-2 text-sm text-gray-500">
                    No studies found. Create a study first to enroll subjects.
                  </p>
                )}
              </div>
            </div>
          )}
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
