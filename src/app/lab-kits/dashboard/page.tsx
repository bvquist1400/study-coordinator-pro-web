'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'
import Link from 'next/link'

type Study = { id: string; protocol_number: string; study_title: string }

type Kit = {
  id: string
  study_id: string
  status: 'available' | 'assigned' | 'used' | 'pending_shipment' | 'shipped' | 'delivered' | 'expired' | 'destroyed' | 'archived'
  expiration_date: string | null
  updated_at: string
  created_at: string
}

export default function LabKitsDashboardPage() {
  const [studies, setStudies] = useState<Study[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<Kit[]>([])
  const [loadingKits, setLoadingKits] = useState(false)

  const loadStudies = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const resp = await fetch('/api/studies', { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) return
      const json = await resp.json()
      setStudies(json.studies || [])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadKits = useCallback(async () => {
    try {
      setLoadingKits(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const studyParam = selectedStudyId || 'all'
      const resp = await fetch(`/api/lab-kits?studyId=${studyParam}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) { setKits([]); return }
      const json = await resp.json()
      setKits(json.labKits || [])
    } finally {
      setLoadingKits(false)
    }
  }, [selectedStudyId])

  useEffect(() => { loadStudies() }, [loadStudies])
  useEffect(() => { loadKits() }, [loadKits])

  const now = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const within30 = (dateStr: string | null) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const lim = new Date(now); lim.setDate(now.getDate() + 30)
    return d >= now && d <= lim
  }
  const ageDays = (dateStr: string | null) => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    return Math.floor((now.getTime() - d.getTime())/(1000*60*60*24))
  }

  // KPIs
  const total = kits.length
  const available = kits.filter(k => k.status === 'available').length
  const expiringSoon = kits.filter(k => k.status === 'available' && within30(k.expiration_date)).length
  const pendingShipment = kits.filter(k => k.status === 'pending_shipment').length
  const shipped = kits.filter(k => k.status === 'shipped').length
  const delivered = kits.filter(k => k.status === 'delivered').length

  // Alerts digest (condensed)
  const pendingAging = kits.filter(k => k.status === 'pending_shipment' && ageDays(k.updated_at || k.created_at) >= 7)
  const shippedStuck = kits.filter(k => k.status === 'shipped' && ageDays(k.updated_at || k.created_at) >= 10)

  // Per-study balance (simple): available + expiring soon
  const byStudy = useMemo(() => {
    const map: Record<string, { available: number; expSoon: number }> = {}
    for (const k of kits) {
      if (!map[k.study_id]) map[k.study_id] = { available: 0, expSoon: 0 }
      if (k.status === 'available') {
        map[k.study_id].available += 1
        if (within30(k.expiration_date)) map[k.study_id].expSoon += 1
      }
    }
    return map
  }, [kits])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Lab Kit Dashboard</h1>
            <p className="text-gray-400 mt-1">High-level overview and actions</p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedStudyId('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${selectedStudyId === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'}`}
            >
              All Studies
            </button>
            {studies.map(s => (
              <button key={s.id} onClick={() => setSelectedStudyId(s.id)} className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${selectedStudyId === s.id ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'}`} title={s.study_title}>
                {s.protocol_number}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total', value: total },
            { label: 'Available', value: available },
            { label: 'Expiring <30d', value: expiringSoon },
            { label: 'Pending ship', value: pendingShipment },
            { label: 'Shipped', value: shipped },
            { label: 'Delivered', value: delivered },
          ].map((kpi, idx) => (
            <div key={idx} className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
              <div className="text-xs text-gray-400">{kpi.label}</div>
              <div className="text-2xl font-bold text-white">{loadingKits ? '…' : kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Alerts Digest */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Alerts</h3>
            <Link href={selectedStudyId === 'all' ? '/lab-kits' : `/lab-kits?studyId=${selectedStudyId}`} className="text-sm text-blue-400 hover:text-blue-300">Open management</Link>
          </div>
          <div className="divide-y divide-gray-700">
            <div className="p-4 flex items-center justify-between">
              <div className="text-gray-200">Expiring within 30 days</div>
              <div className="text-yellow-300 font-semibold">{expiringSoon}</div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="text-gray-200">Pending shipment {'>'} 7 days</div>
              <div className="text-purple-300 font-semibold">{pendingAging.length}</div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="text-gray-200">Shipped without delivery {'>'} 10 days</div>
              <div className="text-blue-300 font-semibold">{shippedStuck.length}</div>
            </div>
          </div>
        </div>

        {/* Balance by Study */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Inventory Balance by Study</h3>
            <span className="text-xs text-gray-400">Available and expiring soon</span>
          </div>
          <div className="divide-y divide-gray-700">
            {(selectedStudyId === 'all' ? studies : studies.filter(s => s.id === selectedStudyId)).map(s => {
              const stats = byStudy[s.id] || { available: 0, expSoon: 0 }
              return (
                <div key={s.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">{s.protocol_number}</div>
                    <div className="text-xs text-gray-400 max-w-xl truncate" title={s.study_title}>{s.study_title}</div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-sm text-gray-300">Available: <span className="text-white font-semibold">{stats.available}</span></div>
                    <div className="text-sm text-gray-300">Exp {'<'}30d: <span className="text-yellow-300 font-semibold">{stats.expSoon}</span></div>
                    <Link href={`/lab-kits?studyId=${s.id}`} className="text-blue-400 hover:text-blue-300 text-sm">Open Inventory</Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex flex-wrap gap-3">
            <Link href="/lab-kits" className="px-4 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md hover:bg-gray-700">Go to Inventory</Link>
            <button
              onClick={() => window.location.href = '/lab-kits/bulk-import'}
              disabled={selectedStudyId === 'all'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Inventory
            </button>
            <button
              onClick={() => window.location.href = '/lab-kits'}
              disabled={selectedStudyId === 'all'}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Shipment
            </button>
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
