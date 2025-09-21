'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import CreateShipmentModal from '@/components/lab-kits/CreateShipmentModal'
import ShipmentsList from '@/components/lab-kits/ShipmentsList'

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

export default function ShipmentsPage() {
  const [pendingKits, setPendingKits] = useState<PendingKit[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showCreateShipment, setShowCreateShipment] = useState(false)
  const [loadingPending, setLoadingPending] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadPendingKits = useCallback(async () => {
    try {
      setLoadingPending(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        console.error('No auth token available')
        return
      }

      const response = await fetch('/api/lab-kits/pending-shipments', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const { pendingKits } = await response.json()
        setPendingKits(pendingKits || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to fetch pending kits:', response.status, errorData)
      }
    } catch (error) {
      console.error('Error loading pending kits:', error)
    } finally {
      setLoadingPending(false)
    }
  }, [])

  useEffect(() => {
    loadPendingKits()
  }, [loadPendingKits, refreshKey])

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

  const handleLocateKit = useCallback(({ studyId, accessionNumber }: { studyId?: string | null; accessionNumber?: string | null }) => {
    const params = new URLSearchParams()
    if (studyId) params.set('studyId', studyId)
    if (accessionNumber) params.set('search', accessionNumber)
    params.set('status', 'all')
    const href = `/lab-kits${params.toString() ? `?${params.toString()}` : ''}`
    window.open(href, '_blank')
  }, [])

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
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <section className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Pending Shipment</h2>
                <p className="text-xs text-gray-400">{pendingKits.length} kit{pendingKits.length === 1 ? '' : 's'} ready to ship</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center space-x-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={pendingKits.length > 0 && selected.size === pendingKits.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700"
                  />
                  <span className="text-sm">Select All</span>
                </label>
                <button
                  onClick={() => setShowCreateShipment(true)}
                  disabled={selected.size === 0 || loadingPending}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ship Selected ({selected.size})
                </button>
              </div>
            </div>

            {loadingPending ? (
              <div className="p-8">
                <div className="space-y-4">
                  {[...Array(3)].map((_, idx) => (
                    <div key={idx} className="animate-pulse space-y-2">
                      <div className="h-4 w-48 bg-gray-700 rounded" />
                      <div className="h-16 bg-gray-700/70 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ) : pendingKits.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-lg mb-1">No kits waiting to ship</p>
                <p className="text-sm">All lab kits are either available, assigned, or already shipped.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {Object.entries(groupedKits).map(([studyName, kits]) => (
                  <div key={studyName} className="p-4 space-y-3">
                    <div className="text-sm font-medium text-blue-200">{studyName}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed">
                        <thead className="bg-gray-700/30 text-gray-300 text-xs uppercase">
                          <tr>
                            <th className="px-2 py-2 w-10 text-left"></th>
                            <th className="px-2 py-2 w-28 text-left">Accession</th>
                            <th className="px-2 py-2 w-24 text-left">Subject</th>
                            <th className="px-2 py-2 w-32 text-left">Visit</th>
                            <th className="px-2 py-2 w-24 text-left">Kit Type</th>
                            <th className="px-2 py-2 w-24 text-left">Status</th>
                            <th className="px-2 py-2 w-24 text-left">Expires</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700 text-sm">
                          {kits.map(kit => (
                            <tr key={kit.id} className="text-gray-100 hover:bg-gray-700/20">
                              <td className="px-2 py-2">
                                <input
                                  type="checkbox"
                                  checked={selected.has(kit.id)}
                                  onChange={e => toggle(kit.id, e.target.checked)}
                                  className="rounded border-gray-600 bg-gray-700"
                                />
                              </td>
                              <td className="px-2 py-2 font-mono text-xs truncate" title={kit.accession_number}>
                                {kit.accession_number}
                              </td>
                              <td className="px-2 py-2 text-xs truncate" title={kit.subject_number || 'Unassigned'}>
                                {kit.subject_number || '—'}
                              </td>
                              <td className="px-2 py-2 text-xs truncate">
                                <div className="flex flex-col">
                                  <span className="font-medium text-gray-200" title={kit.visit_name || 'No visit'}>
                                    {kit.visit_name || '—'}
                                  </span>
                                  {kit.visit_date && (
                                    <span className="text-[11px] text-gray-400">{new Date(kit.visit_date).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-xs truncate" title={kit.kit_type || 'None'}>
                                {kit.kit_type || '—'}
                              </td>
                              <td className="px-2 py-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-orange-900/20 border border-orange-700 text-orange-200">
                                  {kit.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-xs">
                                {kit.expiration_date ? new Date(kit.expiration_date).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Recent Shipments</h2>
                <p className="text-xs text-gray-400">Grouped by airway bill with expandable details</p>
              </div>
            </div>
            <ShipmentsList
              studyId={null}
              refreshKey={refreshKey}
              onRefresh={handleRefresh}
              onLocateKit={handleLocateKit}
              groupByAwb
            />
          </section>
        </div>

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
