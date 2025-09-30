'use client'

import { useState } from 'react'
import ExpiredKitsView from './ExpiredKitsView'

interface ArchiveViewProps {
  studyId: string
  refreshKey: number
  onRefresh: () => void
  onNavigateToInventory?: () => void
}

export default function ArchiveView({
  studyId,
  refreshKey,
  onRefresh,
  onNavigateToInventory
}: ArchiveViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'destroyed' | 'archived'>('all')

  return (
    <div className="space-y-6">
      {/* Archive Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            🗑️ Archive
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Expired, destroyed, and historical lab kits
          </p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase text-gray-500 tracking-wide">Status:</span>
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            statusFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter('expired')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            statusFilter === 'expired'
              ? 'bg-red-600 text-white'
              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
          }`}
        >
          Expired
        </button>
        <button
          onClick={() => setStatusFilter('destroyed')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            statusFilter === 'destroyed'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
          }`}
        >
          Destroyed
        </button>
        <button
          onClick={() => setStatusFilter('archived')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            statusFilter === 'archived'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
          }`}
        >
          Archived
        </button>
      </div>

      {/* Expired Kits View */}
      <ExpiredKitsView
        studyId={studyId}
        refreshKey={refreshKey}
        onRefresh={onRefresh}
        statusFilter={statusFilter}
        onNavigateToInventory={onNavigateToInventory}
      />

      {/* Archive Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-700">
        <button
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
          onClick={() => {
            // TODO: Implement export functionality
            alert('Export archive feature coming soon')
          }}
        >
          Export Archive
        </button>
        <button
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
          onClick={() => {
            // TODO: Implement report generation
            alert('Generate report feature coming soon')
          }}
        >
          Generate Report
        </button>
      </div>
    </div>
  )
}
