'use client'

import DashboardLayout from '@/components/dashboard/DashboardLayout'
import WorkloadEngineView from '@/components/workload/WorkloadEngineView'

export default function WorkloadPage() {
  return (
    <DashboardLayout>
      <WorkloadEngineView />
    </DashboardLayout>
  )
}
