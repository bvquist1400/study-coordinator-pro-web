'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { type User } from '@supabase/supabase-js'
import { type Study } from '@/types/database'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import AddStudyForm from '@/components/studies/AddStudyForm'

export default function StudiesPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [studies, setStudies] = useState<Study[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    async function loadStudies() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        
        if (userError || !userData.user) {
          router.push('/login')
          return
        }
        
        setUser(userData.user)

        // Load user's studies
        const { data: studiesData, error: studiesError } = await supabase
          .from('studies')
          .select('*')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })

        if (studiesError) {
          console.error('Error loading studies:', studiesError)
        } else {
          setStudies(studiesData || [])
        }
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStudies()
  }, [router])

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
          .eq('user_id', userData.user.id)
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
            {studies.map((study) => (
              <div key={study.id} className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:scale-[1.02] transition-transform hover:shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">{study.study_title}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(study.status)}`}>
                        {getStatusLabel(study.status)}
                      </span>
                    </div>
                    <p className="text-blue-400 font-mono text-sm mb-2">Protocol: {study.protocol_number}</p>
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
                      Dosing: {study.dosing_frequency}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                  <div className="flex space-x-4 text-sm text-gray-400">
                    <span>Compliance: {study.compliance_threshold}%</span>
                    <span>Visit Window: ±{study.visit_window_days} days</span>
                  </div>
                  <div className="flex space-x-2">
                    <button className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded transition-colors">
                      View Details
                    </button>
                    <button className="text-green-400 hover:text-green-300 px-3 py-1 rounded transition-colors">
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Study Form Modal */}
        {showAddForm && (
          <AddStudyForm
            onClose={() => setShowAddForm(false)}
            onSuccess={handleStudyAdded}
          />
        )}
      </div>
    </DashboardLayout>
  )
}