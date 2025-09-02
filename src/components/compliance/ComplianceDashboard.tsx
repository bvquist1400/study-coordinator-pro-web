'use client'

import ComplianceAnalytics from '@/components/analytics/ComplianceAnalytics'

interface ComplianceDashboardProps {
  studyId: string
  subjectId?: string
  complianceThreshold?: number
}

export default function ComplianceDashboard({ studyId, subjectId: _subjectId }: ComplianceDashboardProps) {
  return (
    <div className="p-6">
      <ComplianceAnalytics studyId={studyId} className="space-y-6" />
    </div>
  )
}
