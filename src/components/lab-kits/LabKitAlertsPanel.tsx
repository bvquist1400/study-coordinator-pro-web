'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LabKit } from '@/types/database'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'

interface LabKitAlertsPanelProps {
  studyId: string
  daysAhead?: number
  onNavigate?: (dest: 'inventory' | 'expired', options?: { expiringOnly?: boolean }) => void
  onCountChange?: (count: number) => void
}

type ForecastItem = {
  visitName: string
  visitsScheduled: number
  kitsAvailable: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
}

export default function LabKitAlertsPanel({ studyId, daysAhead = 30, onNavigate, onCountChange }: LabKitAlertsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<LabKit[]>([])
  const [forecast, setForecast] = useState<ForecastItem[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())

  const EXPIRING_DAYS = 30
  const PENDING_AGING_DAYS = 7
  const SHIPPED_AGING_DAYS = 10

  const load = useCallback(async () => {
    if (studyId === 'all') {
      // For multi-study view, keep panel minimal until multi-study alert API is added
      setForecast([])
      setKits([])
      setLoading(false)
      onCountChange && onCountChange(0)
      return
    }
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const [kitsRes, fcRes] = await Promise.all([
        fetch(`/api/lab-kits?studyId=${studyId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/inventory-forecast?study_id=${studyId}&days=${daysAhead}`, { headers: { Authorization: `Bearer ${token}` } })
      ])

      if (kitsRes.ok) {
        const json = await kitsRes.json()
        setKits(json.labKits || [])
      } else {
        setKits([])
      }

      if (fcRes.ok) {
        const json = await fcRes.json()
        setForecast(json.forecast || [])
      } else {
        setForecast([])
      }
    } finally {
      setLoading(false)
    }
  }, [studyId, daysAhead])

  useEffect(() => { load() }, [load])

  const now = useMemo(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d
  }, [])

  const withinDays = (dateStr: string | null, days: number) => {
    if (!dateStr) return false
    const d = (parseDateUTC(dateStr) || new Date(dateStr)) as Date
    const limit = new Date(now); limit.setDate(now.getDate() + days)
    return d >= now && d <= limit
  }

  const ageInDays = (dateStr: string | null) => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    const ms = now.getTime() - d.getTime()
    return Math.floor(ms / (1000*60*60*24))
  }

  // Build categories
  const expiringSoon = kits.filter(k => k.status === 'available' && withinDays(k.expiration_date as any, EXPIRING_DAYS))
  const expired = kits.filter(k => k.status === 'expired')
  const pendingAging = kits.filter(k => k.status === 'pending_shipment' && ageInDays((k as any).updated_at || (k as any).created_at) >= PENDING_AGING_DAYS)
  const shippedStuck = kits.filter(k => k.status === 'shipped' && ageInDays((k as any).updated_at || (k as any).created_at) >= SHIPPED_AGING_DAYS)
  const supplyDeficit = forecast.filter(f => f.deficit > 0)
  const lowBuffer = forecast.filter(f => f.deficit <= 0 && (f.kitsAvailable - f.visitsScheduled) <= 2)

  const totalAlerts = expiringSoon.length + expired.length + pendingAging.length + shippedStuck.length + supplyDeficit.length + lowBuffer.length

  useEffect(() => {
    onCountChange && onCountChange(totalAlerts)
  }, [totalAlerts, onCountChange])

  useEffect(() => {
    // Open critical sections by default
    const o = new Set<string>()
    if (supplyDeficit.length > 0) o.add('supplyDeficit')
    if (expiringSoon.length > 0) o.add('expiringSoon')
    if (pendingAging.length > 0) o.add('pendingAging')
    setOpen(o)
  }, [supplyDeficit.length, expiringSoon.length, pendingAging.length])

  const toggle = (key: string) => {
    const n = new Set(open)
    if (n.has(key)) n.delete(key); else n.add(key)
    setOpen(n)
  }

  const Section = ({ id, title, count, tone, children, actionLabel, onAction }: { id: string; title: string; count: number; tone: 'red'|'yellow'|'blue'|'purple'|'gray'; children?: React.ReactNode; actionLabel?: string; onAction?: () => void }) => (
    <div className="border-b border-gray-700">
      <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => toggle(id)}>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${tone === 'red' ? 'bg-red-500' : tone === 'yellow' ? 'bg-yellow-400' : tone === 'purple' ? 'bg-purple-400' : tone === 'blue' ? 'bg-blue-400' : 'bg-gray-400'}`}></div>
          <div className="text-white font-medium">{title}</div>
          <div className={`text-xs px-2 py-0.5 rounded border ${count > 0 ? 'border-current' : 'border-gray-600 text-gray-400'}`}>{count}</div>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${open.has(id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open.has(id) && (
        <div className="px-4 pb-4">
          {count === 0 ? (
            <div className="text-sm text-gray-400">No items</div>
          ) : (
            <div className="space-y-2">{children}</div>
          )}
          {onAction && (
            <div className="mt-3">
              <button onClick={onAction} className="text-blue-400 hover:text-blue-300 text-sm font-medium">{actionLabel || 'Open'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (studyId === 'all') {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 text-gray-400">
        Select a study to view consolidated alerts.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700">
        <h3 className="text-xl font-bold text-white">Alerts</h3>
        <p className="text-gray-400 text-sm">Consolidated view across inventory and forecast</p>
      </div>

      <Section id="supplyDeficit" title="Critical supply issues (deficit)" count={supplyDeficit.length} tone="red" actionLabel="Go to Inventory" onAction={() => onNavigate?.('inventory') }>
        {supplyDeficit.map(item => (
          <div key={item.visitName} className="flex items-center justify-between text-sm">
            <div className="text-gray-200">{item.visitName}</div>
            <div className="text-red-400 font-semibold">-{item.deficit} kits</div>
          </div>
        ))}
      </Section>

      <Section id="expiringSoon" title={`Expiring within ${EXPIRING_DAYS} days`} count={expiringSoon.length} tone="yellow" actionLabel="View in Inventory" onAction={() => onNavigate?.('inventory', { expiringOnly: true }) }>
        {expiringSoon.slice(0, 10).map(k => (
          <div key={k.id} className="flex items-center justify-between text-sm">
            <div className="text-gray-200">{k.accession_number} <span className="text-gray-400">{k.kit_type || ''}</span></div>
            <div className="text-yellow-300">{k.expiration_date ? formatDateUTC(k.expiration_date) : '—'}</div>
          </div>
        ))}
        {expiringSoon.length > 10 && (
          <div className="text-xs text-gray-400">+{expiringSoon.length - 10} more…</div>
        )}
      </Section>

      <Section id="pendingAging" title={`Pending shipment > ${PENDING_AGING_DAYS} days`} count={pendingAging.length} tone="purple" actionLabel="Go to Inventory" onAction={() => onNavigate?.('inventory')}>
        {pendingAging.slice(0, 10).map(k => (
          <div key={k.id} className="flex items-center justify-between text-sm">
            <div className="text-gray-200">{k.accession_number}</div>
            <div className="text-gray-400">{ageInDays((k as any).updated_at || (k as any).created_at)} days</div>
          </div>
        ))}
        {pendingAging.length > 10 && (
          <div className="text-xs text-gray-400">+{pendingAging.length - 10} more…</div>
        )}
      </Section>

      <Section id="shippedStuck" title={`Shipped without delivery > ${SHIPPED_AGING_DAYS} days`} count={shippedStuck.length} tone="blue" actionLabel="Go to Inventory" onAction={() => onNavigate?.('inventory')}>
        {shippedStuck.slice(0, 10).map(k => (
          <div key={k.id} className="flex items-center justify-between text-sm">
            <div className="text-gray-200">{k.accession_number}</div>
            <div className="text-gray-400">{ageInDays((k as any).updated_at || (k as any).created_at)} days</div>
          </div>
        ))}
        {shippedStuck.length > 10 && (
          <div className="text-xs text-gray-400">+{shippedStuck.length - 10} more…</div>
        )}
      </Section>

      <Section id="lowBuffer" title="Low buffer (<= 2 extra kits)" count={lowBuffer.length} tone="yellow" actionLabel="Go to Inventory" onAction={() => onNavigate?.('inventory')}>
        {lowBuffer.map(item => (
          <div key={item.visitName} className="flex items-center justify-between text-sm">
            <div className="text-gray-200">{item.visitName}</div>
            <div className="text-yellow-300">buffer {item.kitsAvailable - item.visitsScheduled}</div>
          </div>
        ))}
      </Section>

      <Section id="expired" title="Expired kits" count={expired.length} tone="red" actionLabel="Go to Expired View" onAction={() => onNavigate?.('expired')}>
        {expired.slice(0, 10).map(k => (
          <div key={k.id} className="flex items-center justify-between text-sm">
            <div className="text-gray-200">{k.accession_number}</div>
            <div className="text-red-400">{k.expiration_date ? formatDateUTC(k.expiration_date) : '—'}</div>
          </div>
        ))}
        {expired.length > 10 && (
          <div className="text-xs text-gray-400">+{expired.length - 10} more…</div>
        )}
      </Section>
    </div>
  )
}
