'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

interface EnrollmentTrend {
  month: string
  enrolled: number
  cumulative: number
}

interface StudyEnrollment {
  study_id: string
  protocol_number: string
  study_title: string
  target_enrollment: number | null
  actual_enrollment: number
  enrollment_rate: number
  start_date: string | null
}

interface EnrollmentSummary {
  totalEnrolled: number
  totalTarget: number
  overallRate: number
  activeStudies: number
}

interface EnrollmentAnalyticsProps {
  studyId?: string
  className?: string
}

export default function EnrollmentAnalytics({ studyId, className }: EnrollmentAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [trends, setTrends] = useState<EnrollmentTrend[]>([])
  const [studyBreakdown, setStudyBreakdown] = useState<StudyEnrollment[]>([])
  const [summary, setSummary] = useState<EnrollmentSummary>({
    totalEnrolled: 0,
    totalTarget: 0,
    overallRate: 0,
    activeStudies: 0
  })
  const [months, setMonths] = useState(12)
  const [error, setError] = useState<string | null>(null)

  const fetchEnrollmentData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({ months: months.toString() })
      if (studyId) params.append('studyId', studyId)
      
      // Include bearer token to align with API auth
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const response = await fetch(`/api/analytics/enrollment?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch enrollment data')
      }
      
      const data = await response.json()
      setTrends(data.trends || [])
      setStudyBreakdown(data.studyBreakdown || [])
      setSummary(data.summary || {})
      
    } catch (error) {
      console.error('Error fetching enrollment analytics:', error)
      setError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [studyId, months])

  useEffect(() => {
    fetchEnrollmentData()
  }, [fetchEnrollmentData])

  const getRateColor = (rate: number) => {
    if (rate >= 80) return '#22c55e'
    if (rate >= 60) return '#eab308'
    return '#ef4444'
  }

  const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#f59e0b']

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="h-4 bg-gray-700 rounded w-20"></div>
                <div className="h-8 bg-gray-700 rounded w-16"></div>
              </div>
            ))}
          </div>
          <div className="h-80 bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${className} text-center py-8`}>
        <div className="text-red-400 mb-2">Error loading enrollment analytics</div>
        <div className="text-gray-400 text-sm">{error}</div>
        <button
          onClick={fetchEnrollmentData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Enrollment Analytics</h2>
        <div className="flex items-center space-x-4">
          <label className="text-sm text-gray-400">Time Range:</label>
          <select
            value={months}
            onChange={(e) => setMonths(parseInt(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Enrolled</div>
          <div className="text-2xl font-bold text-white">{summary.totalEnrolled}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Target Enrollment</div>
          <div className="text-2xl font-bold text-white">{summary.totalTarget}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Overall Rate</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getRateColor(summary.overallRate) }}
          >
            {summary.overallRate}%
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Active Studies</div>
          <div className="text-2xl font-bold text-white">{summary.activeStudies}</div>
        </div>
      </div>

      {/* Enrollment Trends Chart */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Enrollment Trends</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="month" 
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '6px',
                  color: '#f3f4f6'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="enrolled" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Monthly Enrollment"
                dot={{ fill: '#3b82f6', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="cumulative" 
                stroke="#22c55e" 
                strokeWidth={2}
                name="Cumulative Enrollment"
                dot={{ fill: '#22c55e', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Study Breakdown */}
      {studyBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Study Enrollment Comparison */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Enrollment by Study</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="protocol_number" 
                    stroke="#9ca3af"
                    fontSize={10}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6'
                    }}
                    formatter={(value, name) => [
                      `${value} subjects`,
                      name === 'actual_enrollment' ? 'Enrolled' : 'Target'
                    ]}
                  />
                  <Bar dataKey="target_enrollment" fill="#6b7280" name="Target" />
                  <Bar dataKey="actual_enrollment" fill="#3b82f6" name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Enrollment Rate Distribution */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Enrollment Rate Distribution</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={studyBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="actual_enrollment"
                    nameKey="protocol_number"
                    label={({ protocol_number, enrollment_rate }) => 
                      `${protocol_number}: ${enrollment_rate}%`
                    }
                  >
                    {studyBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6'
                    }}
                    formatter={(value) => [`${value} subjects`, 'Enrolled']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Study Details Table */}
      {studyBreakdown.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Study Performance Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300">Protocol</th>
                  <th className="text-left py-3 px-4 text-gray-300">Study Title</th>
                  <th className="text-right py-3 px-4 text-gray-300">Target</th>
                  <th className="text-right py-3 px-4 text-gray-300">Enrolled</th>
                  <th className="text-right py-3 px-4 text-gray-300">Rate</th>
                  <th className="text-left py-3 px-4 text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody>
                {studyBreakdown.map((study) => (
                  <tr key={study.study_id} className="border-b border-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{study.protocol_number}</td>
                    <td className="py-3 px-4 text-gray-300">{study.study_title}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{study.target_enrollment || 'N/A'}</td>
                    <td className="py-3 px-4 text-right text-white font-medium">{study.actual_enrollment}</td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getRateColor(study.enrollment_rate) }}
                      >
                        {study.enrollment_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span 
                        className="px-2 py-1 rounded text-xs"
                        style={{ 
                          backgroundColor: getRateColor(study.enrollment_rate) + '20',
                          color: getRateColor(study.enrollment_rate)
                        }}
                      >
                        {study.enrollment_rate >= 80 ? 'On Track' : 
                         study.enrollment_rate >= 60 ? 'Behind' : 'Critical'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
