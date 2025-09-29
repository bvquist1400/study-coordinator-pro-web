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

type AlertTone = 'red' | 'yellow' | 'blue' | 'purple' | 'gray'

function SummaryPill({ label, count, tone }: { label: string; count: number; tone: 'red' | 'yellow' | 'blue' }) {
  const isZero = count === 0
  const toneClasses: Record<'red' | 'yellow' | 'blue', { border: string; text: string; dot: string }> = {
    red: { border: 'border-red-500/50 bg-red-500/10', text: 'text-red-200', dot: 'bg-red-500' },
    yellow: { border: 'border-yellow-400/60 bg-yellow-500/10', text: 'text-yellow-200', dot: 'bg-yellow-400' },
    blue: { border: 'border-blue-500/50 bg-blue-500/10', text: 'text-blue-200', dot: 'bg-blue-500' }
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
  const storageKey = useMemo(() => `lab-kit-alerts:${studyId}`, [studyId])

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

          return {
            ...raw,
            pendingOrders,
            pendingOrderQuantity,
            originalDeficit
          }
        })
        setForecast(sanitized)
      } else {
        setForecast([])
      }
    } finally {
      setLoading(false)
    }
  }, [studyId, daysAhead])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setDismissed(new Set(parsed))
        }
      }
    } catch (err) {
      console.error('Failed to load dismissed lab kit alerts', err)
    }
  }, [storageKey])

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

  const persistDismissed = useCallback((next: Set<string>) => {
    setDismissed(new Set(next))
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
    }
  }, [storageKey])

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

  const ageInDays = (dateStr: string | null) => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    const ms = now.getTime() - d.getTime()
    return Math.floor(ms / (1000*60*60*24))
  }

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
    () => forecast.filter((item: ForecastItem) => item.deficit <= 0 && (item.kitsAvailable - item.kitsRequired) <= 2),
    [forecast]
  )
  const lowBuffer = lowBufferAll
  const lowBufferCovered = useMemo(
    () => lowBufferAll.filter((item: ForecastItem) => (item.pendingOrderQuantity ?? 0) > 0),
    [lowBufferAll]
  )

  const getKitTypeLabel = (kit: LabKit) => {
    const enriched = kit as LabKit & {
      kit_type_info?: { name?: string | null } | null
      kit_type_label?: string | null
    }
    return enriched.kit_type_info?.name || enriched.kit_type_label || kit.kit_type || ''
  }

  const summary = useMemo(() => {
    const activeCriticalCount = activeSupplyDeficit.length
    return {
      critical: dismissed.has('supplyDeficit') ? 0 : activeCriticalCount,
      warning:
        (dismissed.has('expiringSoon') ? 0 : expiringSoon.length) +
        (dismissed.has('pendingAging') ? 0 : pendingAging.length) +
        (dismissed.has('shippedStuck') ? 0 : shippedStuck.length) +
        (dismissed.has('lowBuffer') ? 0 : lowBuffer.length),
      info: dismissed.has('expired') ? 0 : expired.length
    }
  }, [dismissed, activeSupplyDeficit.length, expiringSoon.length, pendingAging.length, shippedStuck.length, lowBuffer.length, expired.length])

  const totalActiveAlerts = summary.critical + summary.warning + summary.info

  useEffect(() => {
    onCountChange && onCountChange(totalActiveAlerts)
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

  const dismissSection = useCallback((id: string) => {
    const next = new Set(dismissed)
    next.add(id)
    persistDismissed(next)
  }, [dismissed, persistDismissed])

  const restoreAll = useCallback(() => {
    persistDismissed(new Set())
    setOpen(prev => {
      const next = new Set(prev)
      if (activeSupplyDeficit.length > 0) next.add('supplyDeficit')
      if (expiringSoon.length > 0) next.add('expiringSoon')
      if (pendingAging.length > 0) next.add('pendingAging')
      if (shippedStuck.length > 0) next.add('shippedStuck')
      if (lowBuffer.length > 0) next.add('lowBuffer')
      if (expired.length > 0) next.add('expired')
      return next
    })
  }, [persistDismissed, activeSupplyDeficit.length, expiringSoon.length, pendingAging.length, shippedStuck.length, lowBuffer.length, expired.length])

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
  }, [load, onOrderReceived])

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
          defaultQuantity={Math.max(orderTarget.deficit, 1)}
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
          <SummaryPill label="Info" count={summary.info} tone="blue" />
          <span className="text-sm text-gray-500">
            Total open alerts: <span className="text-gray-200 font-semibold">{totalActiveAlerts}</span>
          </span>
          {dismissed.size > 0 && (
            <button
              onClick={restoreAll}
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
      </div>

      {!dismissed.has('supplyDeficit') && (
        <Section
          id="supplyDeficit"
          title="Critical supply issues (deficit)"
          count={activeSupplyDeficit.length}
          tone="red"
          dismissible
          onDismiss={() => dismissSection('supplyDeficit')}
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
          onDismiss={() => dismissSection('expiringSoon')}
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
          onDismiss={() => dismissSection('pendingAging')}
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
          onDismiss={() => dismissSection('shippedStuck')}
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
          title="Low buffer (<= 2 extra kits)"
          count={lowBuffer.length}
          tone="yellow"
          dismissible
          onDismiss={() => dismissSection('lowBuffer')}
          actionLabel="Go to Inventory"
          onAction={() => onNavigate?.('inventory')}
        >
          {lowBuffer.map((item: ForecastItem) => {
            const hasCoverage = (item.pendingOrderQuantity ?? 0) > 0
            return (
              <div
                key={item.key}
                className={`flex items-center justify-between gap-3 rounded px-3 py-2 text-sm ${hasCoverage ? 'border border-blue-500/30 bg-blue-500/10' : ''}`}
              >
                <div>
                  <div className="text-gray-200">{item.kitTypeName}</div>
                  <div className="text-[11px] text-gray-400">
                    Buffer {item.kitsAvailable - item.kitsRequired}
                    {hasCoverage && ` • ${item.pendingOrderQuantity} on order`}
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
          onDismiss={() => dismissSection('expired')}
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
