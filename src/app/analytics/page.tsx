'use client'

import { useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import EnrollmentAnalytics from '@/components/analytics/EnrollmentAnalytics'
import ComplianceAnalytics from '@/components/analytics/ComplianceAnalytics'
import VisitAnalytics from '@/components/analytics/VisitAnalytics'
import StudyAnalytics from '@/components/analytics/StudyAnalytics'

type AnalyticsTab = 'enrollment' | 'compliance' | 'visits' | 'studies'

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('enrollment')

  const tabs = [
    { id: 'enrollment', label: 'Enrollment', icon: '📊' },
    { id: 'compliance', label: 'Compliance', icon: '✅' },
    { id: 'visits', label: 'Visits', icon: '📅' },
    { id: 'studies', label: 'Studies', icon: '📋' }
  ] as const

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Analytics & Reporting</h1>
          <p className="text-gray-300">Comprehensive insights into your clinical research operations</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-700">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AnalyticsTab)}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="min-h-[600px]">
          {activeTab === 'enrollment' && (
            <EnrollmentAnalytics />
          )}
          
          {activeTab === 'compliance' && (
            <ComplianceAnalytics />
          )}
          
          {activeTab === 'visits' && (
            <VisitAnalytics />
          )}
          
          {activeTab === 'studies' && (
            <StudyAnalytics />
          )}
        </div>

        {/* Export Actions */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Export Options</h3>
          <div className="flex flex-wrap gap-3">
            <button 
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              onClick={() => {/* TODO: Implement PDF export */}}
            >
              📄 Export PDF Report
            </button>
            <button 
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              onClick={() => {/* TODO: Implement Excel export */}}
            >
              📊 Export Excel Data
            </button>
            <button 
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              onClick={() => {/* TODO: Implement CSV export */}}
            >
              📝 Export CSV
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Export functionality will be available once analytics modules are complete
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}