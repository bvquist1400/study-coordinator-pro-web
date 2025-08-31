'use client'

import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { type User } from '@supabase/supabase-js'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import InventoryAlerts from '@/components/lab-kits/InventoryAlerts'

interface DebugInfo {
  code?: string
  message?: string
  details?: string
  hint?: string
  error?: string
  type?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [hasDatabase, setHasDatabase] = useState(true)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingCards, setLoadingCards] = useState(true)

  // Summary metrics
  const [studiesCount, setStudiesCount] = useState(0)
  const [subjectsCount, setSubjectsCount] = useState(0)
  const [upcomingVisits, setUpcomingVisits] = useState(0)
  const [overdueVisits, setOverdueVisits] = useState(0)
  const [studyStatusCounts, setStudyStatusCounts] = useState({
    enrolling: 0,
    active: 0,
    closed_to_enrollment: 0,
    completed: 0
  })
  const [timingCompliance, setTimingCompliance] = useState<{ rate: number; window: string }>({ rate: 0, window: '30d' })
  const [drugComplianceRate, setDrugComplianceRate] = useState<{ rate: number; window: string }>({ rate: 0, window: '30d' })

  // Activity and alerts
  const [recentActivity, setRecentActivity] = useState<Array<{ id: string; visit_name: string; status: string; updated_at: string }>>([])
  const [complianceAlerts, setComplianceAlerts] = useState<Array<{ id: string; visit_name: string; updated_at: string }>>([])
  const [calendarStrip, setCalendarStrip] = useState<Array<{ date: string; count: number }>>([])

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

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoadingCards(true)
        // Studies count
        const { data: studiesData } = await supabase
          .from('studies')
          .select('id, status')
        setStudiesCount(studiesData?.length || 0)
        if (studiesData && studiesData.length > 0) {
          const counts = { enrolling: 0, active: 0, closed_to_enrollment: 0, completed: 0 }
          studiesData.forEach(s => {
            const st = (s as any).status as string
            if (st in counts) (counts as any)[st] += 1
          })
          setStudyStatusCounts(counts)
        } else {
          setStudyStatusCounts({ enrolling: 0, active: 0, closed_to_enrollment: 0, completed: 0 })
        }

        // Subjects count
        const { data: subjects } = await supabase
          .from('subjects')
          .select('id')
        setSubjectsCount(subjects?.length || 0)

        // Upcoming and overdue visits (7-day window for upcoming)
        const today = new Date()
        const week = new Date(); week.setDate(today.getDate() + 7)
        const toISO = (d: Date) => {
          const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const da = String(d.getDate()).padStart(2,'0')
          return `${y}-${m}-${da}`
        }
        const { data: upcoming } = await supabase
          .from('subject_visits')
          .select('id')
          .eq('status', 'scheduled')
          .gte('visit_date', toISO(today))
          .lte('visit_date', toISO(week))
        setUpcomingVisits(upcoming?.length || 0)

        // Build 7-day calendar strip counts (scheduled visits only)
        const end6 = new Date(); end6.setDate(today.getDate() + 6)
        const { data: cal } = await supabase
          .from('subject_visits')
          .select('id, visit_date')
          .eq('status', 'scheduled')
          .gte('visit_date', toISO(today))
          .lte('visit_date', toISO(end6))
        const days: Array<{ date: string; count: number }> = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(today)
          d.setDate(today.getDate() + i)
          days.push({ date: toISO(d), count: 0 })
        }
        if (cal && cal.length > 0) {
          const map: Record<string, number> = {}
          for (const v of cal as any[]) {
            const part = String(v.visit_date || '').split('T')[0]
            map[part] = (map[part] || 0) + 1
          }
          for (const d of days) {
            d.count = map[d.date] || 0
          }
        }
        setCalendarStrip(days)

        const { data: overdue } = await supabase
          .from('subject_visits')
          .select('id')
          .eq('status', 'scheduled')
          .lt('visit_date', toISO(today))
        setOverdueVisits(overdue?.length || 0)

        // Recent activity: latest 5 updated visits
        const { data: ra } = await supabase
          .from('subject_visits')
          .select('id, visit_name, status, updated_at')
          .order('updated_at', { ascending: false })
          .limit(5)
        setRecentActivity(ra || [])

        // Compliance alerts: completed but out-of-window in last 14 days
        const twoWeeks = new Date(); twoWeeks.setDate(today.getDate() - 14)
        const { data: alerts } = await supabase
          .from('subject_visits')
          .select('id, visit_name, updated_at')
          .eq('status', 'completed')
          .eq('is_within_window', false)
          .gte('updated_at', new Date(twoWeeks).toISOString())
          .order('updated_at', { ascending: false })
          .limit(5)
        setComplianceAlerts(alerts || [])

        // Timing compliance snapshot: last 30 days
        const thirty = new Date(); thirty.setDate(today.getDate() - 30)
        const { data: recentCompleted } = await supabase
          .from('subject_visits')
          .select('id, is_within_window, updated_at')
          .eq('status', 'completed')
          .gte('updated_at', thirty.toISOString())
        if (recentCompleted && recentCompleted.length > 0) {
          const total = recentCompleted.length
          const inWin = recentCompleted.filter(v => (v as any).is_within_window === true).length
          const rate = Math.round((inWin / total) * 100)
          setTimingCompliance({ rate, window: '30d' })
        } else {
          setTimingCompliance({ rate: 0, window: '30d' })
        }

        // Drug compliance snapshot: last 30 days average percentage
        const { data: dcRows } = await supabase
          .from('drug_compliance')
          .select('dispensed_count, returned_count, expected_taken, compliance_percentage, updated_at')
          .gte('updated_at', thirty.toISOString())
        if (dcRows && dcRows.length > 0) {
          let sum = 0
          let count = 0
          for (const r of dcRows as any[]) {
            let pct: number | null = r.compliance_percentage
            if (pct === null || typeof pct === 'undefined') {
              const expected = Number(r.expected_taken) || 0
              const disp = Number(r.dispensed_count) || 0
              const ret = Number(r.returned_count) || 0
              const actual = Math.max(0, disp - ret)
              pct = expected > 0 ? Math.min(100, Math.max(0, (actual / expected) * 100)) : null
            }
            if (typeof pct === 'number' && !isNaN(pct)) { sum += pct; count += 1 }
          }
          setDrugComplianceRate({ rate: count > 0 ? Math.round((sum / count)) : 0, window: '30d' })
        } else {
          setDrugComplianceRate({ rate: 0, window: '30d' })
        }
      } finally {
        setLoadingCards(false)
      }
    }
    loadDashboardData()
  }, [])

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

        {/* Quick Actions */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl">
          <div className="px-6 py-6 sm:p-8">
            <h3 className="text-xl font-bold text-white mb-6">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  backgroundColor: '#2563eb',
                  borderColor: '#3b82f6'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                onClick={() => router.push('/studies')}
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
                onClick={() => router.push('/subjects')}
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
                onClick={() => router.push('/visits')}
              >
                <span className="relative z-10">Schedule Visit</span>
              </button>
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  background: 'linear-gradient(to bottom right, #a855f7, #7c3aed)',
                  borderColor: '#c084fc'
                }}
                onClick={() => router.push('/compliance')}
              >
                <span className="relative z-10">Check Compliance</span>
              </button>
              <button 
                className="relative overflow-hidden text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl border shadow-lg group"
                style={{ 
                  background: 'linear-gradient(to bottom right, #059669, #10b981)',
                  borderColor: '#34d399'
                }}
                onClick={() => router.push('/analytics')}
              >
                <span className="relative z-10">View Analytics</span>
              </button>
            </div>
          </div>
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


        {/* Calendar Strip: Next 7 Days */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Next 7 Days</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {calendarStrip.map(({ date, count }) => {
              const dt = new Date(date)
              const day = dt.toLocaleDateString(undefined, { weekday: 'short' })
              const label = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              const highlight = count > 0
              return (
                <button
                  key={date}
                  onClick={() => router.push(`/visits?date=${date}`)}
                  className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                    highlight
                      ? 'border-blue-600/50 bg-blue-900/20 hover:bg-blue-900/30 text-blue-200'
                      : 'border-gray-700 bg-gray-700/20 hover:bg-gray-700/30 text-gray-200'
                  }`}
                  title={`Go to visits on ${label}`}
                >
                  <div className="text-xs uppercase opacity-75">{day}</div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className={`mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs border ${
                    highlight ? 'border-blue-500 text-blue-300' : 'border-gray-600 text-gray-300'
                  }`}>
                    {count} visit{count === 1 ? '' : 's'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Study Overview + Compliance Snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Study Overview */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Study Overview</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center justify-between bg-gray-700/30 border border-gray-700 rounded-lg px-3 py-2">
                <span className="text-gray-300">Enrolling</span>
                <span className="text-blue-300 font-semibold">{loadingCards ? '…' : studyStatusCounts.enrolling}</span>
              </div>
              <div className="flex items-center justify-between bg-gray-700/30 border border-gray-700 rounded-lg px-3 py-2">
                <span className="text-gray-300">Active</span>
                <span className="text-green-300 font-semibold">{loadingCards ? '…' : studyStatusCounts.active}</span>
              </div>
              <div className="flex items-center justify-between bg-gray-700/30 border border-gray-700 rounded-lg px-3 py-2">
                <span className="text-gray-300">Closed to Enrollment</span>
                <span className="text-orange-300 font-semibold">{loadingCards ? '…' : studyStatusCounts.closed_to_enrollment}</span>
              </div>
              <div className="flex items-center justify-between bg-gray-700/30 border border-gray-700 rounded-lg px-3 py-2">
                <span className="text-gray-300">Completed</span>
                <span className="text-gray-300 font-semibold">{loadingCards ? '…' : studyStatusCounts.completed}</span>
              </div>
            </div>
          </div>

          {/* Compliance Snapshot */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Compliance Snapshot</h3>
            <p className="text-xs text-gray-400 mb-4">Last {timingCompliance.window}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-center gap-4">
                <div className="text-4xl sm:text-5xl font-bold text-white">{loadingCards ? '…' : `${timingCompliance.rate}%`}</div>
                <div className="text-sm text-gray-300">
                  <div className="font-medium">Visit timing</div>
                  {timingCompliance.rate >= 90 && 'Excellent adherence'}
                  {timingCompliance.rate < 90 && timingCompliance.rate >= 75 && 'Good adherence'}
                  {timingCompliance.rate < 75 && 'Needs attention'}
                  <div className="text-xs text-gray-500 mt-1">Completed within window</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-4xl sm:text-5xl font-bold text-white">{loadingCards ? '…' : `${drugComplianceRate.rate}%`}</div>
                <div className="text-sm text-gray-300">
                  <div className="font-medium">Drug compliance</div>
                  {drugComplianceRate.rate >= 90 && 'Excellent adherence'}
                  {drugComplianceRate.rate < 90 && drugComplianceRate.rate >= 75 && 'Good adherence'}
                  {drugComplianceRate.rate < 75 && 'Needs attention'}
                  <div className="text-xs text-gray-500 mt-1">IP Accountability</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lab Kit Inventory Alerts */}
          <InventoryAlerts />

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
            <h4 className="text-lg font-semibold text-white mb-4">Alerts</h4>
            <div className="text-sm text-gray-300 mb-3">Overdue scheduled visits: {loadingCards ? '…' : overdueVisits}</div>
            {complianceAlerts.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No compliance issues in last 14 days</div>
            ) : (
              <ul className="divide-y divide-gray-700">
                {complianceAlerts.map(a => (
                  <li key={a.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-gray-100 text-sm">{a.visit_name}</div>
                      <div className="text-xs text-gray-500">{new Date(a.updated_at).toLocaleString()}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded border border-yellow-600 text-yellow-300">OOW</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
