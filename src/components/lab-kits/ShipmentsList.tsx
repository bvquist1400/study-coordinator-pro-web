'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUSShort } from '@/lib/date-utils'

interface ShipmentsListProps {
  studyId: string | null // null means show all studies
  refreshKey: number
  onRefresh: () => void
}

type Shipment = {
  id: string
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  tracking_status: string | null
  accession_number?: string | null
  study_protocol?: string
  study_title?: string
}

export default function ShipmentsList({ studyId, refreshKey, onRefresh }: ShipmentsListProps) {
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [updating, setUpdating] = useState<string | null>(null)

  const handleMarkDelivered = async (shipmentId: string) => {
    try {
      setUpdating(shipmentId)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const resp = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tracking_status: 'delivered',
          actual_delivery: new Date().toISOString().split('T')[0]
        })
      })

      if (resp.ok) {
        onRefresh() // Refresh the shipments list
      } else {
        const error = await resp.json().catch(() => ({ error: 'Failed to update shipment' }))
        console.error('Failed to mark shipment as delivered:', error.error)
        alert('Failed to mark shipment as delivered: ' + error.error)
      }
    } catch (error) {
      console.error('Error updating shipment:', error)
      alert('Failed to mark shipment as delivered')
    } finally {
      setUpdating(null)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          setShipments([])
          setLoading(false)
          return
        }
        const url = studyId ? `/api/shipments?studyId=${studyId}` : '/api/shipments/all'
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!resp.ok) {
          setShipments([])
        } else {
          const json = await resp.json()
          setShipments(json.shipments || [])
        }
      } catch {
        setShipments([])
      } finally {
        setLoading(false)
      }
    }
    load() // Always load, whether studyId is provided or not
  }, [studyId, refreshKey])

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse h-5 w-40 bg-gray-700 rounded mb-4" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-700/60 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Shipments</h3>
        <button onClick={onRefresh} className="px-3 py-1.5 text-sm bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md hover:bg-gray-700">
          Refresh
        </button>
      </div>

      {shipments.length === 0 ? (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8 text-center text-gray-400">
          <p>No shipments yet.</p>
          <p className="text-sm mt-1">Use bulk import or internal flow to add shipments.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-700 rounded-lg">
          <table className="min-w-full">
            <thead className="bg-gray-700/50 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">Airway Bill</th>
                {!studyId && <th className="text-left px-4 py-2">Study</th>}
                <th className="text-left px-4 py-2">Accession</th>
                <th className="text-left px-4 py-2">Carrier</th>
                <th className="text-left px-4 py-2">Shipped</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {shipments.map(s => (
                <tr key={s.id} className="text-gray-100">
                  <td className="px-4 py-2 font-mono">{s.airway_bill_number}</td>
                  {!studyId && (
                    <td className="px-4 py-2">
                      <div className="text-sm">
                        <div className="font-medium">{s.study_protocol || 'Unknown'}</div>
                        <div className="text-gray-400 text-xs truncate max-w-xs" title={s.study_title}>
                          {s.study_title || 'Unknown Study'}
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2 font-mono text-sm">{s.accession_number || '-'}</td>
                  <td className="px-4 py-2">{s.carrier}</td>
                  <td className="px-4 py-2">{s.shipped_date ? formatDateUSShort(s.shipped_date) : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      s.tracking_status === 'shipped' ? 'bg-blue-900/20 border border-blue-700 text-blue-300' :
                      s.tracking_status === 'delivered' ? 'bg-green-900/20 border border-green-700 text-green-300' :
                      'bg-gray-900/20 border border-gray-700 text-gray-300'
                    }`}>
                      {s.tracking_status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {s.tracking_status === 'shipped' && (
                      <button
                        onClick={() => handleMarkDelivered(s.id)}
                        disabled={updating === s.id}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updating === s.id ? (
                          <span className="flex items-center space-x-1">
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Marking...</span>
                          </span>
                        ) : (
                          'Mark Delivered'
                        )}
                      </button>
                    )}
                    {s.tracking_status === 'delivered' && (
                      <span className="text-green-400 text-xs">✓ Delivered</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
