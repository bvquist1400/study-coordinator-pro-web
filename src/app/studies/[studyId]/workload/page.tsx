'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import StudyWorkloadSetup from '@/components/workload/StudyWorkloadSetup'

export default function StudyWorkloadSetupPage() {
  const params = useParams<{ studyId?: string | string[] }>()

  const studyId = useMemo(() => {
    const value = params?.studyId
    if (!value) return null
    return Array.isArray(value) ? value[0] : value
  }, [params])

  if (!studyId) {
    return (
      <DashboardLayout>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
          Study identifier is missing from the URL. Please navigate from the studies dashboard.
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <StudyWorkloadSetup studyId={studyId} />
    </DashboardLayout>
  )
}
