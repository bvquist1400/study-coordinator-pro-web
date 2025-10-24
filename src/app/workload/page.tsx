'use client'

import DashboardLayout from '@/components/dashboard/DashboardLayout'
import WorkloadAnalytics from '@/components/analytics/WorkloadAnalytics'
import WorkloadConfigurator from '@/components/workload/WorkloadConfigurator'

export default function WorkloadPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Workload Engine</h1>
          <p className="text-gray-300">
            Monitor portfolio workload, identify pressure points, and launch the guided setup for each protocol.
          </p>
        </div>

        <WorkloadAnalytics />

        <WorkloadConfigurator />
      </div>
    </DashboardLayout>
  )
}
