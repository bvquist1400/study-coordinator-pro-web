'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import LabKitSummaryCards from '@/components/lab-kits/LabKitSummaryCards'
import LabKitInventory from '@/components/lab-kits/LabKitInventory'
import ExpiredKitsView from '@/components/lab-kits/ExpiredKitsView'
import AddLabKitModal from '@/components/lab-kits/AddLabKitModal'
import InventoryForecast from '@/components/lab-kits/InventoryForecast'
import { useSite } from '@/components/site/SiteProvider'

interface Study {
  id: string
  protocol_number: string
  study_title: string
}

type ViewMode = 'inventory' | 'expired' | 'shipments' | 'reports'

export default function LabKitsPage() {
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('inventory')
  const [showAddModal, setShowAddModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showExpiringOnly, setShowExpiringOnly] = useState(false)
  const { currentSiteId } = useSite()

  // Load studies on mount
  useEffect(() => {
    loadStudies()
  }, [currentSiteId])

  const loadStudies = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const { studies } = await response.json()
        setStudies(studies)
        if (studies.length > 0 && !selectedStudyId) {
          setSelectedStudyId(studies[0].id)
        }
      }
    } catch (error) {
      console.error('Error loading studies:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleAddComplete = () => {
    setShowAddModal(false)
    handleRefresh()
  }

  const handleFilterExpiring = () => {
    setShowExpiringOnly(!showExpiringOnly)
    setViewMode('inventory') // Ensure we're on inventory view
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div>
          <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-700 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-700 rounded"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Lab Kit Management</h1>
            <p className="text-gray-400 mt-1">Manage lab kit inventory, shipping, and usage tracking</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Study Selector */}
            <select
              value={selectedStudyId}
              onChange={(e) => setSelectedStudyId(e.target.value)}
              className="px-4 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={studies.length === 0}
            >
              <option value="">Select Study...</option>
              {studies.map((study) => (
                <option key={study.id} value={study.id}>
                  {study.protocol_number} - {study.study_title}
                </option>
              ))}
            </select>

            {/* View Toggle */}
            <div className="flex bg-gray-700/30 rounded-lg p-1">
              <button
                onClick={() => setViewMode('inventory')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'inventory'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Inventory
              </button>
              <button
                onClick={() => setViewMode('expired')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'expired'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Expired
              </button>
              <button
                onClick={() => setViewMode('shipments')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'shipments'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Shipments
              </button>
              <button
                onClick={() => setViewMode('reports')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'reports'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Reports
              </button>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => window.location.href = '/lab-kits/bulk-import'}
              disabled={!selectedStudyId}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Inventory</span>
            </button>
          </div>
        </div>

        {/* No Study Selected State */}
        {!selectedStudyId ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg">Select a study to manage lab kits</p>
              <p className="text-sm mt-2">Choose a study from the dropdown above to start managing lab kits</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <LabKitSummaryCards 
              studyId={selectedStudyId} 
              refreshKey={refreshKey}
              onFilterExpiring={handleFilterExpiring}
            />

            {/* Main Content */}
            {viewMode === 'inventory' && (
              <div className="space-y-6">
                {/* Inventory Forecast */}
                <InventoryForecast studyId={selectedStudyId} daysAhead={30} />
                
                {/* Lab Kit Inventory */}
                <LabKitInventory
                  studyId={selectedStudyId}
                  refreshKey={refreshKey}
                  onRefresh={handleRefresh}
                  showExpiringOnly={showExpiringOnly}
                />
              </div>
            )}

            {viewMode === 'expired' && (
              <ExpiredKitsView
                studyId={selectedStudyId}
                refreshKey={refreshKey}
                onRefresh={handleRefresh}
              />
            )}

            {viewMode === 'shipments' && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
                <div className="text-center text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-lg mb-2">Shipment Tracking</p>
                  <p className="text-sm">Coming in Phase 2 - Real-time shipment tracking with FedEx/UPS integration</p>
                </div>
              </div>
            )}

            {viewMode === 'reports' && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
                <div className="text-center text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-lg mb-2">Usage Reports & Analytics</p>
                  <p className="text-sm">Coming in Phase 2 - Detailed analytics and usage reports</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Add Lab Kit Modal */}
        {showAddModal && (
          <AddLabKitModal
            studyId={selectedStudyId}
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddComplete}
          />
        )}
      </div>
    </DashboardLayout>
  )
}