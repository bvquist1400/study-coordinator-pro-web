'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, LineChart, Line } from 'recharts'

interface StudyComparison {
  study_id: string
  protocol_number: string
  study_title: string
  status: string
  phase: string | null
  start_date: string | null
  target_enrollment: number | null
  actual_enrollment: number
  enrollment_rate: number
  total_visits: number
  completed_visits: number
  visit_completion_rate: number
  timing_compliance_rate: number
  drug_compliance_rate: number
  overall_performance_score: number
  days_since_start: number
  enrollment_velocity: number
}

interface StudyMilestone {
  study_id: string
  protocol_number: string
  milestones: {
    first_subject_enrolled: string | null
    target_enrollment_date: string | null
    last_subject_enrolled: string | null
    database_lock: string | null
    completion_date: string | null
  }
  progress: {
    enrollment_progress: number
    visit_progress: number
    overall_progress: number
  }
}

interface StudySummary {
  totalStudies: number
  activeStudies: number
  avgEnrollmentRate: number
  avgCompletionRate: number
}

interface StudyAnalyticsProps {
  className?: string
}

export default function StudyAnalytics({ className }: StudyAnalyticsProps) {
  const [loading, setLoading] = useState(true)
  const [comparisons, setComparisons] = useState<StudyComparison[]>([])
  const [milestones, setMilestones] = useState<StudyMilestone[]>([])
  const [summary, setSummary] = useState<StudySummary>({
    totalStudies: 0,
    activeStudies: 0,
    avgEnrollmentRate: 0,
    avgCompletionRate: 0
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStudyData()
  }, [])

  const fetchStudyData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/analytics/studies')
      
      if (!response.ok) {
        throw new Error('Failed to fetch study data')
      }
      
      const data = await response.json()
      setComparisons(data.comparisons || [])
      setMilestones(data.milestones || [])
      setSummary(data.summary || {})
      
    } catch (error) {
      console.error('Error fetching study analytics:', error)
      setError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const getPerformanceColor = (score: number) => {
    if (score >= 85) return '#22c55e'
    if (score >= 70) return '#eab308'
    if (score >= 55) return '#f59e0b'
    return '#ef4444'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enrolling': return '#3b82f6'
      case 'active': return '#22c55e'
      case 'closed_to_enrollment': return '#f59e0b'
      case 'completed': return '#6b7280'
      default: return '#9ca3af'
    }
  }

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
        <div className="text-red-400 mb-2">Error loading study analytics</div>
        <div className="text-gray-400 text-sm">{error}</div>
        <button
          onClick={fetchStudyData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Prepare data for radar chart (top 6 studies)
  const radarData = comparisons.slice(0, 6).map(study => ({
    protocol: study.protocol_number,
    enrollment: study.enrollment_rate,
    visits: study.visit_completion_rate,
    timing: study.timing_compliance_rate,
    drug: study.drug_compliance_rate,
    overall: study.overall_performance_score
  }))

  // Prepare enrollment velocity scatter plot data
  const scatterData = comparisons.map(study => ({
    enrollment: study.actual_enrollment,
    velocity: study.enrollment_velocity,
    protocol: study.protocol_number,
    performance: study.overall_performance_score
  }))

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Study Comparisons</h2>
        <p className="text-gray-400">Cross-study performance analysis and benchmarking</p>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Studies</div>
          <div className="text-2xl font-bold text-white">{summary.totalStudies}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Active Studies</div>
          <div className="text-2xl font-bold text-blue-400">{summary.activeStudies}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Avg Enrollment Rate</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getPerformanceColor(summary.avgEnrollmentRate) }}
          >
            {summary.avgEnrollmentRate}%
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Avg Completion Rate</div>
          <div 
            className="text-2xl font-bold"
            style={{ color: getPerformanceColor(summary.avgCompletionRate) }}
          >
            {summary.avgCompletionRate}%
          </div>
        </div>
      </div>

      {/* Performance Comparison Chart */}
      {comparisons.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Overall Performance Comparison</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisons.slice(0, 10)}>
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
                <Bar dataKey="enrollment_rate" fill="#3b82f6" name="Enrollment Rate" />
                <Bar dataKey="visit_completion_rate" fill="#22c55e" name="Visit Completion" />
                <Bar dataKey="timing_compliance_rate" fill="#eab308" name="Timing Compliance" />
                <Bar dataKey="overall_performance_score" fill="#8b5cf6" name="Overall Score" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Multi-dimensional Performance Radar */}
        {radarData.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Multi-dimensional Performance</h3>
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
                    name="Enrollment Rate"
                    dataKey="enrollment"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Radar
                    name="Visit Completion"
                    dataKey="visits"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Radar
                    name="Overall Score"
                    dataKey="overall"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
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

        {/* Enrollment Velocity vs Size */}
        {scatterData.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Enrollment Velocity Analysis</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart data={scatterData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    type="number" 
                    dataKey="enrollment" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    name="Total Enrollment"
                  />
                  <YAxis 
                    type="number" 
                    dataKey="velocity" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    name="Subjects/Month"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6'
                    }}
                    formatter={(value, name) => [
                      name === 'enrollment' ? `${value} subjects` :
                      name === 'velocity' ? `${value} subjects/month` : value,
                      name === 'enrollment' ? 'Total Enrolled' :
                      name === 'velocity' ? 'Enrollment Velocity' : name
                    ]}
                    labelFormatter={() => ''}
                  />
                  <Scatter 
                    name="Studies" 
                    dataKey="velocity" 
                    fill="#3b82f6"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Study Progress Timeline */}
      {milestones.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Study Progress Overview</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={milestones}>
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
                <Bar dataKey="progress.enrollment_progress" fill="#3b82f6" name="Enrollment Progress" />
                <Bar dataKey="progress.visit_progress" fill="#22c55e" name="Visit Progress" />
                <Bar dataKey="progress.overall_progress" fill="#8b5cf6" name="Overall Progress" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detailed Study Comparison Table */}
      {comparisons.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Detailed Study Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300">Protocol</th>
                  <th className="text-left py-3 px-4 text-gray-300">Study Title</th>
                  <th className="text-center py-3 px-4 text-gray-300">Status</th>
                  <th className="text-right py-3 px-4 text-gray-300">Enrollment</th>
                  <th className="text-right py-3 px-4 text-gray-300">Visits</th>
                  <th className="text-right py-3 px-4 text-gray-300">Timing</th>
                  <th className="text-right py-3 px-4 text-gray-300">Drug</th>
                  <th className="text-right py-3 px-4 text-gray-300">Overall</th>
                  <th className="text-right py-3 px-4 text-gray-300">Velocity</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((study) => (
                  <tr key={study.study_id} className="border-b border-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{study.protocol_number}</td>
                    <td className="py-3 px-4 text-gray-300 max-w-xs truncate" title={study.study_title}>
                      {study.study_title}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span 
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ 
                          backgroundColor: getStatusColor(study.status) + '20',
                          color: getStatusColor(study.status)
                        }}
                      >
                        {study.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="text-white font-medium">
                        {study.actual_enrollment}/{study.target_enrollment || 'N/A'}
                      </div>
                      <div 
                        className="text-xs"
                        style={{ color: getPerformanceColor(study.enrollment_rate) }}
                      >
                        {study.enrollment_rate}%
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="text-white font-medium">
                        {study.completed_visits}/{study.total_visits}
                      </div>
                      <div 
                        className="text-xs"
                        style={{ color: getPerformanceColor(study.visit_completion_rate) }}
                      >
                        {study.visit_completion_rate}%
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getPerformanceColor(study.timing_compliance_rate) }}
                      >
                        {study.timing_compliance_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="font-medium"
                        style={{ color: getPerformanceColor(study.drug_compliance_rate) }}
                      >
                        {study.drug_compliance_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span 
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ 
                          backgroundColor: getPerformanceColor(study.overall_performance_score) + '20',
                          color: getPerformanceColor(study.overall_performance_score)
                        }}
                      >
                        {study.overall_performance_score}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {study.enrollment_velocity}/mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Study Milestones */}
      {milestones.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Study Milestones & Timeline</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300">Protocol</th>
                  <th className="text-center py-3 px-4 text-gray-300">First Subject</th>
                  <th className="text-center py-3 px-4 text-gray-300">Last Subject</th>
                  <th className="text-center py-3 px-4 text-gray-300">Target Date</th>
                  <th className="text-right py-3 px-4 text-gray-300">Enrollment Progress</th>
                  <th className="text-right py-3 px-4 text-gray-300">Visit Progress</th>
                  <th className="text-right py-3 px-4 text-gray-300">Overall Progress</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((milestone) => (
                  <tr key={milestone.study_id} className="border-b border-gray-700/50">
                    <td className="py-3 px-4 text-white font-medium">{milestone.protocol_number}</td>
                    <td className="py-3 px-4 text-center text-gray-300">
                      {milestone.milestones.first_subject_enrolled 
                        ? new Date(milestone.milestones.first_subject_enrolled).toLocaleDateString()
                        : 'N/A'
                      }
                    </td>
                    <td className="py-3 px-4 text-center text-gray-300">
                      {milestone.milestones.last_subject_enrolled 
                        ? new Date(milestone.milestones.last_subject_enrolled).toLocaleDateString()
                        : 'N/A'
                      }
                    </td>
                    <td className="py-3 px-4 text-center text-gray-300">
                      {milestone.milestones.target_enrollment_date 
                        ? new Date(milestone.milestones.target_enrollment_date).toLocaleDateString()
                        : 'N/A'
                      }
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <div className="w-16 bg-gray-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full"
                            style={{ 
                              width: `${milestone.progress.enrollment_progress}%`,
                              backgroundColor: getPerformanceColor(milestone.progress.enrollment_progress)
                            }}
                          ></div>
                        </div>
                        <span 
                          className="text-xs font-medium"
                          style={{ color: getPerformanceColor(milestone.progress.enrollment_progress) }}
                        >
                          {milestone.progress.enrollment_progress}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <div className="w-16 bg-gray-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full"
                            style={{ 
                              width: `${milestone.progress.visit_progress}%`,
                              backgroundColor: getPerformanceColor(milestone.progress.visit_progress)
                            }}
                          ></div>
                        </div>
                        <span 
                          className="text-xs font-medium"
                          style={{ color: getPerformanceColor(milestone.progress.visit_progress) }}
                        >
                          {milestone.progress.visit_progress}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <div className="w-16 bg-gray-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full"
                            style={{ 
                              width: `${milestone.progress.overall_progress}%`,
                              backgroundColor: getPerformanceColor(milestone.progress.overall_progress)
                            }}
                          ></div>
                        </div>
                        <span 
                          className="text-xs font-medium"
                          style={{ color: getPerformanceColor(milestone.progress.overall_progress) }}
                        >
                          {milestone.progress.overall_progress}%
                        </span>
                      </div>
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