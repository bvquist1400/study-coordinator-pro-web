'use client'

import { useState, useEffect } from 'react'
import { 
  calculateDrugCompliance, 
  calculateVisitCompliance, 
  calculateOverallCompliance,
  getComplianceColor,
  getComplianceLabel,
  ComplianceResult,
  DrugComplianceData,
  VisitComplianceData
} from '@/lib/compliance-calculator'

interface ComplianceDashboardProps {
  studyId: string
  subjectId?: string
  complianceThreshold?: number
}

interface SubjectVisit {
  id: string
  subject_id: string
  visit_name: string
  scheduled_date: string
  actual_date?: string
  status: 'scheduled' | 'completed' | 'missed' | 'delayed'
  tablets_dispensed?: number
  tablets_returned?: number
  previous_dispense_date?: string
}

interface Study {
  id: string
  visit_window_days: number
  dosing_frequency?: string
  compliance_threshold: number
}

export default function ComplianceDashboard({ studyId, subjectId, complianceThreshold = 80 }: ComplianceDashboardProps) {
  const [visits, setVisits] = useState<SubjectVisit[]>([])
  const [study, setStudy] = useState<Study | null>(null)
  const [loading, setLoading] = useState(true)
  const [overallCompliance, setOverallCompliance] = useState<ComplianceResult | null>(null)
  const [drugCompliances, setDrugCompliances] = useState<(ComplianceResult & { visitName: string })[]>([])
  const [visitCompliances, setVisitCompliances] = useState<(ComplianceResult & { visitName: string })[]>([])

  useEffect(() => {
    loadData()
  }, [studyId, subjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visits.length > 0 && study) {
      calculateCompliances()
    }
  }, [visits, study]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Get study details
      const studyResponse = await fetch(`/api/studies/${studyId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_auth_token')}`
        }
      })
      if (studyResponse.ok) {
        const { study } = await studyResponse.json()
        setStudy(study)
      }

      // Get visits
      const visitsUrl = subjectId 
        ? `/api/subject-visits?study_id=${studyId}&subject_id=${subjectId}`
        : `/api/subject-visits?study_id=${studyId}`
        
      const visitsResponse = await fetch(visitsUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_auth_token')}`
        }
      })
      if (visitsResponse.ok) {
        const { subjectVisits } = await visitsResponse.json()
        setVisits(subjectVisits || [])
      }
    } catch (error) {
      console.error('Error loading compliance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateCompliances = () => {
    if (!study) return

    const drugResults: (ComplianceResult & { visitName: string })[] = []
    const visitResults: (ComplianceResult & { visitName: string })[] = []
    
    const thresholds = {
      excellent: 95,
      good: 85,
      acceptable: study.compliance_threshold || complianceThreshold
    }

    visits.forEach(visit => {
      // Calculate visit compliance
      if (visit.scheduled_date) {
        const visitData: VisitComplianceData = {
          scheduledDate: new Date(visit.scheduled_date),
          actualDate: visit.actual_date ? new Date(visit.actual_date) : undefined,
          visitWindow: study.visit_window_days || 7,
          visitName: visit.visit_name,
          status: visit.status
        }

        const visitCompliance = calculateVisitCompliance(visitData, thresholds)
        visitResults.push({ ...visitCompliance, visitName: visit.visit_name })
      }

      // Calculate drug compliance (if tablet data available)
      if (visit.tablets_dispensed && visit.previous_dispense_date && visit.scheduled_date) {
        const drugData: DrugComplianceData = {
          tabletsDispensed: visit.tablets_dispensed,
          tabletsReturned: visit.tablets_returned || 0,
          dispensingDate: new Date(visit.previous_dispense_date),
          expectedReturnDate: new Date(visit.scheduled_date),
          actualReturnDate: visit.actual_date ? new Date(visit.actual_date) : undefined,
          dosingFrequency: getDailyDoseFromFrequency(study.dosing_frequency || 'QD'),
          studyDrug: 'Study Medication'
        }

        const drugCompliance = calculateDrugCompliance(drugData, thresholds)
        drugResults.push({ ...drugCompliance, visitName: visit.visit_name })
      }
    })

    setDrugCompliances(drugResults)
    setVisitCompliances(visitResults)

    // Calculate overall compliance
    if (drugResults.length > 0 || visitResults.length > 0) {
      const overall = calculateOverallCompliance(drugResults, visitResults)
      setOverallCompliance(overall)
    }
  }

  const getDailyDoseFromFrequency = (frequency: string): number => {
    switch (frequency.toUpperCase()) {
      case 'QD': return 1
      case 'BID': return 2
      case 'TID': return 3
      case 'QID': return 4
      default: return 1
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h2>
        <p className="text-gray-600">
          {subjectId ? `Subject ${subjectId} compliance overview` : 'Study-wide compliance overview'}
        </p>
      </div>

      {/* Overall Compliance Card */}
      {overallCompliance && (
        <div className={`rounded-lg border-2 p-6 ${getComplianceColor(overallCompliance.status)}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Overall Compliance</h3>
              <p className="text-3xl font-bold">{overallCompliance.percentage}%</p>
              <p className="text-sm opacity-75">{getComplianceLabel(overallCompliance.status)}</p>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-75">
                Threshold: {study?.compliance_threshold || complianceThreshold}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Drug Compliance */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Drug Compliance</h3>
          {drugCompliances.length > 0 ? (
            <div className="space-y-3">
              {drugCompliances.map((compliance, index) => (
                <div key={index} className={`p-3 rounded border ${getComplianceColor(compliance.status)}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{compliance.visitName}</span>
                    <span className="font-bold">{compliance.percentage}%</span>
                  </div>
                  <div className="text-sm opacity-75">{getComplianceLabel(compliance.status)}</div>
                </div>
              ))}
              <div className="mt-4 text-sm text-gray-600">
                Average: {(drugCompliances.reduce((sum, c) => sum + c.percentage, 0) / drugCompliances.length).toFixed(1)}%
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No drug compliance data available</p>
          )}
        </div>

        {/* Visit Compliance */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Visit Compliance</h3>
          {visitCompliances.length > 0 ? (
            <div className="space-y-3">
              {visitCompliances.map((compliance, index) => (
                <div key={index} className={`p-3 rounded border ${getComplianceColor(compliance.status)}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{compliance.visitName}</span>
                    <span className="font-bold">{compliance.percentage}%</span>
                  </div>
                  <div className="text-sm opacity-75">{getComplianceLabel(compliance.status)}</div>
                </div>
              ))}
              <div className="mt-4 text-sm text-gray-600">
                Average: {(visitCompliances.reduce((sum, c) => sum + c.percentage, 0) / visitCompliances.length).toFixed(1)}%
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No visit compliance data available</p>
          )}
        </div>
      </div>

      {/* Deviations and Recommendations */}
      {overallCompliance && (overallCompliance.deviations.length > 0 || overallCompliance.recommendations.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Deviations */}
          {overallCompliance.deviations.length > 0 && (
            <div className="bg-red-50 rounded-lg border border-red-200 p-6">
              <h3 className="text-lg font-semibold text-red-800 mb-4">Protocol Deviations</h3>
              <ul className="space-y-2 text-sm text-red-700">
                {overallCompliance.deviations.map((deviation, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    {deviation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {overallCompliance.recommendations.length > 0 && (
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
              <h3 className="text-lg font-semibold text-blue-800 mb-4">Recommendations</h3>
              <ul className="space-y-2 text-sm text-blue-700">
                {overallCompliance.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    {recommendation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* No Data State */}
      {visits.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">No visit data available</div>
          <p className="text-gray-500 text-sm mt-2">
            Compliance calculations will appear once visit data is entered.
          </p>
        </div>
      )}
    </div>
  )
}