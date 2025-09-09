'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import CreateShipmentModal from '@/components/lab-kits/CreateShipmentModal'
import ShipmentsList from '@/components/lab-kits/ShipmentsList'
import { useSite } from '@/components/site/SiteProvider'

interface PendingKit {
  id: string
  accession_number: string
  kit_type: string | null
  status: string
  expiration_date: string | null
  study_protocol: string
  study_title: string
  study_id: string
  subject_id: string | null
  subject_number: string | null
  visit_id: string | null
  visit_name: string | null
  visit_date: string | null
}

type ViewMode = 'pending' | 'shipped'

export default function ShipmentsPage() {
  const [pendingKits, setPendingKits] = useState<PendingKit[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('pending')
  const [showCreateShipment, setShowCreateShipment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const { currentSiteId } = useSite()

  const loadPendingKits = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      console.log('Auth session check:', { hasSession: !!session, hasToken: !!token })
      if (!token) {
        console.error('No auth token available')
        return
      }

      const response = await fetch('/api/lab-kits/pending-shipments', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const { pendingKits } = await response.json()
        console.log('Pending kits API response:', { pendingKits })
        setPendingKits(pendingKits || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to fetch pending kits:', response.status, errorData)
      }
    } catch (error) {
      console.error('Error loading pending kits:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (viewMode === 'pending') {
      loadPendingKits()
    }
  }, [loadPendingKits, viewMode, refreshKey])

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
    setSelected(new Set())
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(pendingKits.map(kit => kit.id)))
    } else {
      setSelected(new Set())
    }
  }

  const toggle = (id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  const groupedKits = pendingKits.reduce((acc, kit) => {
    const key = `${kit.study_protocol} - ${kit.study_title}`
    if (!acc[key]) acc[key] = []
    acc[key].push(kit)
    return acc
  }, {} as Record<string, PendingKit[]>)

  if (loading && viewMode === 'pending') {
    return (
      <DashboardLayout>
        <div>
          <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
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
            <h1 className="text-3xl font-bold text-white">Shipment Management</h1>
            <p className="text-gray-400 mt-1">Manage lab kit shipments across all studies</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* View Toggle */}
            <div className="flex bg-gray-700/30 rounded-lg p-1">
              <button
                onClick={() => setViewMode('pending')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'pending'
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Pending Shipment ({pendingKits.length})
              </button>
              <button
                onClick={() => setViewMode('shipped')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'shipped'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Shipped
              </button>
            </div>

            {/* Action Buttons */}
            {viewMode === 'pending' && (
              <button
                onClick={() => setShowCreateShipment(true)}
                disabled={selected.size === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ship Selected ({selected.size})
              </button>
            )}
            
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Main Content */}
        {viewMode === 'pending' ? (
          <div className="space-y-6">
            {pendingKits.length === 0 ? (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
                <div className="text-center text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-lg mb-2">No Kits Pending Shipment</p>
                  <p className="text-sm">All lab kits are either available, assigned, or already shipped</p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Kits Pending Shipment</h2>
                    <label className="flex items-center space-x-2 text-gray-300">
                      <input
                        type="checkbox"
                        checked={selected.size === pendingKits.length && pendingKits.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700"
                      />
                      <span>Select All</span>
                    </label>
                  </div>
                </div>

                <div className="divide-y divide-gray-700">
                  {Object.entries(groupedKits).map(([studyName, kits]) => (
                    <div key={studyName} className="p-4">
                      <h3 className="text-sm font-medium text-gray-300 mb-3">{studyName}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full table-fixed">
                          <thead className="bg-gray-700/30">
                            <tr>
                              <th className="px-3 py-2 w-12 text-left"></th>
                              <th className="px-3 py-2 text-left text-gray-300 w-28">Accession #</th>
                              <th className="px-3 py-2 text-left text-gray-300 w-20">Subject</th>
                              <th className="px-3 py-2 text-left text-gray-300 w-24">Visit</th>
                              <th className="px-3 py-2 text-left text-gray-300 w-20">Kit Type</th>
                              <th className="px-3 py-2 text-left text-gray-300 w-20">Status</th>
                              <th className="px-3 py-2 text-left text-gray-300 w-20">Expires</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-700">
                            {kits.map(kit => (
                              <tr key={kit.id} className="text-gray-100 hover:bg-gray-700/20">
                                <td className="px-3 py-2 w-12">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(kit.id)}
                                    onChange={e => toggle(kit.id, e.target.checked)}
                                    className="rounded border-gray-600 bg-gray-700"
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono text-sm w-28 truncate" title={kit.accession_number}>
                                  {kit.accession_number}
                                </td>
                                <td className="px-3 py-2 text-sm w-20 truncate" title={kit.subject_number || 'Unassigned'}>
                                  {kit.subject_number || '-'}
                                </td>
                                <td className="px-3 py-2 text-sm w-24 truncate">
                                  <div className="space-y-1">
                                    <div className="font-medium" title={kit.visit_name || 'No visit'}>
                                      {kit.visit_name || '-'}
                                    </div>
                                    {kit.visit_date && (
                                      <div className="text-xs text-gray-400">
                                        {new Date(kit.visit_date).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 w-20 truncate" title={kit.kit_type || 'None'}>
                                  {kit.kit_type || '-'}
                                </td>
                                <td className="px-3 py-2 w-20">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-900/20 border border-orange-700 text-orange-300">
                                    {kit.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-sm w-20">
                                  {kit.expiration_date ? new Date(kit.expiration_date).toLocaleDateString() : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <ShipmentsList
            studyId={null} // null means show all studies
            refreshKey={refreshKey}
            onRefresh={handleRefresh}
          />
        )}

        {/* Create Shipment Modal */}
        {showCreateShipment && (
          <CreateShipmentModal
            studyId="" // Will be handled differently for cross-study
            selectedKitIds={Array.from(selected)}
            onClose={() => {
              setShowCreateShipment(false)
              setSelected(new Set())
            }}
            onSuccess={() => {
              handleRefresh()
              setShowCreateShipment(false)
              setSelected(new Set())
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}