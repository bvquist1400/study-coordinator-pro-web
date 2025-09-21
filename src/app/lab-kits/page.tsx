'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import LabKitSummaryCards from '@/components/lab-kits/LabKitSummaryCards'
import LabKitInventory from '@/components/lab-kits/LabKitInventory'
import ExpiredKitsView from '@/components/lab-kits/ExpiredKitsView'
import AddLabKitModal from '@/components/lab-kits/AddLabKitModal'
import InventoryForecast from '@/components/lab-kits/InventoryForecast'
import ShipmentsList from '@/components/lab-kits/ShipmentsList'
import CreateShipmentModal from '@/components/lab-kits/CreateShipmentModal'
import LabKitAlertsPanel from '@/components/lab-kits/LabKitAlertsPanel'
import { useSite } from '@/components/site/SiteProvider'
import { useRouter, useSearchParams } from 'next/navigation'

interface Study {
  id: string
  protocol_number: string
  study_title: string
}

type ViewMode = 'inventory' | 'expired' | 'shipments' | 'alerts'

export default function LabKitsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialStudyIdParam = searchParams.get('studyId')
  const initialSearchParam = searchParams.get('search') || ''
  const initialStatusParam = searchParams.get('status') || ''
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>(() => initialStudyIdParam || 'all')
  const [inventorySearch, setInventorySearch] = useState<string>(() => initialSearchParam)
  const [inventoryStatus, setInventoryStatus] = useState<string>(() => initialStatusParam || 'available')
  const [viewMode, setViewMode] = useState<ViewMode>('inventory')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCreateShipment, setShowCreateShipment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showExpiringOnly, setShowExpiringOnly] = useState(false)
  const [alertsCount, setAlertsCount] = useState(0)
  const { currentSiteId } = useSite()

  useEffect(() => {
    const paramStudy = searchParams.get('studyId')
    const normalizedStudy = paramStudy || 'all'
    if (normalizedStudy !== selectedStudyId) {
      setSelectedStudyId(normalizedStudy)
    }

    const paramSearch = searchParams.get('search') || ''
    if (paramSearch !== inventorySearch) {
      setInventorySearch(paramSearch)
    }

    const paramStatus = searchParams.get('status') || 'available'
    if (paramStatus !== inventoryStatus) {
      setInventoryStatus(paramStatus)
    }
  }, [searchParams, selectedStudyId, inventorySearch, inventoryStatus])

  // Load studies on mount
  const loadStudies = useCallback(async () => {
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
  }, [currentSiteId, selectedStudyId])

  useEffect(() => {
    loadStudies()
  }, [loadStudies])

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1)
  }, [])

  const updateQueryParams = useCallback((next: { studyId?: string | null; search?: string | null; status?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.studyId !== undefined) {
      if (!next.studyId || next.studyId === 'all') {
        params.delete('studyId')
      } else {
        params.set('studyId', next.studyId)
      }
    }
    if (next.search !== undefined) {
      if (next.search) {
        params.set('search', next.search)
      } else {
        params.delete('search')
      }
    }
    if (next.status !== undefined) {
      if (next.status && next.status !== 'available') {
        params.set('status', next.status)
      } else {
        params.delete('status')
      }
    }
    const queryString = params.toString()
    router.replace(`/lab-kits${queryString ? `?${queryString}` : ''}`)
  }, [router, searchParams])

  const handleStudySelect = useCallback((studyId: string) => {
    setSelectedStudyId(studyId)
    if (inventorySearch) {
      setInventorySearch('')
    }
    updateQueryParams({ studyId, search: inventorySearch ? '' : undefined, status: inventoryStatus })
  }, [inventorySearch, inventoryStatus, updateQueryParams])

  const handleLocateKit = useCallback(({ studyId, accessionNumber }: { studyId?: string | null; accessionNumber?: string | null }) => {
    const nextStudy = studyId || selectedStudyId || 'all'
    setSelectedStudyId(nextStudy)
    setInventorySearch(accessionNumber || '')
    const status = 'all'
    setInventoryStatus(status)
    setViewMode('inventory')
    updateQueryParams({ studyId: nextStudy, search: accessionNumber ? accessionNumber : null, status })
    handleRefresh()
  }, [selectedStudyId, updateQueryParams, handleRefresh])

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
            {/* Study Hot Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => handleStudySelect('all')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                  selectedStudyId === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                }`}
              >
                All Studies
              </button>
              {studies.map((study) => (
                <button
                  key={study.id}
                  onClick={() => handleStudySelect(study.id)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                    selectedStudyId === study.id ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                  }`}
                  title={study.study_title}
                >
                  {study.protocol_number}
                </button>
              ))}
            </div>

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
                onClick={() => setViewMode('alerts')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'alerts'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Alerts{alertsCount > 0 && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-600 text-white">{alertsCount}</span>
                )}
              </button>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => window.location.href = '/lab-kits/bulk-import'}
              disabled={!selectedStudyId || selectedStudyId === 'all'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Inventory</span>
            </button>
            {viewMode === 'shipments' && (
              <button
                onClick={() => setShowCreateShipment(true)}
                disabled={!selectedStudyId || selectedStudyId === 'all'}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Shipment
              </button>
            )}
          </div>
        </div>

        {/* No Study Selected State */}
        {!selectedStudyId && selectedStudyId !== 'all' ? (
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
                {/* Inventory Forecast (hidden when viewing all studies) */}
                {selectedStudyId !== 'all' && (
                  <InventoryForecast studyId={selectedStudyId} daysAhead={30} />
                )}
                
                {/* Lab Kit Inventory */}
                <LabKitInventory
                  studyId={selectedStudyId}
                  refreshKey={refreshKey}
                  onRefresh={handleRefresh}
                  showExpiringOnly={showExpiringOnly}
                  initialSearchTerm={inventorySearch}
                  initialStatus={inventoryStatus}
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
              <ShipmentsList
                studyId={selectedStudyId === 'all' ? null : selectedStudyId}
                refreshKey={refreshKey}
                onRefresh={handleRefresh}
                onLocateKit={handleLocateKit}
              />
            )}

            {viewMode === 'alerts' && (
              <LabKitAlertsPanel
                studyId={selectedStudyId}
                onNavigate={(dest, options) => {
                  if (dest === 'inventory') {
                    if (options?.expiringOnly) setShowExpiringOnly(true)
                    setViewMode('inventory')
                  } else if (dest === 'expired') {
                    setViewMode('expired')
                  }
                }}
                onCountChange={(n) => setAlertsCount(n)}
              />
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
        {showCreateShipment && (
          <CreateShipmentModal
            studyId={selectedStudyId}
            onClose={() => setShowCreateShipment(false)}
            onSuccess={handleRefresh}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
