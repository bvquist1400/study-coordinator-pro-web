'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts'

interface VisitPerformance {
  month: string
  // legacy fields still returned by API
  scheduled: number
  missed: number
  completion_rate: number
  // primary series for charting
  completed: number
  completed_in_window?: number
  completed_out_window?: number
  in_window_rate?: number
}

interface StudyVisitStats {
  study_id: string
  protocol_number: string
  study_title: string
  total_visits: number
  completed_visits: number
  scheduled_visits: number
  missed_visits: number
  completion_rate: number
  avg_days_to_completion: number
  overdue_visits: number
}

interface VisitTypeBreakdown {
  visit_name: string
  total: number
  completed: number
  completion_rate: number
  avg_duration: number
}

interface VisitSummary {
  totalVisits: number
  completedVisits: number
  scheduledVisits: number
  missedVisits: number
  overdueVisits: number
  overallCompletionRate: number
}

interface VisitAnalyticsProps {
  studyId?: string
  className?: string
}

export default function VisitAnalytics({ studyId, className }: VisitAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [performance, setPerformance] = useState<VisitPerformance[]>([])
  const [studyStats, setStudyStats] = useState<StudyVisitStats[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeBreakdown[]>([])
  const [summary, setSummary] = useState<VisitSummary>({
    totalVisits: 0,
    completedVisits: 0,
    scheduledVisits: 0,
    missedVisits: 0,
    overdueVisits: 0,
    overallCompletionRate: 0
  })
  const [months, setMonths] = useState(12)
  const [error, setError] = useState<string | null>(null)

  const fetchVisitData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({ months: months.toString() })
      if (studyId) params.append('studyId', studyId)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const response = await fetch(`/api/analytics/visits?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch visit data')
      }
      
      const data = await response.json()
      setPerformance(data.performance || [])
      setStudyStats(data.studyStats || [])
      setVisitTypes(data.visitTypes || [])
      setSummary(data.summary || {})
      
    } catch (error) {
      console.error('Error fetching visit analytics:', error)
      setError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [studyId, months])

  useEffect(() => {
    fetchVisitData()
  }, [fetchVisitData])

  const getPerformanceColor = (rate: number) => {
    if (rate >= 90) return '#22c55e'
    if (rate >= 75) return '#eab308'
    if (rate >= 60) return '#f59e0b'
    return '#ef4444'
  }

  // COLORS not used in this chart; removed to reduce warnings

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
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
        <div className="text-red-400 mb-2">Error loading visit analytics</div>
        <div className="text-gray-400 text-sm">{error}</div>
        <button
          onClick={fetchVisitData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Prepare status distribution data for pie chart
  const statusData = [
    { name: 'Completed', value: summary.completedVisits, color: '#22c55e' },
    { name: 'Scheduled', value: summary.scheduledVisits, color: '#3b82f6' },
    { name: 'Missed', value: summary.missedVisits, color: '#ef4444' },
    { name: 'Overdue', value: summary.overdueVisits, color: '#f59e0b' }
  ].filter(item => item.value > 0)

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Visit Analytics</h2>
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
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Visits</div>
          <div className="text-2xl font-bold text-white">{summary.totalVisits}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Completed</div>
          <div className="text-2xl font-bold text-green-400">{summary.completedVisits}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Scheduled</div>
          <div className="text-2xl font-bold text-blue-400">{summary.scheduledVisits}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Missed</div>
          <div className="text-2xl font-bold text-red-400">{summary.missedVisits}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Overdue</div>
          <div className="text-2xl font-bold text-orange-400">{summary.overdueVisits}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Completion Rate</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getPerformanceColor(summary.overallCompletionRate) }}
          >
            {summary.overallCompletionRate}%
          </div>
        </div>
      </div>

      {/* Status Key */}
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-200">Visit Status Key</h4>
          <div className="hidden sm:flex items-center gap-4 text-xs text-gray-300">
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span>Completed</span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Scheduled</span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span>Missed</span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span>Overdue</span>
          </div>
        </div>
      </div>

      {/* Visit Performance Trends */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Visit Performance Trends</h3>
            <p className="text-xs text-gray-400">Completed visits vs completed within window; line shows in-window rate</p>
          </div>
          <div className="hidden sm:block text-xs text-gray-300">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span>Completed</span>
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Completed (In Window)</span>
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span>In-Window Rate</span>
            </div>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={performance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="month" 
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '6px',
                  color: '#f3f4f6'
                }}
              />
              <Bar yAxisId="left" dataKey="completed" fill="#22c55e" name="Completed" />
              <Bar yAxisId="left" dataKey="completed_in_window" fill="#3b82f6" name="Completed (In Window)" />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="in_window_rate" 
                stroke="#8b5cf6" 
                strokeWidth={3}
                name="In-Window Rate (%)"
                dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visit Status Distribution */}
        {statusData.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white">Visit Status Distribution</h3>
              <p className="text-xs text-gray-400">Share of visits by status across the selected period</p>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name}: ${(((percent ?? 0) * 100)).toFixed(0)}%`}
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6'
                    }}
                    formatter={(value) => [`${value} visits`, 'Count']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Visit Type Performance */}
        {visitTypes.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white">Visit Type Performance</h3>
              <p className="text-xs text-gray-400">Top visit types with total vs completed counts</p>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visitTypes.slice(0, 8)} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                  <YAxis 
                    type="category" 
                    dataKey="visit_name" 
                    stroke="#9ca3af" 
                    fontSize={10}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6'
                    }}
                    formatter={(value, name) => [
                      name === 'completion_rate' ? `${value}%` : value,
                      name === 'completion_rate' ? 'Completion Rate' : 'Total Visits'
                    ]}
                  />
                  <Bar dataKey="total" fill="#6b7280" name="Total" />
                  <Bar dataKey="completed" fill="#22c55e" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Study Performance Comparison */}
      {studyStats.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-white">Study Visit Performance</h3>
            <p className="text-xs text-gray-400">Study-level totals by status</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studyStats}>
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
                />
                <Bar dataKey="total_visits" fill="#6b7280" name="Total Visits" />
                <Bar dataKey="completed_visits" fill="#22c55e" name="Completed" />
                <Bar dataKey="scheduled_visits" fill="#3b82f6" name="Scheduled" />
                <Bar dataKey="overdue_visits" fill="#f59e0b" name="Overdue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Visit Type Details Table */}
      {visitTypes.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Visit Type Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300">Visit Type</th>
                  <th className="text-right py-3 px-4 text-gray-300">Total</th>
                  <th className="text-right py-3 px-4 text-gray-300">Completed</th>
                  <th className="text-right py-3 px-4 text-gray-300">Completion Rate</th>
                  <th className="text-right py-3 px-4 text-gray-300">Avg Duration (min)</th>
                </tr>
              </thead>
              <tbody>
                {visitTypes.map((visitType) => (
                  <tr key={visitType.visit_name} className="border-b border-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{visitType.visit_name}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{visitType.total}</td>
                    <td className="py-3 px-4 text-right text-green-400">{visitType.completed}</td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getPerformanceColor(visitType.completion_rate) }}
                      >
                        {visitType.completion_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {visitType.avg_duration > 0 ? visitType.avg_duration : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Study Performance Details Table */}
      {studyStats.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Study Performance Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300">Protocol</th>
                  <th className="text-left py-3 px-4 text-gray-300">Study Title</th>
                  <th className="text-right py-3 px-4 text-gray-300">Total</th>
                  <th className="text-right py-3 px-4 text-gray-300">Completed</th>
                  <th className="text-right py-3 px-4 text-gray-300">Overdue</th>
                  <th className="text-right py-3 px-4 text-gray-300">Completion Rate</th>
                  <th className="text-right py-3 px-4 text-gray-300">Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {studyStats.map((study) => (
                  <tr key={study.study_id} className="border-b border-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{study.protocol_number}</td>
                    <td className="py-3 px-4 text-gray-300">{study.study_title}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{study.total_visits}</td>
                    <td className="py-3 px-4 text-right text-green-400">{study.completed_visits}</td>
                    <td className="py-3 px-4 text-right text-orange-400">{study.overdue_visits}</td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getPerformanceColor(study.completion_rate) }}
                      >
                        {study.completion_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {study.avg_days_to_completion || 'N/A'}
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
