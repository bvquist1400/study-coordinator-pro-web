'use client'

import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [hasDatabase, setHasDatabase] = useState(true)
  const [debugInfo, setDebugInfo] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkAuthAndDatabase() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        
        if (userError || !userData.user) {
          router.push('/login')
          return
        }
        
        setUser(userData.user)

        // Test database connection with better error handling
        const { error: dbError } = await supabase
          .from('studies')
          .select('id')
          .limit(1)
        
        if (dbError) {
          setHasDatabase(false)
          setDebugInfo({
            code: dbError.code,
            message: dbError.message,
            details: dbError.details,
            hint: dbError.hint
          })
        }
      } catch (error) {
        setHasDatabase(false)
        setDebugInfo({
          error: error instanceof Error ? error.message : 'Unknown error',
          type: 'catch_block'
        })
      } finally {
        setIsLoading(false)
      }
    }

    checkAuthAndDatabase()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-400 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {user?.email?.split('@')[0] || 'User'}
          </h1>
          <p className="text-gray-300">
            Your clinical research coordination dashboard
          </p>
        </div>

        {!hasDatabase && (
          <div className="bg-red-900/20 border border-red-700 rounded-2xl p-6">
            <div className="flex items-start space-x-3">
              <div className="text-red-400 text-2xl">🚨</div>
              <div className="flex-1">
                <h3 className="text-red-400 font-semibold">Database Connection Issue</h3>
                <p className="text-gray-300 mt-1">
                  There&apos;s an issue connecting to the database tables.
                </p>
                {debugInfo && (
                  <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-gray-400 text-xs font-mono">
                      Debug Info: {JSON.stringify(debugInfo, null, 2)}
                    </p>
                  </div>
                )}
                <div className="mt-3 text-sm text-gray-400">
                  <p>Possible causes:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Row Level Security (RLS) policies blocking access</li>
                    <li>Missing user_profiles record</li>
                    <li>Database schema not fully executed</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:scale-105 transition-transform hover:shadow-2xl">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-400 truncate">
                    Active Studies
                  </dt>
                  <dd className="text-2xl font-bold text-white">
                    0
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:scale-105 transition-transform hover:shadow-2xl">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-green-700 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-400 truncate">
                    Active Subjects
                  </dt>
                  <dd className="text-2xl font-bold text-white">
                    0
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:scale-105 transition-transform hover:shadow-2xl">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-400 truncate">
                    Upcoming Visits
                  </dt>
                  <dd className="text-2xl font-bold text-white">
                    0
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl">
          <div className="px-6 py-6 sm:p-8">
            <h3 className="text-xl font-bold text-white mb-6">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  backgroundColor: '#2563eb',
                  borderColor: '#3b82f6'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                <span className="relative z-10">Add Study</span>
              </button>
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  backgroundColor: '#16a34a',
                  borderColor: '#22c55e'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#15803d'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
              >
                <span className="relative z-10">Enroll Subject</span>
              </button>
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  backgroundColor: '#ea580c',
                  borderColor: '#fb923c'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c2410c'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ea580c'}
              >
                <span className="relative z-10">Schedule Visit</span>
              </button>
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  background: 'linear-gradient(to bottom right, #a855f7, #7c3aed)',
                  borderColor: '#c084fc'
                }}
              >
                <span className="relative z-10">Check Compliance</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h4 className="text-lg font-semibold text-white mb-4">Recent Activity</h4>
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-400">No recent activity</p>
              <p className="text-sm text-gray-500 mt-1">Start by adding your first study</p>
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h4 className="text-lg font-semibold text-white mb-4">Compliance Alerts</h4>
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-400">All subjects compliant</p>
              <p className="text-sm text-gray-500 mt-1">No compliance issues detected</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}