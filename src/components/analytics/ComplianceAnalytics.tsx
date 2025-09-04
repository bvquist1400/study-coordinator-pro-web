'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts'
import ComplianceLegend, { CompactLegend } from './ComplianceLegend'

interface ComplianceTrend {
  month: string
  visitTiming: number
  drugCompliance: number
}

interface StudyCompliance {
  study_id: string
  protocol_number: string
  study_title: string
  total_visits: number
  within_window_visits: number
  timing_compliance_rate: number
  total_drug_records: number
  avg_drug_compliance: number
  overall_score: number
}

interface ComplianceAlert {
  id: string
  type: 'timing' | 'drug' | 'deviation'
  subject_number: string
  visit_name: string
  protocol_number: string
  severity: 'low' | 'medium' | 'high'
  description: string
  created_at: string
}

interface ComplianceSummary {
  overallTimingRate: number
  overallDrugRate: number
  totalVisits: number
  totalDrugRecords: number
  activeAlerts: number
}

interface ComplianceAnalyticsProps {
  studyId?: string
  className?: string
}

export default function ComplianceAnalytics({ studyId, className }: ComplianceAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [trends, setTrends] = useState<ComplianceTrend[]>([])
  const [studyBreakdown, setStudyBreakdown] = useState<StudyCompliance[]>([])
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([])
  const [summary, setSummary] = useState<ComplianceSummary>({
    overallTimingRate: 0,
    overallDrugRate: 0,
    totalVisits: 0,
    totalDrugRecords: 0,
    activeAlerts: 0
  })
  const [months, setMonths] = useState(12)
  const [error, setError] = useState<string | null>(null)

  const fetchComplianceData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({ months: months.toString() })
      if (studyId) params.append('studyId', studyId)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const response = await fetch(`/api/analytics/compliance?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch compliance data')
      }
      
      const data = await response.json()
      setTrends(data.trends || [])
      setStudyBreakdown(data.studyBreakdown || [])
      setAlerts(data.alerts || [])
      setSummary(data.summary || {})
      
    } catch (error) {
      console.error('Error fetching compliance analytics:', error)
      setError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [studyId, months])

  useEffect(() => {
    fetchComplianceData()
  }, [fetchComplianceData])

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#22c55e'
    if (score >= 80) return '#eab308'
    if (score >= 70) return '#f59e0b'
    return '#ef4444'
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return '#ef4444'
      case 'medium': return '#f59e0b'
      case 'low': return '#eab308'
      default: return '#6b7280'
    }
  }

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-700 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
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
        <div className="text-red-400 mb-2">Error loading compliance analytics</div>
        <div className="text-gray-400 text-sm">{error}</div>
        <button
          onClick={fetchComplianceData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Prepare radar chart data
  const radarData = studyBreakdown.slice(0, 5).map(study => ({
    protocol: study.protocol_number,
    timing: study.timing_compliance_rate,
    drug: study.avg_drug_compliance,
    overall: study.overall_score
  }))

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Compliance Analytics</h2>
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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Visit Timing</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getScoreColor(summary.overallTimingRate) }}
          >
            {summary.overallTimingRate}%
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Drug Compliance</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getScoreColor(summary.overallDrugRate) }}
          >
            {summary.overallDrugRate}%
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Visits</div>
          <div className="text-2xl font-bold text-white">{summary.totalVisits}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Drug Records</div>
          <div className="text-2xl font-bold text-white">{summary.totalDrugRecords}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Active Alerts</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: summary.activeAlerts > 0 ? '#ef4444' : '#22c55e' }}
          >
            {summary.activeAlerts}
          </div>
        </div>
      </div>

      {/* Score Threshold Key */}
      <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Compliance Score Key</h4>
            <p className="text-xs text-gray-400">Color thresholds for percentages across charts and tables</p>
          </div>
          <ComplianceLegend type="compliance" size="sm" className="hidden sm:block" />
        </div>
      </div>

      {/* Compliance Trends Chart */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Compliance Trends</h3>
            <p className="text-xs text-gray-400">Visit timing and drug compliance over time</p>
          </div>
          <div className="hidden sm:block text-xs text-gray-300">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Visit Timing</span>
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span>Drug Compliance</span>
            </div>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="month" 
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '6px',
                  color: '#f3f4f6'
                }}
                formatter={(value) => [`${value}%`, '']}
              />
              <Line 
                type="monotone" 
                dataKey="visitTiming" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Visit Timing"
                dot={{ fill: '#3b82f6', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="drugCompliance" 
                stroke="#22c55e" 
                strokeWidth={2}
                name="Drug Compliance"
                dot={{ fill: '#22c55e', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Study Compliance Comparison */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Study Compliance Scores</h3>
              <p className="text-xs text-gray-400">Timing, drug, and overall compliance by protocol</p>
            </div>
            <CompactLegend 
              className="hidden sm:flex"
              items={[
                { color: 'bg-blue-500', label: 'Visit Timing' },
                { color: 'bg-green-500', label: 'Drug Compliance' },
                { color: 'bg-purple-500', label: 'Overall Score' }
              ]}
            />
          </div>
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
                <YAxis stroke="#9ca3af" fontSize={12} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f3f4f6'
                  }}
                  formatter={(value) => [`${value}%`, '']}
                />
                <Bar dataKey="timing_compliance_rate" fill="#3b82f6" name="Visit Timing" />
                <Bar dataKey="avg_drug_compliance" fill="#22c55e" name="Drug Compliance" />
                <Bar dataKey="overall_score" fill="#8b5cf6" name="Overall Score" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Compliance Radar Chart */}
        {radarData.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Multi-Study Comparison</h3>
                <p className="text-xs text-gray-400">Radar comparison across timing, drug, and overall</p>
              </div>
              <CompactLegend 
                className="hidden sm:flex"
                items={[
                  { color: 'bg-blue-500', label: 'Visit Timing' },
                  { color: 'bg-green-500', label: 'Drug Compliance' }
                ]}
              />
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="protocol" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <PolarRadiusAxis 
                    angle={90} 
                    domain={[0, 100]} 
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                  />
                  <Radar
                    name="Visit Timing"
                    dataKey="timing"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Radar
                    name="Drug Compliance"
                    dataKey="drug"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6'
                    }}
                    formatter={(value) => [`${value}%`, '']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Compliance Alerts */}
      {alerts.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Recent Compliance Alerts</h3>
              <p className="text-xs text-gray-400">Grouped by severity; most recent first</p>
            </div>
            <ComplianceLegend type="severity" size="sm" className="hidden sm:block" />
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div 
                key={alert.id} 
                className="flex items-start justify-between p-4 border border-gray-700 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-1">
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getSeverityColor(alert.severity) }}
                    ></span>
                    <span className="font-medium text-white">
                      {alert.protocol_number} - {alert.subject_number}
                    </span>
                    <span className="text-xs px-2 py-1 rounded text-gray-300 bg-gray-700">
                      {alert.type}
                    </span>
                  </div>
                  <div className="text-gray-300 text-sm">{alert.description}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Study Details Table */}
      {studyBreakdown.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Study Compliance Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300">Protocol</th>
                  <th className="text-left py-3 px-4 text-gray-300">Study Title</th>
                  <th className="text-right py-3 px-4 text-gray-300">Visits</th>
                  <th className="text-right py-3 px-4 text-gray-300">Visit Timing</th>
                  <th className="text-right py-3 px-4 text-gray-300">Drug Compliance</th>
                  <th className="text-right py-3 px-4 text-gray-300">Overall Score</th>
                </tr>
              </thead>
              <tbody>
                {studyBreakdown.map((study) => (
                  <tr key={study.study_id} className="border-b border-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{study.protocol_number}</td>
                    <td className="py-3 px-4 text-gray-300">{study.study_title}</td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {study.within_window_visits}/{study.total_visits}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getScoreColor(study.timing_compliance_rate) }}
                      >
                        {study.timing_compliance_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getScoreColor(study.avg_drug_compliance) }}
                      >
                        {study.avg_drug_compliance}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ 
                          backgroundColor: getScoreColor(study.overall_score) + '20',
                          color: getScoreColor(study.overall_score)
                        }}
                      >
                        {study.overall_score}%
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
