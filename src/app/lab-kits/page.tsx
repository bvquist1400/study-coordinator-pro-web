'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import LabKitSummaryCards from '@/components/lab-kits/LabKitSummaryCards'
import LabKitInventory from '@/components/lab-kits/LabKitInventory'
import AddLabKitModal from '@/components/lab-kits/AddLabKitModal'
import InventoryForecast from '@/components/lab-kits/InventoryForecast'
import CreateShipmentModal from '@/components/lab-kits/CreateShipmentModal'
import LabKitAlertsPanel from '@/components/lab-kits/LabKitAlertsPanel'
import LabKitOrderModal from '@/components/lab-kits/LabKitOrderModal'
import OrdersAndShipmentsView from '@/components/lab-kits/OrdersAndShipmentsView'
import ArchiveView from '@/components/lab-kits/ArchiveView'
import KitTypeSettingsPanel from '@/components/lab-kits/KitTypeSettingsPanel'
import { useSite } from '@/components/site/SiteProvider'
import { useRouter, useSearchParams } from 'next/navigation'
import { todayLocalISODate } from '@/lib/date-utils'

function LabKitsPageLoader() {
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

export default function LabKitsPage() {
  return (
    <Suspense fallback={<LabKitsPageLoader />}>
      <LabKitsPageContent />
    </Suspense>
  )
}

interface Study {
  id: string
  protocol_number: string
  study_title: string
}

type ViewMode = 'inventory' | 'forecast' | 'orders-shipments' | 'archive' | 'alerts' | 'settings'

function LabKitsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialStudyIdParam = searchParams.get('studyId')
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>(() => initialStudyIdParam || 'all')
  const [viewMode, setViewMode] = useState<ViewMode>('inventory')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCreateShipment, setShowCreateShipment] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)
  const [ordersNotice, setOrdersNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showExpiringOnly, setShowExpiringOnly] = useState(false)
  const [alertsCount, setAlertsCount] = useState(0)
  const [addPrefill, setAddPrefill] = useState<{
    kitTypeId?: string | null
    kitTypeName?: string | null
    receivedDate?: string | null
    notes?: string | null
    quantity?: number | null
  } | null>(null)
  const [inventoryFilter, setInventoryFilter] = useState<{ search: string; status: string; version: number }>({ search: '', status: 'available', version: 0 })
  const { currentSiteId } = useSite()

  const canManageStudy = Boolean(selectedStudyId && selectedStudyId !== 'all')

  useEffect(() => {
    const paramStudy = searchParams.get('studyId')
    const normalizedStudy = paramStudy || 'all'
    if (normalizedStudy !== selectedStudyId) {
      setSelectedStudyId(normalizedStudy)
    }
  }, [searchParams, selectedStudyId])

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

  const handleOrdersRefresh = useCallback(() => {
    setOrdersRefreshKey(prev => prev + 1)
  }, [])

  const clearOrdersNotice = useCallback(() => {
    setOrdersNotice(null)
  }, [])

  const updateQueryParams = useCallback((next: { studyId?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.studyId !== undefined) {
      if (!next.studyId || next.studyId === 'all') {
        params.delete('studyId')
      } else {
        params.set('studyId', next.studyId)
      }
    }
    const queryString = params.toString()
    router.replace(`/lab-kits${queryString ? `?${queryString}` : ''}`)
  }, [router, searchParams])

  const handleStudySelect = useCallback((studyId: string) => {
    setSelectedStudyId(studyId)
    setInventoryFilter(prev => ({ search: '', status: 'available', version: prev.version + 1 }))
    updateQueryParams({ studyId })
  }, [updateQueryParams])

  const handleLocateKit = useCallback(({ studyId, accessionNumber }: { studyId?: string | null; accessionNumber?: string | null }) => {
    const nextStudy = studyId || selectedStudyId || 'all'
    if (nextStudy !== selectedStudyId) {
      setSelectedStudyId(nextStudy)
      updateQueryParams({ studyId: nextStudy })
    }
    setInventoryFilter(prev => ({ search: accessionNumber || '', status: 'all', version: prev.version + 1 }))
    setViewMode('inventory')
    handleRefresh()
  }, [selectedStudyId, updateQueryParams, handleRefresh])

  const handleAddComplete = () => {
    setShowAddModal(false)
    setAddPrefill(null)
    handleRefresh()
  }

  const handleAddModalClose = useCallback(() => {
    setShowAddModal(false)
    setAddPrefill(null)
  }, [])

  const handleFilterExpiring = () => {
    setShowExpiringOnly(!showExpiringOnly)
    setViewMode('inventory') // Ensure we're on inventory view
  }

  const handleOpenAddKit = useCallback(() => {
    if (!canManageStudy) return
    setShowAddModal(true)
    setViewMode('inventory')
  }, [canManageStudy])

  const handleOpenBulkImport = useCallback(() => {
    if (!canManageStudy) return
    router.push('/lab-kits/bulk-import')
  }, [canManageStudy, router])

  const handleOpenQuickStart = useCallback(() => {
    window.open('/docs/lab-kit-coordinator-quickstart.md', '_blank')
  }, [])

  const handleResetExpiringFilter = useCallback(() => {
    if (showExpiringOnly) {
      setShowExpiringOnly(false)
    }
  }, [showExpiringOnly])

  const handleCreateShipment = useCallback(() => {
    if (!canManageStudy) return
    setShowCreateShipment(true)
  }, [canManageStudy])

  const handleOpenShipmentsGuide = useCallback(() => {
    window.open('/docs/lab-kit-shipments-guide.md', '_blank')
  }, [])

  const handleOrderReceived = useCallback((details: {
    study_id: string
    kit_type_id: string | null
    received_date: string | null
    kit_type_name: string | null
    quantity?: number | null
  }) => {
    const targetStudyId = details.study_id || selectedStudyId
    if (!targetStudyId || targetStudyId === 'all') {
      setOrdersNotice({ type: 'error', message: 'Select a study to add inventory for this order.' })
      return
    }

    if (targetStudyId !== selectedStudyId) {
      setSelectedStudyId(targetStudyId)
      updateQueryParams({ studyId: targetStudyId })
    }

    const receivedDate = details.received_date || todayLocalISODate()
    setAddPrefill({
      kitTypeId: details.kit_type_id,
      kitTypeName: details.kit_type_name || null,
      receivedDate,
      quantity: details.quantity ?? null
    })
    setInventoryFilter(prev => ({ search: '', status: 'available', version: prev.version + 1 }))
    setShowAddModal(true)
    setViewMode('inventory')
    setOrdersNotice({ type: 'success', message: `Order${details.kit_type_name ? ` for ${details.kit_type_name}` : ''} marked as received. Inventory entry prefilled.` })
  }, [selectedStudyId, updateQueryParams])

  if (loading) {
    return <LabKitsPageLoader />
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Lab Kit Management</h1>
              <p className="text-gray-400 mt-1">Manage lab kit inventory, ordering, and shipment tracking</p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
              <button
                onClick={() => window.location.href = '/lab-kits/bulk-import'}
                disabled={!canManageStudy}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Inventory
              </button>
              <button
                onClick={() => {
                  if (!canManageStudy) return
                  setViewMode('orders-shipments')
                  setShowOrderModal(true)
                }}
                disabled={!canManageStudy}
                className="rounded-lg border border-blue-500/50 px-4 py-2 text-sm font-semibold text-blue-200 transition-colors hover:border-blue-400 hover:text-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Plan Order
              </button>
              {viewMode === 'orders-shipments' && (
                <button
                  onClick={() => setShowCreateShipment(true)}
                  disabled={!canManageStudy}
                  className="rounded-lg border border-purple-500/50 px-4 py-2 text-sm font-semibold text-purple-200 transition-colors hover:border-purple-400 hover:text-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create Shipment
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs uppercase text-gray-500 tracking-wide">Studies</span>
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase text-gray-500 tracking-wide">View</span>
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
                  onClick={() => setViewMode('forecast')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'forecast'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Forecast
                </button>
                <button
                  onClick={() => setViewMode('orders-shipments')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'orders-shipments'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Orders & Shipments
                </button>
                <button
                  onClick={() => setViewMode('archive')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'archive'
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Archive
                </button>
                <button
                  onClick={() => setViewMode('alerts')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'alerts'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Alerts
                  {alertsCount > 0 && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-red-600 text-white">{alertsCount}</span>
                  )}
                </button>
                <button
                  onClick={() => setViewMode('settings')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'settings'
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Settings
                </button>
              </div>
            </div>
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
                <LabKitInventory
                  studyId={selectedStudyId}
                  refreshKey={refreshKey}
                  onRefresh={handleRefresh}
                  showExpiringOnly={showExpiringOnly}
                  prefillFilters={inventoryFilter}
                  onOpenAddKit={handleOpenAddKit}
                  onOpenBulkImport={handleOpenBulkImport}
                  onOpenQuickStart={handleOpenQuickStart}
                  onResetExpiringFilter={handleResetExpiringFilter}
                />
              </div>
            )}

            {viewMode === 'forecast' && (
              selectedStudyId === 'all' ? (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-10 text-center text-gray-400">
                  Select a study to view the forecast.
                </div>
              ) : (
                <InventoryForecast studyId={selectedStudyId} daysAhead={30} />
              )
            )}

            {viewMode === 'orders-shipments' && (
              <OrdersAndShipmentsView
                studyId={selectedStudyId}
                ordersRefreshKey={ordersRefreshKey}
                shipmentsRefreshKey={refreshKey}
                onOrdersRefresh={handleOrdersRefresh}
                onShipmentsRefresh={handleRefresh}
                onOrderReceived={handleOrderReceived}
                onLocateKit={handleLocateKit}
                externalNotice={ordersNotice}
                onClearExternalNotice={clearOrdersNotice}
                onCreateShipment={handleCreateShipment}
                onOpenShipmentsGuide={handleOpenShipmentsGuide}
              />
            )}

            {viewMode === 'archive' && (
              <ArchiveView
                studyId={selectedStudyId}
                refreshKey={refreshKey}
                onRefresh={handleRefresh}
                onNavigateToInventory={() => setViewMode('inventory')}
              />
            )}

            {viewMode === 'alerts' && (
              <LabKitAlertsPanel
                studyId={selectedStudyId}
                onNavigate={(dest, options) => {
                  if (dest === 'inventory') {
                    if (options?.expiringOnly) {
                      setShowExpiringOnly(true)
                      setViewMode('inventory')
                    } else {
                      setViewMode('inventory')
                    }
                  } else if (dest === 'expired') {
                    setViewMode('archive')
                  }
                }}
                onCountChange={(n) => setAlertsCount(n)}
                onOrderReceived={handleOrderReceived}
              />
            )}

            {viewMode === 'settings' && (
              selectedStudyId === 'all' ? (
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-10 text-center text-gray-400">
                  Select a study to manage kit settings.
                </div>
              ) : (
                <KitTypeSettingsPanel
                  studyId={selectedStudyId}
                  canManage={canManageStudy}
                />
              )
            )}
          </>
        )}

        {/* Add Lab Kit Modal */}
        {showAddModal && (
          <AddLabKitModal
            studyId={selectedStudyId}
            onClose={handleAddModalClose}
            onAdd={handleAddComplete}
            prefill={addPrefill ?? undefined}
          />
        )}
        {showCreateShipment && (
          <CreateShipmentModal
            studyId={selectedStudyId}
            onClose={() => setShowCreateShipment(false)}
            onSuccess={handleRefresh}
          />
        )}
        {showOrderModal && canManageStudy && (
          <LabKitOrderModal
            studyId={selectedStudyId}
            isOpen={showOrderModal}
            onClose={() => setShowOrderModal(false)}
            onSuccess={(message) => {
              if (message) {
                setOrdersNotice({ type: 'success', message })
              }
              handleOrdersRefresh()
              handleRefresh()
            }}
            allowKitTypeChange
          />
        )}
      </div>
    </DashboardLayout>
  )
}
