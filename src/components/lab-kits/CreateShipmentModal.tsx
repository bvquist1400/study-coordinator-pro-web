'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { todayLocalISODate } from '@/lib/date-utils'

interface CreateShipmentModalProps {
  studyId: string
  onClose: () => void
  onSuccess: () => void
}

type LabKit = {
  id: string
  accession_number: string
  kit_type: string | null
  status: string
}

export default function CreateShipmentModal({ studyId, onClose, onSuccess }: CreateShipmentModalProps) {
  const [kits, setKits] = useState<LabKit[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualAccession, setManualAccession] = useState('')
  const [manualAccessionList, setManualAccessionList] = useState<Set<string>>(new Set())
  const [airwayBill, setAirwayBill] = useState('')
  const [carrier, setCarrier] = useState<'fedex' | 'ups' | 'other'>('fedex')
  const [shippedDate, setShippedDate] = useState(todayLocalISODate())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        // Fetch eligible kits (status = pending_shipment)
        const resp = await fetch(`/api/lab-kits?studyId=${studyId}&status=pending_shipment`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!resp.ok) {
          setKits([])
        } else {
          const { labKits } = await resp.json()
          setKits(labKits || [])
        }
      } catch (_e) {
        setKits([])
      } finally {
        setLoading(false)
      }
    }
    if (studyId) load()
  }, [studyId])

  const toggle = (id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  const submit = async () => {
    if (!airwayBill.trim()) {
      setErrorMsg('Airway bill number is required')
      return
    }
    if (selected.size === 0 && manualAccessionList.size === 0) {
      setErrorMsg('Select at least one kit or enter accession numbers')
      return
    }
    try {
      setSubmitting(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const resp = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          labKitIds: Array.from(selected),
          accessionNumbers: Array.from(manualAccessionList),
          airwayBillNumber: airwayBill.trim(),
          carrier,
          shippedDate: shippedDate || null,
          studyId
        })
      })
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({ error: 'Failed to create shipments' }))
        setErrorMsg(e.error)
        return
      }
      onSuccess()
      onClose()
    } catch (_e) {
      setErrorMsg('Failed to create shipments')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Create Shipment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-6 space-y-6 max-h-[calc(90vh-180px)] overflow-y-auto">
          {errorMsg && (
            <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{errorMsg}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Airway Bill *</label>
              <input value={airwayBill} onChange={e => setAirwayBill(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Carrier</label>
              <select value={carrier} onChange={e => setCarrier(e.target.value as any)} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2">
                <option value="fedex">FedEx</option>
                <option value="ups">UPS</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Shipped Date</label>
              <input type="date" value={shippedDate} onChange={e => setShippedDate(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2" />
            </div>
          </div>

          {/* Manual accession numbers input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Add Accession Numbers (optional)</label>
            <div className="flex gap-2">
              <input
                value={manualAccession}
                onChange={e => setManualAccession(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = manualAccession.trim()
                    if (v) {
                      setManualAccessionList(prev => new Set(prev).add(v))
                      setManualAccession('')
                    }
                  }
                }}
                placeholder="Scan or type accession number"
                className="flex-1 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2"
              />
              <button
                type="button"
                onClick={() => { const v = manualAccession.trim(); if (v) { setManualAccessionList(prev => new Set(prev).add(v)); setManualAccession('') } }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >Add</button>
            </div>
            {manualAccessionList.size > 0 && (
              <div className="flex flex-wrap gap-2">
                {Array.from(manualAccessionList).map(acc => (
                  <span key={acc} className="inline-flex items-center bg-gray-700/60 border border-gray-600 text-gray-100 rounded-full px-3 py-1 text-sm">
                    <span className="font-mono mr-2">{acc}</span>
                    <button onClick={() => setManualAccessionList(prev => { const n = new Set(prev); n.delete(acc); return n })} className="text-gray-300 hover:text-white">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-md font-semibold text-white mb-2">Select Kits (status: pending_shipment)</h3>
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700/50 text-gray-300">
                  <tr>
                    <th className="px-3 py-2 w-12"></th>
                    <th className="px-3 py-2 text-left">Accession #</th>
                    <th className="px-3 py-2 text-left">Kit Type</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {loading ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-gray-400">Loading kits...</td></tr>
                  ) : kits.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-gray-400">No eligible kits</td></tr>
                  ) : (
                    kits.map(kit => (
                      <tr key={kit.id} className="text-gray-100">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(kit.id)} onChange={e => toggle(kit.id, e.target.checked)} />
                        </td>
                        <td className="px-3 py-2 font-mono">{kit.accession_number}</td>
                        <td className="px-3 py-2">{kit.kit_type || '-'}</td>
                        <td className="px-3 py-2">{kit.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white" disabled={submitting}>Cancel</button>
          <button onClick={submit} disabled={submitting || !airwayBill.trim() || (selected.size === 0 && manualAccessionList.size === 0)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Shipment'}
          </button>
        </div>
      </div>
    </div>
  )
}
