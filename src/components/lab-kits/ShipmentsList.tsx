'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface ShipmentsListProps {
  studyId: string
  refreshKey: number
  onRefresh: () => void
}

type Shipment = {
  id: string
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  tracking_status: string | null
}

export default function ShipmentsList({ studyId, refreshKey, onRefresh }: ShipmentsListProps) {
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])

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
        const resp = await fetch(`/api/shipments?studyId=${studyId}`, {
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
    if (studyId) load()
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
                <th className="text-left px-4 py-2">Carrier</th>
                <th className="text-left px-4 py-2">Shipped</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {shipments.map(s => (
                <tr key={s.id} className="text-gray-100">
                  <td className="px-4 py-2 font-mono">{s.airway_bill_number}</td>
                  <td className="px-4 py-2">{s.carrier}</td>
                  <td className="px-4 py-2">{s.shipped_date || '-'}</td>
                  <td className="px-4 py-2">{s.tracking_status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
