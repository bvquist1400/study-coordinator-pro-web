'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LabKit } from '@/types/database'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'
import LabKitOrderModal from './LabKitOrderModal'

interface LabKitAlertsPanelProps {
  studyId: string
  daysAhead?: number
  onNavigate?: (dest: 'inventory' | 'expired', options?: { expiringOnly?: boolean }) => void
  onCountChange?: (count: number) => void
  onOrderReceived?: (details: { study_id: string; kit_type_id: string | null; received_date: string | null; kit_type_name: string | null }) => void
}

type RiskFactor = {
  type: string
  score: number
  detail: string
}

type ForecastItem = {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  visitsScheduled: number
  kitsAvailable: number
  kitsRequired: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
  optional: boolean
  originalDeficit: number
  pendingOrderQuantity: number
  pendingOrders: ForecastPendingOrder[]
  requiredWithBuffer: number
  bufferKitsNeeded: number
  bufferMeta: ForecastBufferMeta
  deliveryDaysApplied: number
  recommendedOrderQty: number
  riskScore: number
  riskLevel: 'high' | 'medium' | 'low'
  riskFactors: RiskFactor[]
}

type ForecastPendingOrder = {
  id: string
  quantity: number
  vendor: string | null
  expectedArrival: string | null
  status: 'pending' | 'received' | 'cancelled'
  isOverdue: boolean
  notes: string | null
  createdAt: string
  createdBy: string | null
  receivedDate: string | null
}

type ForecastBufferMeta = {
  source: 'kit-specific' | 'study-default' | 'none'
  appliedDays: number | null
  minCount: number | null
  targetKits: number
  dailyBurnRate: number
  deliveryDays: number
}

type AlertTone = 'red' | 'yellow' | 'blue' | 'purple' | 'gray'

function SummaryPill({ label, count, tone }: { label: string; count: number; tone: 'red' | 'yellow' | 'blue' | 'purple' }) {
  const isZero = count === 0
  const toneClasses: Record<'red' | 'yellow' | 'blue' | 'purple', { border: string; text: string; dot: string }> = {
    red: { border: 'border-red-500/50 bg-red-500/10', text: 'text-red-200', dot: 'bg-red-500' },
    yellow: { border: 'border-yellow-400/60 bg-yellow-500/10', text: 'text-yellow-200', dot: 'bg-yellow-400' },
    blue: { border: 'border-blue-500/50 bg-blue-500/10', text: 'text-blue-200', dot: 'bg-blue-500' },
    purple: { border: 'border-purple-500/50 bg-purple-500/10', text: 'text-purple-200', dot: 'bg-purple-500' }
  }

  const classes = toneClasses[tone]

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${classes.border} ${isZero ? 'opacity-60' : ''}`}
    >
      <span className={`w-2 h-2 rounded-full ${classes.dot}`}></span>
      <span className={`text-xs font-semibold uppercase tracking-wide ${classes.text}`}>{label}</span>
      <span className="text-sm font-bold text-white">{count}</span>
    </div>
  )
}

export default function LabKitAlertsPanel({ studyId, daysAhead = 30, onNavigate, onCountChange, onOrderReceived }: LabKitAlertsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<LabKit[]>([])
  const [forecast, setForecast] = useState<ForecastItem[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [panelNotice, setPanelNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [orderTarget, setOrderTarget] = useState<ForecastItem | null>(null)
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)

  const EXPIRING_DAYS = 30
  const PENDING_AGING_DAYS = 7
  const SHIPPED_AGING_DAYS = 10

  const load = useCallback(async () => {
    if (studyId === 'all') {
      // For multi-study view, keep panel minimal until multi-study alert API is added
      setForecast([])
      setKits([])
      setDismissed(new Set())
      setLoading(false)
      if (onCountChange) {
        onCountChange(0)
      }
      return
    }
    try {
      setLoading(true)
      setPanelNotice(null)
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
        const sanitized: ForecastItem[] = (json.forecast || []).map((raw: any) => {
          const pendingOrdersRaw = Array.isArray(raw?.pendingOrders) ? raw.pendingOrders : []
          const pendingOrders: ForecastPendingOrder[] = pendingOrdersRaw
            .map((order: any) => {
              const id = String(order?.id ?? '').trim()
              if (!id) return null
              const quantity = Number.parseInt(String(order?.quantity ?? '0'), 10)
              const expectedArrival = typeof order?.expectedArrival === 'string'
                ? order.expectedArrival
                : typeof order?.expected_arrival === 'string'
                  ? order.expected_arrival
                  : null
              const receivedDate = typeof order?.receivedDate === 'string'
                ? order.receivedDate
                : typeof order?.received_date === 'string'
                  ? order.received_date
                  : null
              const status = (order?.status === 'received' || order?.status === 'cancelled') ? order.status : 'pending'

              if (!Number.isFinite(quantity) || quantity <= 0) return null

              return {
                id,
                quantity,
                vendor: order?.vendor ?? null,
                expectedArrival,
                status,
                isOverdue: Boolean(order?.isOverdue),
                notes: order?.notes ?? null,
                createdAt: typeof order?.createdAt === 'string' ? order.createdAt : (typeof order?.created_at === 'string' ? order.created_at : ''),
                createdBy: order?.createdBy ?? order?.created_by ?? null,
                receivedDate
              } as ForecastPendingOrder
            })
            .filter(Boolean) as ForecastPendingOrder[]
          const pendingOrderQuantity = typeof raw?.pendingOrderQuantity === 'number' ? raw.pendingOrderQuantity : 0
          const originalDeficit = typeof raw?.originalDeficit === 'number'
            ? raw.originalDeficit
            : Math.max(0, raw?.deficit ?? 0)
          const bufferMetaRaw = raw?.bufferMeta || {}
          const bufferMeta: ForecastBufferMeta = {
            source:
              bufferMetaRaw.source === 'kit-specific' || bufferMetaRaw.source === 'study-default' || bufferMetaRaw.source === 'none'
                ? bufferMetaRaw.source
                : 'none',
            appliedDays: typeof bufferMetaRaw.appliedDays === 'number' ? bufferMetaRaw.appliedDays : null,
            minCount: typeof bufferMetaRaw.minCount === 'number' ? bufferMetaRaw.minCount : null,
            targetKits: typeof bufferMetaRaw.targetKits === 'number' ? bufferMetaRaw.targetKits : (typeof raw?.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0),
            dailyBurnRate: typeof bufferMetaRaw.dailyBurnRate === 'number' ? bufferMetaRaw.dailyBurnRate : 0,
            deliveryDays: typeof bufferMetaRaw.deliveryDays === 'number' ? bufferMetaRaw.deliveryDays : (typeof raw?.deliveryDaysApplied === 'number' ? raw.deliveryDaysApplied : 0)
          }

          return {
            ...raw,
            pendingOrders,
            pendingOrderQuantity,
            originalDeficit,
            requiredWithBuffer: typeof raw?.requiredWithBuffer === 'number' ? raw.requiredWithBuffer : (Number(raw?.kitsRequired) || 0) + (typeof raw?.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0),
            bufferKitsNeeded: typeof raw?.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0,
            bufferMeta,
            deliveryDaysApplied: typeof raw?.deliveryDaysApplied === 'number' ? raw.deliveryDaysApplied : bufferMeta.deliveryDays || 0,
            recommendedOrderQty: typeof raw?.recommendedOrderQty === 'number' ? Math.max(0, Math.round(raw.recommendedOrderQty)) : 0,
            riskScore: typeof raw?.riskScore === 'number' ? raw.riskScore : 0,
            riskLevel: raw?.riskLevel === 'high' || raw?.riskLevel === 'medium' ? raw.riskLevel : 'low',
            riskFactors: Array.isArray(raw?.riskFactors)
              ? (raw.riskFactors as any[]).map((factor, idx) => ({
                  type: typeof factor?.type === 'string' ? factor.type : `factor-${idx}`,
                  score: Number(factor?.score) || 0,
                  detail: typeof factor?.detail === 'string' ? factor.detail : ''
                }))
              : []
          }
        })
        setForecast(sanitized)

        const dismissedAlerts = Array.isArray(json.dismissedAlerts) ? json.dismissedAlerts as string[] : []
        setDismissed(new Set(dismissedAlerts))

        if (Array.isArray(json.autoRestoredAlerts) && json.autoRestoredAlerts.length > 0) {
          const labelMap: Record<string, string> = {
            supplyDeficit: 'Supply deficit',
            expiringSoon: 'Expiring kits',
            pendingAging: 'Pending shipments',
            shippedStuck: 'Shipped without delivery',
            lowBuffer: 'Low buffer',
            expired: 'Expired kits'
          }
          const friendly = json.autoRestoredAlerts.map((id: string) => labelMap[id] || id)
          const label = friendly.length === 1 ? friendly[0] : `${friendly.length} alerts`
          setPanelNotice({ type: 'success', message: `${label} automatically restored.` })
        }
      } else {
        setForecast([])
      }
    } finally {
      setLoading(false)
    }
  }, [studyId, daysAhead, onCountChange])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setOpen(prev => {
      const next = new Set(prev)
      let changed = false
      dismissed.forEach(id => {
        if (next.delete(id)) changed = true
      })
      return changed ? next : prev
    })
  }, [dismissed])

  const ensureOpen = useCallback((id: string, count: number) => {
    if (count <= 0) {
      setOpen(prev => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }
    if (dismissed.has(id)) return
    setOpen(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [dismissed])

  const now = useMemo(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d
  }, [])

  const withinDays = (dateStr: string | null, days: number) => {
    if (!dateStr) return false
    const d = (parseDateUTC(dateStr) || new Date(dateStr)) as Date
    const limit = new Date(now); limit.setDate(now.getDate() + days)
    return d >= now && d <= limit
  }

  const ageInDays = useCallback((dateStr: string | null) => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    const ms = now.getTime() - d.getTime()
    return Math.floor(ms / (1000*60*60*24))
  }, [now])

  // Build categories
  const expiringSoon = kits.filter((kit: LabKit) => kit.status === 'available' && withinDays(kit.expiration_date as any, EXPIRING_DAYS))
  const expired = kits.filter((kit: LabKit) => kit.status === 'expired')
  const pendingAging = kits.filter((kit: LabKit) => kit.status === 'pending_shipment' && ageInDays((kit as any).updated_at || (kit as any).created_at) >= PENDING_AGING_DAYS)
  const shippedStuck = kits.filter((kit: LabKit) => kit.status === 'shipped' && ageInDays((kit as any).updated_at || (kit as any).created_at) >= SHIPPED_AGING_DAYS)
  const supplyDeficit = useMemo<ForecastItem[]>(
    () => forecast.filter((item: ForecastItem) => (item.originalDeficit ?? item.deficit) > 0 || (item.pendingOrderQuantity ?? 0) > 0),
    [forecast]
  )
  const activeSupplyDeficit = useMemo<ForecastItem[]>(
    () => supplyDeficit.filter((item: ForecastItem) => item.deficit > 0),
    [supplyDeficit]
  )
  const lowBufferAll = useMemo(
    () => forecast.filter((item: ForecastItem) => {
      if (item.deficit > 0) return false
      const bufferTarget = item.bufferMeta?.targetKits ?? item.bufferKitsNeeded ?? 0
      const totalTarget = item.requiredWithBuffer ?? (item.kitsRequired + bufferTarget)
      const slackAfterBuffer = item.kitsAvailable - totalTarget
      if (slackAfterBuffer < 0) return false
      const threshold = bufferTarget > 0 ? Math.min(2, bufferTarget) : 2
      return slackAfterBuffer <= threshold
    }),
    [forecast]
  )
  const lowBuffer = lowBufferAll

  const suggestedOrders = useMemo(() => {
    const rank: Record<ForecastItem['riskLevel'], number> = { high: 0, medium: 1, low: 2 }
    return forecast
      .filter((item) => item.recommendedOrderQty > 0)
      .slice()
      .sort((a, b) => {
        const riskDiff = rank[a.riskLevel] - rank[b.riskLevel]
        if (riskDiff !== 0) return riskDiff
        const scoreDiff = b.riskScore - a.riskScore
        if (scoreDiff !== 0) return scoreDiff
        return b.recommendedOrderQty - a.recommendedOrderQty
      })
  }, [forecast])
  const totalSuggestedQuantity = suggestedOrders.reduce((sum, item) => sum + item.recommendedOrderQty, 0)
  const hasSuggestedOrders = suggestedOrders.length > 0

  const getKitTypeLabel = (kit: LabKit) => {
    const enriched = kit as LabKit & {
      kit_type_info?: { name?: string | null } | null
      kit_type_label?: string | null
    }
    return enriched.kit_type_info?.name || enriched.kit_type_label || kit.kit_type || ''
  }

  const buildDismissalConditions = useCallback((id: string): Record<string, unknown> => {
    switch (id) {
      case 'supplyDeficit': {
        const totalDeficit = activeSupplyDeficit.reduce((sum, item) => sum + Math.max(0, item.deficit), 0)
        const maxDeficit = activeSupplyDeficit.reduce((max, item) => Math.max(max, Math.max(0, item.deficit)), 0)
        return {
          deficit: totalDeficit,
          maxDeficit,
          count: activeSupplyDeficit.length
        }
      }
      case 'expiringSoon': {
        let earliest: string | null = null
        for (const kit of expiringSoon) {
          if (kit.expiration_date && (!earliest || kit.expiration_date < earliest)) {
            earliest = kit.expiration_date
          }
        }
        return {
          kitsExpiringSoon: expiringSoon.length,
          earliestExpiryDate: earliest
        }
      }
      case 'pendingAging': {
        const maxDays = pendingAging.reduce((max, kit: LabKit) => {
          const days = ageInDays((kit as any).updated_at || (kit as any).created_at)
          return Math.max(max, days)
        }, 0)
        return {
          count: pendingAging.length,
          maxDays
        }
      }
      case 'shippedStuck': {
        const maxDays = shippedStuck.reduce((max, kit: LabKit) => {
          const days = ageInDays((kit as any).updated_at || (kit as any).created_at)
          return Math.max(max, days)
        }, 0)
        return {
          count: shippedStuck.length,
          maxDays
        }
      }
      case 'lowBuffer': {
        let minSlack: number | null = null
        for (const item of lowBuffer as ForecastItem[]) {
          const bufferTarget = item.bufferMeta?.targetKits ?? item.bufferKitsNeeded ?? 0
          const totalTarget = item.requiredWithBuffer ?? (item.kitsRequired + bufferTarget)
          const slackAfterBuffer = (item.kitsAvailable + (item.pendingOrderQuantity ?? 0)) - totalTarget
          if (slackAfterBuffer >= 0) {
            if (minSlack === null || slackAfterBuffer < minSlack) {
              minSlack = slackAfterBuffer
            }
          }
        }
        return {
          count: lowBuffer.length,
          minSlack
        }
      }
      case 'expired': {
        return { count: expired.length }
      }
      default:
        return {}
    }
  }, [activeSupplyDeficit, expiringSoon, pendingAging, shippedStuck, lowBuffer, expired, ageInDays])

  const dismissAlert = useCallback(async (alertId: string, conditions: Record<string, unknown>) => {
    if (studyId === 'all') return false
    try {
      setPanelNotice(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required. Please sign in again.')

      const response = await fetch('/api/lab-kit-alerts/dismiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ study_id: studyId, alert_id: alertId, conditions })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to dismiss alert.')
      }

      setDismissed(prev => {
        const next = new Set(prev)
        next.add(alertId)
        return next
      })

      return true
    } catch (error) {
      setPanelNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to dismiss alert.' })
      return false
    }
  }, [studyId])

  const restoreAlert = useCallback(async (alertId: string) => {
    if (studyId === 'all') return false
    try {
      setPanelNotice(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required. Please sign in again.')

      const params = new URLSearchParams({ study_id: studyId, alert_id: alertId })
      const response = await fetch(`/api/lab-kit-alerts/dismiss?${params.toString()}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to restore alert.')
      }

      setDismissed(prev => {
        const next = new Set(prev)
        next.delete(alertId)
        return next
      })

      return true
    } catch (error) {
      setPanelNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to restore alert.' })
      return false
    }
  }, [studyId])

  const summary = useMemo(() => {
    const activeCriticalCount = activeSupplyDeficit.length
    return {
      critical: dismissed.has('supplyDeficit') ? 0 : activeCriticalCount,
      warning:
        (dismissed.has('expiringSoon') ? 0 : expiringSoon.length) +
        (dismissed.has('pendingAging') ? 0 : pendingAging.length) +
        (dismissed.has('shippedStuck') ? 0 : shippedStuck.length) +
        (dismissed.has('lowBuffer') ? 0 : lowBuffer.length),
      info: dismissed.has('expired') ? 0 : expired.length,
      suggested: suggestedOrders.length
    }
  }, [dismissed, activeSupplyDeficit.length, expiringSoon.length, pendingAging.length, shippedStuck.length, lowBuffer.length, expired.length, suggestedOrders.length])

  const totalActiveAlerts = summary.critical + summary.warning + summary.info + summary.suggested

  useEffect(() => {
    if (onCountChange) {
      onCountChange(totalActiveAlerts)
    }
  }, [totalActiveAlerts, onCountChange])

  useEffect(() => { ensureOpen('supplyDeficit', activeSupplyDeficit.length) }, [ensureOpen, activeSupplyDeficit.length])
  useEffect(() => { ensureOpen('expiringSoon', expiringSoon.length) }, [ensureOpen, expiringSoon.length])
  useEffect(() => { ensureOpen('pendingAging', pendingAging.length) }, [ensureOpen, pendingAging.length])
  useEffect(() => { ensureOpen('shippedStuck', shippedStuck.length) }, [ensureOpen, shippedStuck.length])
  useEffect(() => { ensureOpen('lowBuffer', lowBuffer.length) }, [ensureOpen, lowBuffer.length])
  useEffect(() => { ensureOpen('expired', expired.length) }, [ensureOpen, expired.length])

  const toggle = (key: string) => {
    const n = new Set(open)
    if (n.has(key)) n.delete(key); else n.add(key)
    setOpen(n)
  }

  const dismissSection = useCallback(async (id: string) => {
    const conditions = buildDismissalConditions(id)
    const success = await dismissAlert(id, conditions)
    if (success) {
      setOpen(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [buildDismissalConditions, dismissAlert])

  const restoreAll = useCallback(async () => {
    const ids = Array.from(dismissed)
    if (ids.length === 0) return
    const results = await Promise.all(ids.map(alertId => restoreAlert(alertId)))
    if (results.some(Boolean)) {
      setPanelNotice({ type: 'success', message: 'Hidden alerts restored.' })
    }
  }, [dismissed, restoreAlert])

  const handleOrderSuccess = useCallback(async (message?: string) => {
    await load()
    setPanelNotice({ type: 'success', message: message || 'Order placed successfully.' })
  }, [load])

  const closeOrderModal = useCallback(() => {
    setOrderTarget(null)
  }, [])

  const markOrderReceived = useCallback(async (orderId: string, kitTypeId: string | null, kitTypeName: string | null) => {
    try {
      setProcessingOrderId(orderId)
      setPanelNotice(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required. Please sign in again.')

      const response = await fetch(`/api/lab-kit-orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'received' })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update order status')
      }

      const body = await response.json().catch(() => ({}))
      const receivedDate = body?.order?.received_date || new Date().toISOString().slice(0, 10)

      onOrderReceived?.({
        study_id: studyId,
        kit_type_id: kitTypeId,
        received_date: receivedDate,
        kit_type_name: kitTypeName
      })

      await load()
      setPanelNotice({ type: 'success', message: 'Order marked as received.' })
    } catch (error) {
      setPanelNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update order status.' })
    } finally {
      setProcessingOrderId(null)
    }
  }, [load, onOrderReceived, studyId])

  const Section = ({
    id,
    title,
    count,
    tone,
    children,
    actionLabel,
    onAction,
    dismissible,
    onDismiss,
    forceShowChildren
  }: {
    id: string
    title: string
    count: number
    tone: AlertTone
    children?: React.ReactNode
    actionLabel?: string
    onAction?: () => void
    dismissible?: boolean
    onDismiss?: () => void
    forceShowChildren?: boolean
  }) => {
    const toneDot = tone === 'red'
      ? 'bg-red-500'
      : tone === 'yellow'
        ? 'bg-yellow-400'
        : tone === 'purple'
          ? 'bg-purple-400'
          : tone === 'blue'
            ? 'bg-blue-400'
            : 'bg-gray-400'

    return (
      <div className="border-b border-gray-700">
        <div className="p-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggle(id)}
            className="flex items-center gap-3 text-left flex-1"
          >
            <div className={`w-2 h-2 rounded-full ${toneDot}`}></div>
            <div className="flex-1">
              <div className="text-white font-medium">{title}</div>
            </div>
            <div className={`text-xs px-2 py-0.5 rounded border ${count > 0 ? 'border-current text-gray-200' : 'border-gray-600 text-gray-400'}`}>{count}</div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${open.has(id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            {dismissible && (
              <button
                className="text-xs text-gray-300 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation()
                  onDismiss?.()
                }}
              >
                Dismiss
              </button>
            )}
            {onAction && (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onAction()
                }}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                {actionLabel || 'Open'}
              </button>
            )}
          </div>
        </div>
        {open.has(id) && (
          <div className="px-4 pb-4">
            {count === 0 && !forceShowChildren ? (
              <div className="text-sm text-gray-400">No items</div>
            ) : (
              <div className="space-y-2">{children}</div>
            )}
          </div>
        )}
      </div>
    )
  }

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
    <>
      {orderTarget && (
        <LabKitOrderModal
          studyId={studyId}
          isOpen={!!orderTarget}
          onClose={closeOrderModal}
          onSuccess={handleOrderSuccess}
          defaultKitTypeId={orderTarget.kitTypeId || undefined}
          defaultKitTypeName={orderTarget.kitTypeName}
          defaultQuantity={Math.max(orderTarget.recommendedOrderQty ?? orderTarget.deficit ?? 1, 1)}
          defaultVendor={orderTarget.pendingOrders.find((order: ForecastPendingOrder) => Boolean(order.vendor))?.vendor ?? undefined}
          allowKitTypeChange={false}
          deficitSummary={{
            original: orderTarget.originalDeficit ?? orderTarget.deficit,
            outstanding: orderTarget.deficit,
            pending: orderTarget.pendingOrderQuantity ?? 0
          }}
        />
      )}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="p-6 border-b border-gray-700 space-y-4">
        <div>
          <h3 className="text-xl font-bold text-white">Alerts</h3>
          <p className="text-gray-400 text-sm">Consolidated view across inventory and forecast</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SummaryPill label="Critical" count={summary.critical} tone="red" />
          <SummaryPill label="Warning" count={summary.warning} tone="yellow" />
          <SummaryPill label="Suggested" count={summary.suggested} tone="purple" />
          <SummaryPill label="Info" count={summary.info} tone="blue" />
          <span className="text-sm text-gray-500">
            Total open alerts: <span className="text-gray-200 font-semibold">{totalActiveAlerts}</span>
          </span>
          {dismissed.size > 0 && (
            <button
              onClick={() => { void restoreAll() }}
              className="ml-auto text-xs text-blue-400 hover:text-blue-200"
            >
              Restore hidden
            </button>
          )}
        </div>
        {panelNotice && (
          <div className={`text-sm ${panelNotice.type === 'error' ? 'text-red-300' : 'text-green-300'}`}>
            {panelNotice.message}
          </div>
        )}
      {hasSuggestedOrders && (
        <div className="border-b border-gray-700 bg-purple-500/5 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Suggested Orders</h4>
            <span className="text-xs text-purple-200/80">{`Top ${Math.min(3, suggestedOrders.length)} of ${suggestedOrders.length}`}</span>
          </div>
          {suggestedOrders.length === 0 ? (
            <p className="text-xs text-purple-200/70">All kit types appear covered.</p>
          ) : (
            <div className="space-y-2">
              {suggestedOrders.slice(0, 3).map((item) => {
                const primaryFactor = item.riskFactors.find((factor) => factor.type === 'deficit' || factor.type === 'surge') || item.riskFactors[0]
                return (
                  <div key={item.key} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-purple-500/40 bg-purple-500/10 px-4 py-3">
                    <div className="text-sm text-purple-100">
                      <div className="font-medium text-white">{item.kitTypeName}</div>
                      <div className="text-xs text-purple-200/80">
                        {primaryFactor?.detail || 'Covers upcoming demand and delivery window'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <div className="text-sm font-semibold text-purple-100">Order {item.recommendedOrderQty}</div>
                      {item.deliveryDaysApplied > 0 && (
                        <div className="text-[10px] uppercase tracking-wide text-purple-200/70">Delivery {item.deliveryDaysApplied}d</div>
                      )}
                      <button
                        type="button"
                        onClick={() => setOrderTarget(item)}
                        className="mt-1 rounded border border-purple-400/60 px-3 py-1 text-[11px] font-semibold text-purple-200 hover:border-purple-300 hover:text-purple-100"
                      >
                        Plan order
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {suggestedOrders.length > 3 && (
            <p className="text-xs text-purple-200/70 mt-2">{`+${suggestedOrders.length - 3} more kit type${suggestedOrders.length - 3 === 1 ? '' : 's'} flagged below`}</p>
          )}
          <div className="text-xs text-purple-200/70 mt-2">Total recommended quantity: {totalSuggestedQuantity}</div>
        </div>
      )}

      </div>

      {!dismissed.has('supplyDeficit') && (
        <Section
          id="supplyDeficit"
          title="Critical supply issues (deficit)"
          count={activeSupplyDeficit.length}
          tone="red"
          dismissible
          onDismiss={() => { void dismissSection('supplyDeficit') }}
          actionLabel="Go to Inventory"
          onAction={() => onNavigate?.('inventory') }
          forceShowChildren={supplyDeficit.length > 0}
        >
          {supplyDeficit.map(item => {
            const outstanding = item.deficit
            const pendingQty = item.pendingOrderQuantity
            const original = item.originalDeficit
            return (
              <div key={item.key} className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{item.kitTypeName}</div>
                    <div className="text-xs text-gray-400">
                      {original > 0 ? `Need ${original} kit${original === 1 ? '' : 's'} in horizon` : 'No forecasted demand'}.
                      {pendingQty > 0 && ` ${pendingQty} on order.`}
                      {outstanding > 0 ? ` ${outstanding} still outstanding.` : pendingQty > 0 ? ' Outstanding fully covered.' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation()
                      setOrderTarget(item)
                    }}
                    className="rounded border border-blue-500/60 px-3 py-1 text-xs font-semibold text-blue-300 hover:border-blue-400 hover:text-blue-200"
                  >
                    Order kits
                  </button>
                </div>
                {item.pendingOrders.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {item.pendingOrders.map(order => (
                      <div
                        key={order.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-700/60 bg-gray-900/40 px-3 py-2 text-xs text-gray-300"
                      >
                        <div className="space-y-1">
                          <div>
                            <span className="font-medium text-gray-100">{order.quantity} kit{order.quantity === 1 ? '' : 's'}</span>
                            {order.vendor && <span className="text-gray-400"> • {order.vendor}</span>}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {order.expectedArrival ? `ETA ${formatDateUTC(order.expectedArrival)}` : 'ETA not set'}
                            {order.isOverdue && <span className="ml-2 text-red-400 font-semibold">Overdue</span>}
                            {order.status === 'pending' && !order.isOverdue && (
                              <span className="ml-2 text-gray-500">Pending</span>
                            )}
                            {order.status === 'received' && (
                              <span className="ml-2 text-green-400">Received{order.receivedDate ? ` ${formatDateUTC(order.receivedDate)}` : ''}</span>
                            )}
                            {order.status === 'cancelled' && (
                              <span className="ml-2 text-gray-500">Cancelled</span>
                            )}
                          </div>
                          {order.notes && <div className="text-[11px] text-gray-500">{order.notes}</div>}
                        </div>
                        {order.status === 'pending' && (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              markOrderReceived(order.id, item.kitTypeId ?? null, item.kitTypeName)
                            }}
                            disabled={processingOrderId === order.id}
                            className={`text-xs font-semibold ${processingOrderId === order.id ? 'text-gray-500' : 'text-green-300 hover:text-green-200'}`}
                          >
                            {processingOrderId === order.id ? 'Updating…' : 'Mark received'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {activeSupplyDeficit.length === 0 && supplyDeficit.length > 0 && (
            <div className="rounded-md border border-gray-700 bg-gray-900/40 px-3 py-2 text-xs text-gray-400">
              All identified deficits are covered by pending orders. If deliveries slip, the alerts will reopen automatically.
            </div>
          )}
        </Section>
      )}

      {!dismissed.has('expiringSoon') && (
        <Section
          id="expiringSoon"
          title={`Expiring within ${EXPIRING_DAYS} days`}
          count={expiringSoon.length}
          tone="yellow"
          dismissible
          onDismiss={() => { void dismissSection('expiringSoon') }}
          actionLabel="View in Inventory"
          onAction={() => onNavigate?.('inventory', { expiringOnly: true }) }
        >
          {expiringSoon.slice(0, 10).map((kit: LabKit) => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">
                {kit.accession_number}
                <span className="text-gray-400"> {getKitTypeLabel(kit)}</span>
              </div>
              <div className="text-yellow-300">{kit.expiration_date ? formatDateUTC(kit.expiration_date) : '—'}</div>
            </div>
          ))}
          {expiringSoon.length > 10 && (
            <div className="text-xs text-gray-400">+{expiringSoon.length - 10} more…</div>
          )}
        </Section>
      )}

      {!dismissed.has('pendingAging') && (
        <Section
          id="pendingAging"
          title={`Pending shipment > ${PENDING_AGING_DAYS} days`}
          count={pendingAging.length}
          tone="purple"
          dismissible
          onDismiss={() => { void dismissSection('pendingAging') }}
          actionLabel="Go to Inventory"
          onAction={() => onNavigate?.('inventory')}
        >
          {pendingAging.slice(0, 10).map((kit: LabKit) => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">{kit.accession_number}</div>
              <div className="text-gray-400">{ageInDays((kit as any).updated_at || (kit as any).created_at)} days</div>
            </div>
          ))}
          {pendingAging.length > 10 && (
            <div className="text-xs text-gray-400">+{pendingAging.length - 10} more…</div>
          )}
        </Section>
      )}

      {!dismissed.has('shippedStuck') && (
        <Section
          id="shippedStuck"
          title={`Shipped without delivery > ${SHIPPED_AGING_DAYS} days`}
          count={shippedStuck.length}
          tone="blue"
          dismissible
          onDismiss={() => { void dismissSection('shippedStuck') }}
          actionLabel="Go to Inventory"
          onAction={() => onNavigate?.('inventory')}
        >
          {shippedStuck.slice(0, 10).map((kit: LabKit) => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">{kit.accession_number}</div>
              <div className="text-gray-400">{ageInDays((kit as any).updated_at || (kit as any).created_at)} days</div>
            </div>
          ))}
          {shippedStuck.length > 10 && (
            <div className="text-xs text-gray-400">+{shippedStuck.length - 10} more…</div>
          )}
        </Section>
      )}

      {!dismissed.has('lowBuffer') && (
        <Section
          id="lowBuffer"
          title="Low safety buffer"
          count={lowBuffer.length}
          tone="yellow"
          dismissible
          onDismiss={() => { void dismissSection('lowBuffer') }}
          actionLabel="Go to Inventory"
          onAction={() => onNavigate?.('inventory')}
        >
          {lowBuffer.map((item: ForecastItem) => {
            const hasCoverage = (item.pendingOrderQuantity ?? 0) > 0
            const bufferTarget = item.bufferMeta?.targetKits ?? item.bufferKitsNeeded ?? 0
            const totalTarget = item.requiredWithBuffer ?? (item.kitsRequired + bufferTarget)
            const slackAfterBuffer = item.kitsAvailable - totalTarget
            const descriptor = item.bufferMeta?.source === 'kit-specific'
              ? 'Kit override'
              : item.bufferMeta?.source === 'study-default'
                ? 'Study default'
                : 'No buffer configured'
            return (
              <div
                key={item.key}
                className={`flex items-center justify-between gap-3 rounded px-3 py-2 text-sm ${hasCoverage ? 'border border-blue-500/30 bg-blue-500/10' : ''}`}
              >
                <div>
                  <div className="text-gray-200">{item.kitTypeName}</div>
                  <div className="text-[11px] text-gray-400">
                    {descriptor}
                    {bufferTarget > 0 ? ` · Target ${bufferTarget} kit${bufferTarget === 1 ? '' : 's'}` : ''}
                    {slackAfterBuffer > 0 ? ` · ${slackAfterBuffer} kit${slackAfterBuffer === 1 ? '' : 's'} ready` : ' · Buffer depleted'}
                    {hasCoverage && ` · ${item.pendingOrderQuantity} on order`}
                  </div>
                </div>
                {hasCoverage && (
                  <span className="text-xs font-semibold text-blue-200">Pending order</span>
                )}
              </div>
            )
          })}
        </Section>
      )}

      {!dismissed.has('expired') && (
        <Section
          id="expired"
          title="Expired kits"
          count={expired.length}
          tone="gray"
          dismissible
          onDismiss={() => { void dismissSection('expired') }}
          actionLabel="Go to Expired View"
          onAction={() => onNavigate?.('expired')}
        >
          {expired.slice(0, 10).map((kit: LabKit) => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">{kit.accession_number}</div>
              <div className="text-red-400">{kit.expiration_date ? formatDateUTC(kit.expiration_date) : '—'}</div>
            </div>
          ))}
          {expired.length > 10 && (
            <div className="text-xs text-gray-400">+{expired.length - 10} more…</div>
          )}
        </Section>
      )}
      </div>
    </>
  )
}
