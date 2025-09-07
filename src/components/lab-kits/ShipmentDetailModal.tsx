'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'

interface ShipmentDetailModalProps {
  shipment: {
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
  onClose: () => void
  onUpdate: () => void
}

export default function ShipmentDetailModal({ shipment, onClose, onUpdate }: ShipmentDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Form fields
  const [trackingStatus, setTrackingStatus] = useState(shipment.tracking_status || 'shipped')
  const [actualDelivery, setActualDelivery] = useState(shipment.actual_delivery?.split('T')[0] || '')
  const [estimatedDelivery, setEstimatedDelivery] = useState(shipment.estimated_delivery?.split('T')[0] || '')
  const [notes, setNotes] = useState(shipment.notes || '')

  // Helper function to get kit information (internal or external)
  const getKitInfo = () => {
    if (shipment.lab_kits) {
      // Internal kit
      return {
        accession_number: shipment.lab_kits.accession_number,
        kit_type: shipment.lab_kits.kit_type,
        study_name: null,
        subject_number: shipment.subject_visits?.subjects?.subject_number,
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
            is_external: true,
            external_notes: externalData.external_notes,
            shipment_notes: externalData.shipment_notes
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
      subject_number: null,
      is_external: false
    }
  }

  const kitInfo = getKitInfo()

  const handleSave = async () => {
    try {
      setSubmitting(true)
      setErrorMsg(null)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/shipments/${shipment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          trackingStatus,
          actualDelivery: actualDelivery || null,
          estimatedDelivery: estimatedDelivery || null,
          notes: notes.trim() || null
        })
      })

      if (response.ok) {
        setIsEditing(false)
        onUpdate()
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to update shipment' }))
        setErrorMsg(error.error)
      }
    } catch (error) {
      console.error('Error updating shipment:', error)
      setErrorMsg('Failed to update shipment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    // Reset form fields
    setTrackingStatus(shipment.tracking_status || 'shipped')
    setActualDelivery(shipment.actual_delivery?.split('T')[0] || '')
    setEstimatedDelivery(shipment.estimated_delivery?.split('T')[0] || '')
    setNotes(shipment.notes || '')
    setErrorMsg(null)
    setIsEditing(false)
  }

  const getTrackingStatusBadge = (status: string | null) => {
    const baseClasses = "px-3 py-1 text-sm font-medium rounded-full"
    
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
        return '📦'
      case 'ups':
        return '🚚'
      default:
        return '📮'
    }
  }

  const getTrackingUrl = (carrier: string, trackingNumber: string) => {
    switch (carrier.toLowerCase()) {
      case 'fedex':
        return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`
      case 'ups':
        return `https://www.ups.com/track?tracknum=${trackingNumber}`
      default:
        return null
    }
  }

  const trackingUrl = getTrackingUrl(shipment.carrier, shipment.airway_bill_number)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Shipment Details</h2>
            <p className="text-gray-400 mt-1">Tracking #{shipment.airway_bill_number}</p>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-2 text-blue-400 hover:text-blue-300 font-medium text-sm transition-colors"
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Shipping Information */}
          <div className="bg-gray-700/30 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Shipping Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tracking Number
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                    {shipment.airway_bill_number}
                  </div>
                  {trackingUrl && (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Track
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Carrier
                </label>
                <div className="flex items-center space-x-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                  <span>{getCarrierIcon(shipment.carrier)}</span>
                  <span className="capitalize">{shipment.carrier}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Status
                </label>
                {isEditing ? (
                  <select
                    value={trackingStatus}
                    onChange={(e) => setTrackingStatus(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="shipped">Shipped</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="exception">Exception</option>
                  </select>
                ) : (
                  <div className="py-2">
                    <span className={getTrackingStatusBadge(shipment.tracking_status)}>
                      {(shipment.tracking_status || 'unknown').replace('_', ' ')}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Shipped Date
                </label>
                <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                  {shipment.shipped_date ? formatDateUTC(shipment.shipped_date) : '-'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Estimated Delivery
                </label>
                {isEditing ? (
                  <input
                    type="date"
                    value={estimatedDelivery}
                    onChange={(e) => setEstimatedDelivery(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                    {shipment.estimated_delivery ? formatDateUTC(shipment.estimated_delivery) : '-'}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Actual Delivery
                </label>
                {isEditing ? (
                  <input
                    type="date"
                    value={actualDelivery}
                    onChange={(e) => setActualDelivery(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                    {shipment.actual_delivery ? formatDateUTC(shipment.actual_delivery) : '-'}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              {isEditing ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add shipping notes..."
                />
              ) : (
                <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 min-h-[80px]">
                  {shipment.notes || '-'}
                </div>
              )}
            </div>
          </div>

          {/* Lab Kit Information */}
          <div className="bg-gray-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Lab Kit Information</h3>
              {kitInfo.is_external && (
                <span className="px-3 py-1 text-sm bg-orange-900/50 text-orange-300 rounded-full border border-orange-600">
                  Additional Study
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Accession Number
                </label>
                <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                  {kitInfo.accession_number}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Kit Type
                </label>
                <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                  {kitInfo.kit_type || '-'}
                </div>
              </div>

              {kitInfo.is_external && kitInfo.study_name && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Additional Study
                  </label>
                  <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                    {kitInfo.study_name}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Subject
                </label>
                <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                  {kitInfo.subject_number || '-'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Visit Date
                </label>
                <div className="bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                  {shipment.subject_visits?.visit_date ? formatDateUTC(shipment.subject_visits.visit_date) : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {isEditing && (
          <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-700">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {submitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}