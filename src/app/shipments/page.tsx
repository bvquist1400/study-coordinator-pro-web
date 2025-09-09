'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

type ShipmentRow = {
  id: string
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  tracking_status: string | null
  accession_number: string | null
  study_protocol: string
  study_title: string
}

export default function ShipmentsPage() {
  const [rows, setRows] = useState<ShipmentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const resp = await fetch('/api/shipments/all', { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (!resp.ok) return
        const json = await resp.json()
        setRows(json.shipments || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-4">All Shipments</h1>
      {loading ? (
        <div className="text-gray-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-400">No shipments found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left">Airway Bill</th>
                <th className="px-3 py-2 text-left">Carrier</th>
                <th className="px-3 py-2 text-left">Shipped</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Accession</th>
                <th className="px-3 py-2 text-left">Study</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-700">
                  <td className="px-3 py-2 font-mono">{r.airway_bill_number || '-'}</td>
                  <td className="px-3 py-2">{r.carrier || '-'}</td>
                  <td className="px-3 py-2">{r.shipped_date ? new Date(r.shipped_date).toLocaleDateString() : '-'}</td>
                  <td className="px-3 py-2">{r.tracking_status || '-'}</td>
                  <td className="px-3 py-2 font-mono">{r.accession_number || '-'}</td>
                  <td className="px-3 py-2">{r.study_protocol} – {r.study_title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

