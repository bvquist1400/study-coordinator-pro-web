'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import ComplianceDashboard from '@/components/compliance/ComplianceDashboard'

interface Study {
  id: string
  study_title: string
  protocol_number: string
}

function CompliancePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>('')
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Get initial values from URL params
  useEffect(() => {
    const studyId = searchParams.get('studyId')
    const subjectId = searchParams.get('subjectId')
    
    if (studyId) setSelectedStudyId(studyId)
    if (subjectId) setSelectedSubjectId(subjectId)
  }, [searchParams])

  useEffect(() => {
    loadStudies()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadStudies = async () => {
    try {
      const response = await fetch('/api/studies', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_auth_token')}`
        }
      })

      if (response.ok) {
        const { studies } = await response.json()
        setStudies(studies || [])
        
        // Auto-select first study if none selected and studies available
        if (!selectedStudyId && studies && studies.length > 0) {
          setSelectedStudyId(studies[0].id)
        }
      }
    } catch (error) {
      console.error('Error loading studies:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStudyChange = (studyId: string) => {
    setSelectedStudyId(studyId)
    setSelectedSubjectId('') // Reset subject when study changes
    
    // Update URL without page reload
    const params = new URLSearchParams()
    if (studyId) params.set('studyId', studyId)
    router.push(`/compliance?${params.toString()}`, { scroll: false })
  }

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId)
    
    // Update URL without page reload
    const params = new URLSearchParams()
    if (selectedStudyId) params.set('studyId', selectedStudyId)
    if (subjectId) params.set('subjectId', subjectId)
    router.push(`/compliance?${params.toString()}`, { scroll: false })
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Page Header with Controls */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Compliance Analysis</h1>
              <p className="text-gray-600">Monitor drug and visit compliance across your studies</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Study Selector */}
              <div>
                <label htmlFor="study-select" className="sr-only">Select Study</label>
                <select
                  id="study-select"
                  value={selectedStudyId}
                  onChange={(e) => handleStudyChange(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  <option value="">Select a study...</option>
                  {studies.map((study) => (
                    <option key={study.id} value={study.id}>
                      {study.protocol_number} - {study.study_title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject ID Input */}
              <div>
                <label htmlFor="subject-input" className="sr-only">Subject ID</label>
                <input
                  id="subject-input"
                  type="text"
                  placeholder="Subject ID (optional)"
                  value={selectedSubjectId}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              {/* Clear Filters */}
              {(selectedStudyId || selectedSubjectId) && (
                <button
                  onClick={() => {
                    setSelectedStudyId('')
                    setSelectedSubjectId('')
                    router.push('/compliance', { scroll: false })
                  }}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          {selectedStudyId ? (
            <ComplianceDashboard
              studyId={selectedStudyId}
              subjectId={selectedSubjectId || undefined}
            />
          ) : (
            /* No Study Selected State */
            <div className="p-6">
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 48 48">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="mt-2 text-lg font-medium text-gray-900">No study selected</h3>
                <p className="mt-1 text-gray-500">
                  Choose a study from the dropdown above to view compliance data.
                </p>
                {studies.length === 0 && (
                  <p className="mt-2 text-sm text-gray-400">
                    No studies found. Create a study first to analyze compliance.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function CompliancePage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    }>
      <CompliancePageContent />
    </Suspense>
  )
}