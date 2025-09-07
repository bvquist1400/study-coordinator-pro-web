'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'
import CreateShipmentModal from './CreateShipmentModal'
import ShipmentDetailModal from './ShipmentDetailModal'

interface ShipmentsListProps {
  studyId: string
  refreshKey?: number
  onRefresh: () => void
}

interface Shipment {
  id: string
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
  tracking_status: string | null
  notes: string | null
  created_at: string
  lab_kits: {
    id: string
    accession_number: string
    kit_type: string | null
    study_id: string
  } | null
  subject_visits: {
    id: string
    visit_date: string
    subjects: {
      subject_number: string
    }
  } | null
}

export default function ShipmentsList({ studyId, refreshKey, onRefresh }: ShipmentsListProps) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Helper function to get kit information (internal or external)
  const getKitInfo = (shipment: Shipment) => {
    if (shipment.lab_kits) {
      // Internal kit
      return {
        accession_number: shipment.lab_kits.accession_number,
        kit_type: shipment.lab_kits.kit_type,
        study_name: null,
        is_external: false
      }
    } else if (shipment.notes) {
      // External kit - parse from notes
      try {
        const externalData = JSON.parse(shipment.notes)
        if (externalData.external_kit) {
          return {
            accession_number: externalData.accession_number,
            kit_type: externalData.kit_type,
            study_name: externalData.study_name,
            subject_number: externalData.subject_number,
            is_external: true
          }
        }
      } catch (e) {
        // If parsing fails, treat as regular notes
      }
    }
    return {
      accession_number: 'Unknown',
      kit_type: 'Unknown',
      study_name: null,
      is_external: false
    }
  }

  const loadShipments = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/shipments?studyId=${studyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setShipments(data.shipments || [])
      } else {
        console.error('Failed loading shipments:', response.status)
        setShipments([])
      }
    } catch (error) {
      console.error('Error loading shipments:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadShipments()
  }, [loadShipments, refreshKey])

  const getTrackingStatusBadge = (status: string | null) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full"
    
    switch (status) {
      case 'shipped':
        return `${baseClasses} bg-blue-900/50 text-blue-300 border border-blue-600`
      case 'in_transit':
        return `${baseClasses} bg-yellow-900/50 text-yellow-300 border border-yellow-600`
      case 'delivered':
        return `${baseClasses} bg-green-900/50 text-green-300 border border-green-600`
      case 'exception':
        return `${baseClasses} bg-red-900/50 text-red-300 border border-red-600`
      default:
        return `${baseClasses} bg-gray-900/50 text-gray-300 border border-gray-600`
    }
  }

  const getCarrierIcon = (carrier: string) => {
    switch (carrier.toLowerCase()) {
      case 'fedex':
        return '📦' // Could be replaced with actual FedEx icon
      case 'ups':
        return '🚚' // Could be replaced with actual UPS icon
      default:
        return '📮'
    }
  }

  const filteredShipments = shipments.filter(shipment => {
    const kitInfo = getKitInfo(shipment)
    return (
      shipment.airway_bill_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kitInfo.accession_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kitInfo.study_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.subject_visits?.subjects?.subject_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kitInfo as any).subject_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    onRefresh()
    loadShipments()
  }

  const handleUpdateSuccess = () => {
    setSelectedShipment(null)
    onRefresh()
    loadShipments()
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-300">Loading shipments...</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by tracking #, accession #, or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Shipment</span>
          </button>
        </div>

        {/* Shipments Table */}
        {filteredShipments.length === 0 ? (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-12 text-center">
            <div className="text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-lg mb-2">No shipments found</p>
              <p className="text-sm">
                {searchTerm ? 'Try adjusting your search terms' : 'Create your first shipment to get started'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Tracking #</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Lab Kit</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Subject</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Carrier</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Status</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Shipped</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Delivery</th>
                    <th className="text-left text-sm font-semibold text-gray-300 py-4 px-6">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((shipment) => {
                    const kitInfo = getKitInfo(shipment)
                    return (
                      <tr key={shipment.id} className="border-t border-gray-700 hover:bg-gray-700/25 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-medium text-blue-300">{shipment.airway_bill_number}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <div className="text-gray-100">{kitInfo.accession_number}</div>
                            {kitInfo.is_external && (
                              <span className="px-2 py-1 text-xs bg-orange-900/50 text-orange-300 rounded-full border border-orange-600">
                                Additional
                              </span>
                            )}
                          </div>
                          {kitInfo.kit_type && (
                            <div className="text-xs text-gray-400">{kitInfo.kit_type}</div>
                          )}
                          {kitInfo.is_external && kitInfo.study_name && (
                            <div className="text-xs text-gray-500">{kitInfo.study_name}</div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-gray-100">
                            {kitInfo.is_external 
                              ? (kitInfo as any).subject_number || '-'
                              : shipment.subject_visits?.subjects?.subject_number || '-'
                            }
                          </div>
                          {shipment.subject_visits?.visit_date && (
                            <div className="text-xs text-gray-400">
                              {formatDateUTC(shipment.subject_visits.visit_date)}
                            </div>
                          )}
                        </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-2">
                          <span>{getCarrierIcon(shipment.carrier)}</span>
                          <span className="text-gray-300 capitalize">{shipment.carrier}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={getTrackingStatusBadge(shipment.tracking_status)}>
                          {shipment.tracking_status || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-gray-300">
                          {shipment.shipped_date ? formatDateUTC(shipment.shipped_date) : '-'}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-gray-300">
                          {shipment.actual_delivery 
                            ? formatDateUTC(shipment.actual_delivery)
                            : shipment.estimated_delivery 
                              ? `~${formatDateUTC(shipment.estimated_delivery)}`
                              : '-'
                          }
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <button
                          onClick={() => setSelectedShipment(shipment)}
                          className="text-blue-400 hover:text-blue-300 font-medium text-sm transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateShipmentModal
          studyId={studyId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {selectedShipment && (
        <ShipmentDetailModal
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
          onUpdate={handleUpdateSuccess}
        />
      )}
    </>
  )
}