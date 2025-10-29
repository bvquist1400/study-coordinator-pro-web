'use client'

import { useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import WorkloadAnalytics from '@/components/analytics/WorkloadAnalytics'
import WorkloadConfigurator from '@/components/workload/WorkloadConfigurator'

export default function WorkloadPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Workload Engine</h1>
          <p className="text-gray-300">
            Monitor portfolio workload, identify pressure points, and launch the guided setup for each protocol.
          </p>
        </div>

        <WorkloadAnalytics refreshToken={refreshKey} />

        <WorkloadConfigurator onMetricsRefresh={() => setRefreshKey((prev) => prev + 1)} />
      </div>
    </DashboardLayout>
  )
}
