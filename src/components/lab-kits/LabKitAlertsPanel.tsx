'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'
import LabKitOrderModal from './LabKitOrderModal'
import { useLabKitAlertDismissals } from '@/hooks/useLabKitAlertDismissals'
import { useGroupedLabKitAlerts, type SupplyDeficitAlert } from '@/hooks/useGroupedLabKitAlerts'
import { useLabKitRecommendations, type LabKitRecommendationItem } from '@/hooks/useLabKitRecommendations'

interface LabKitAlertsPanelProps {
  studyId: string
  daysAhead?: number
  onNavigate?: (
    dest: 'inventory' | 'expired' | 'shipments',
    options?: { expiringOnly?: boolean; shipmentFilter?: 'pending-aging' | 'shipped-stuck' }
  ) => void
  onCountChange?: (count: number) => void
  onOrderReceived?: (details: { study_id: string; kit_type_id: string | null; received_date: string | null; kit_type_name: string | null }) => void
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
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [panelNotice, setPanelNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [orderTarget, setOrderTarget] = useState<SupplyDeficitAlert | null>(null)
  const [recommendationOrder, setRecommendationOrder] = useState<LabKitRecommendationItem | null>(null)
  const [pendingRecommendationId, setPendingRecommendationId] = useState<string | null>(null)
  const [pendingDismissId, setPendingDismissId] = useState<string | null>(null)
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)

  const EXPIRING_DAYS = 30
  const PENDING_AGING_DAYS = 7
  const SHIPPED_AGING_DAYS = 10
  const dismissalScope = studyId === 'all' ? null : studyId
  const {
    dismissedHashes,
    isLoading: dismissalsLoading,
    error: dismissalsError,
    dismiss: persistDismissal,
    restore: restoreDismissals
  } = useLabKitAlertDismissals(dismissalScope)
  const groupHash = useCallback((key: string) => `group:${key}`, [])
  const isDismissed = useCallback((key: string) => dismissedHashes.has(groupHash(key)), [dismissedHashes, groupHash])

  const {
    data: groupedData,
    error: groupedError,
    isLoading: groupedLoading,
    refresh: refreshGroupedAlerts
  } = useGroupedLabKitAlerts({
    studyId: dismissalScope,
    limit: 25,
    daysAhead,
    expiringDays: EXPIRING_DAYS,
    pendingAgingDays: PENDING_AGING_DAYS,
    shippedAgingDays: SHIPPED_AGING_DAYS
  })

  const recommendationStatuses = useMemo(() => ['new'] as Array<'new'>, [])

  const {
    data: recommendationsData,
    isLoading: recommendationsLoading,
    error: recommendationsError,
    accept: acceptRecommendation,
    dismiss: dismissRecommendation,
    refresh: refreshRecommendations
  } = useLabKitRecommendations({
    studyId: studyId === 'all' ? null : studyId,
    statuses: recommendationStatuses
  })

  const MAX_INLINE_ITEMS = 5

  const recommendationItems = recommendationsData?.recommendations ?? []
  const recommendationCount = recommendationItems.length

  const supplyDeficitGroup = groupedData?.groups.supplyDeficit
  const supplyDeficit = useMemo(
    () => supplyDeficitGroup?.items ?? [],
    [supplyDeficitGroup]
  )
  const visibleSupplyDeficit = supplyDeficit.slice(0, MAX_INLINE_ITEMS)
  const supplyDeficitHasMore = supplyDeficitGroup?.hasMore ?? false
  const supplyDeficitHiddenCount = Math.max((supplyDeficitGroup?.total ?? visibleSupplyDeficit.length) - visibleSupplyDeficit.length, 0)
  const activeSupplyDeficit = useMemo(
    () => supplyDeficit.filter(item => item.deficit > 0),
    [supplyDeficit]
  )
  const expiringSoonGroup = groupedData?.groups.expiringSoon
  const expiringSoon = useMemo(
    () => expiringSoonGroup?.items ?? [],
    [expiringSoonGroup]
  )
  const pendingShipmentGroup = groupedData?.groups.pendingShipment
  const pendingAging = useMemo(
    () => pendingShipmentGroup?.items ?? [],
    [pendingShipmentGroup]
  )
  const shippedGroup = groupedData?.groups.shippedWithoutDelivery
  const shippedStuck = useMemo(
    () => shippedGroup?.items ?? [],
    [shippedGroup]
  )
  const lowBufferGroup = groupedData?.groups.lowBuffer
  const lowBuffer = useMemo(
    () => lowBufferGroup?.items ?? [],
    [lowBufferGroup]
  )
  const visibleLowBuffer = lowBuffer.slice(0, MAX_INLINE_ITEMS)
  const expiredGroup = groupedData?.groups.expired
  const expired = useMemo(
    () => expiredGroup?.items ?? [],
    [expiredGroup]
  )

  const visibleExpiringSoon = expiringSoon.slice(0, MAX_INLINE_ITEMS)
  const expiringHiddenCount = Math.max((expiringSoonGroup?.total ?? visibleExpiringSoon.length) - visibleExpiringSoon.length, 0)
  const expiringHasMore = expiringSoonGroup?.hasMore ?? false

  const visiblePendingAging = pendingAging.slice(0, MAX_INLINE_ITEMS)
  const pendingAgingHiddenCount = Math.max((pendingShipmentGroup?.total ?? visiblePendingAging.length) - visiblePendingAging.length, 0)
  const pendingAgingHasMore = pendingShipmentGroup?.hasMore ?? false

  const visibleShippedStuck = shippedStuck.slice(0, MAX_INLINE_ITEMS)
  const shippedStuckHiddenCount = Math.max((shippedGroup?.total ?? visibleShippedStuck.length) - visibleShippedStuck.length, 0)
  const shippedStuckHasMore = shippedGroup?.hasMore ?? false

  const visibleExpired = expired.slice(0, MAX_INLINE_ITEMS)
  const expiredHiddenCount = Math.max((expiredGroup?.total ?? visibleExpired.length) - visibleExpired.length, 0)
  const expiredHasMore = expiredGroup?.hasMore ?? false
  const lowBufferHasMore = lowBufferGroup?.hasMore ?? false
  const lowBufferHiddenCount = Math.max((lowBufferGroup?.total ?? visibleLowBuffer.length) - visibleLowBuffer.length, 0)

  const ensureOpen = useCallback((id: string, count: number) => {
    if (count <= 0 || isDismissed(id)) {
      setOpen(prev => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }

    setOpen(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [isDismissed])

  const supplyDeficitTotal = supplyDeficitGroup?.total ?? supplyDeficit.length
  const supplyDeficitActiveCount = supplyDeficitGroup?.active ?? activeSupplyDeficit.length
  const supplyDeficitCoveredCount = Math.max(0, supplyDeficitTotal - supplyDeficitActiveCount)
  const expiringSoonCount = expiringSoonGroup?.total ?? expiringSoon.length
  const pendingAgingCount = pendingShipmentGroup?.total ?? pendingAging.length
  const shippedStuckCount = shippedGroup?.total ?? shippedStuck.length
  const lowBufferCount = lowBufferGroup?.total ?? lowBuffer.length
  const expiredCount = expiredGroup?.total ?? expired.length

  const summary = useMemo(() => ({
    critical: isDismissed('supplyDeficit') ? 0 : supplyDeficitActiveCount,
    warning:
      (isDismissed('supplyDeficit') ? 0 : supplyDeficitCoveredCount) +
      (isDismissed('expiringSoon') ? 0 : expiringSoonCount) +
      (isDismissed('pendingAging') ? 0 : pendingAgingCount) +
      (isDismissed('shippedStuck') ? 0 : shippedStuckCount) +
      (isDismissed('lowBuffer') ? 0 : lowBufferCount),
    info: isDismissed('expired') ? 0 : expiredCount
  }), [
    isDismissed,
    supplyDeficitActiveCount,
    supplyDeficitCoveredCount,
    expiringSoonCount,
    pendingAgingCount,
    shippedStuckCount,
    lowBufferCount,
    expiredCount
  ])

  const totalActiveAlerts = summary.critical + summary.warning + summary.info

  useEffect(() => {
    if (onCountChange) {
      onCountChange(totalActiveAlerts)
    }
  }, [totalActiveAlerts, onCountChange])

  useEffect(() => {
    if (dismissalsError) {
      setPanelNotice({
        type: 'error',
        message: dismissalsError.message || 'Unable to load alert dismissals.'
      })
    }
  }, [dismissalsError])

  useEffect(() => {
    if (groupedError) {
      setPanelNotice({
        type: 'error',
        message: groupedError.message || 'Unable to load lab kit alerts.'
      })
    }
  }, [groupedError])

  useEffect(() => { ensureOpen('supplyDeficit', supplyDeficitTotal) }, [ensureOpen, supplyDeficitTotal])
  useEffect(() => { ensureOpen('expiringSoon', expiringSoonCount) }, [ensureOpen, expiringSoonCount])
  useEffect(() => { ensureOpen('pendingAging', pendingAgingCount) }, [ensureOpen, pendingAgingCount])
  useEffect(() => { ensureOpen('shippedStuck', shippedStuckCount) }, [ensureOpen, shippedStuckCount])
  useEffect(() => { ensureOpen('lowBuffer', lowBufferCount) }, [ensureOpen, lowBufferCount])
  useEffect(() => { ensureOpen('expired', expiredCount) }, [ensureOpen, expiredCount])
  useEffect(() => { ensureOpen('recommendations', recommendationCount) }, [ensureOpen, recommendationCount])

  const toggle = (key: string) => {
    const n = new Set(open)
    if (n.has(key)) n.delete(key); else n.add(key)
    setOpen(n)
  }

  const dismissSection = useCallback(async (id: string, metadata?: Record<string, unknown>) => {
    try {
      await persistDismissal(groupHash(id), { metadata })
      setPanelNotice(null)
    } catch (error) {
      setPanelNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to hide alert group.'
      })
    }
  }, [persistDismissal, groupHash])

  const restoreAll = useCallback(async () => {
    try {
      await restoreDismissals()
      await refreshGroupedAlerts()
      setPanelNotice({ type: 'success', message: 'All alert groups restored.' })
      setOpen(prev => {
        const next = new Set(prev)
        if (supplyDeficitTotal > 0) next.add('supplyDeficit')
        if (expiringSoonCount > 0) next.add('expiringSoon')
        if (pendingAgingCount > 0) next.add('pendingAging')
        if (shippedStuckCount > 0) next.add('shippedStuck')
        if (lowBufferCount > 0) next.add('lowBuffer')
        if (expiredCount > 0) next.add('expired')
        if (recommendationCount > 0) next.add('recommendations')
        return next
      })
    } catch (error) {
      setPanelNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to restore alert groups.'
      })
    }
  }, [
    restoreDismissals,
    refreshGroupedAlerts,
    supplyDeficitTotal,
    expiringSoonCount,
    pendingAgingCount,
    shippedStuckCount,
    lowBufferCount,
    expiredCount,
    recommendationCount
  ])

  const handleOrderSuccess = useCallback(async (message?: string) => {
    await refreshGroupedAlerts()
    if (studyId !== 'all') {
      await refreshRecommendations()
    }
    setPanelNotice({ type: 'success', message: message || 'Order placed successfully.' })
  }, [refreshGroupedAlerts, refreshRecommendations, studyId])

  const closeOrderModal = useCallback(() => {
    setOrderTarget(null)
  }, [])

  const openRecommendationOrder = useCallback((item: LabKitRecommendationItem) => {
    setPanelNotice(null)
    setRecommendationOrder(item)
  }, [])

  const handleRecommendationAccept = useCallback(async (item: LabKitRecommendationItem) => {
    try {
      setPanelNotice(null)
      setPendingRecommendationId(item.id)
      await acceptRecommendation(item.id, {
        acceptedAt: new Date().toISOString(),
        source: 'alerts-panel'
      })
      setPanelNotice({
        type: 'success',
        message: `${item.kitTypeName ?? 'Kit'} recommendation accepted.`
      })
    } catch (error) {
      setPanelNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to accept recommendation.'
      })
    } finally {
      setPendingRecommendationId(null)
    }
  }, [acceptRecommendation])

  const handleRecommendationDismiss = useCallback(async (item: LabKitRecommendationItem) => {
    const reason = (typeof window !== 'undefined'
      ? window.prompt('Provide a short reason for dismissing this recommendation:', item.dismissedReason ?? '')
      : null) || ''
    const trimmed = reason.trim()
    if (!trimmed) {
      return
    }
    try {
      setPanelNotice(null)
      setPendingDismissId(item.id)
      await dismissRecommendation(item.id, trimmed, {
        dismissedAt: new Date().toISOString(),
        source: 'alerts-panel'
      })
      setPanelNotice({
        type: 'success',
        message: `${item.kitTypeName ?? 'Kit'} recommendation dismissed.`
      })
    } catch (error) {
      setPanelNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to dismiss recommendation.'
      })
    } finally {
      setPendingDismissId(null)
    }
  }, [dismissRecommendation])

  const handleRecommendationOrderSuccess = useCallback(async (message?: string) => {
    const current = recommendationOrder
    setRecommendationOrder(null)
    await handleOrderSuccess(message)
    if (!current) return
    try {
      setPendingRecommendationId(current.id)
      await acceptRecommendation(current.id, {
        acceptedAt: new Date().toISOString(),
        source: 'alerts-panel-order'
      })
      setPanelNotice({
        type: 'success',
        message: `${current.kitTypeName ?? 'Kit'} recommendation accepted and order placed.`
      })
    } catch (error) {
      setPanelNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Order placed, but failed to update recommendation status.'
      })
    } finally {
      setPendingRecommendationId(null)
    }
  }, [recommendationOrder, handleOrderSuccess, acceptRecommendation])

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

      await refreshGroupedAlerts()
      setPanelNotice({ type: 'success', message: 'Order marked as received.' })
    } catch (error) {
      setPanelNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update order status.' })
    } finally {
      setProcessingOrderId(null)
    }
  }, [refreshGroupedAlerts, onOrderReceived, studyId])

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
    onDismiss?: () => Promise<void> | void
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
                  if (onDismiss) {
                    onDismiss()
                  }
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

  if ((groupedLoading && studyId !== 'all') || dismissalsLoading) {
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
          defaultVendor={orderTarget.pendingOrders.find(order => order.vendor)?.vendor ?? undefined}
          allowKitTypeChange={false}
          deficitSummary={{
            original: orderTarget.originalDeficit ?? orderTarget.deficit,
            outstanding: orderTarget.deficit,
            pending: orderTarget.pendingOrderQuantity ?? 0
          }}
        />
      )}
      {recommendationOrder && studyId !== 'all' && (
        <LabKitOrderModal
          studyId={studyId}
          isOpen={!!recommendationOrder}
          onClose={() => setRecommendationOrder(null)}
          onSuccess={handleRecommendationOrderSuccess}
          defaultKitTypeId={recommendationOrder.kitTypeId || undefined}
          defaultKitTypeName={recommendationOrder.kitTypeName || undefined}
          defaultQuantity={recommendationOrder.recommendedQuantity}
          defaultNotes={recommendationOrder.reason}
          allowKitTypeChange={!recommendationOrder.kitTypeId}
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
          {dismissedHashes.size > 0 && (
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
      </div>

      {studyId !== 'all' && (
        <Section
          id="recommendations"
          title="Recommended orders"
          count={recommendationCount}
          tone="purple"
          actionLabel={recommendationCount > 0 ? 'Refresh' : undefined}
          onAction={recommendationCount > 0 ? () => { void refreshRecommendations() } : undefined}
          forceShowChildren={
            recommendationsLoading || Boolean(recommendationsError) || recommendationCount > 0
          }
        >
          {recommendationsLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, index) => (
                <div key={index} className="h-14 rounded bg-gray-800/80 animate-pulse"></div>
              ))}
            </div>
          ) : recommendationsError ? (
            <div className="text-sm text-red-300">
              {recommendationsError.message || 'Failed to load recommendations.'}
            </div>
          ) : recommendationCount === 0 ? (
            <div className="text-sm text-gray-400">
              No recommended orders right now. Forecast will surface new guidance when buffers drop below targets.
            </div>
          ) : (
            recommendationItems.map((item) => {
              const dueLabel = item.latestOrderDate
                ? `Order by ${formatDateUTC(item.latestOrderDate)}`
                : 'Order as soon as possible'
              const windowLabel = item.windowStart || item.windowEnd
                ? `Window ${item.windowStart ? formatDateUTC(item.windowStart) : '—'} → ${item.windowEnd ? formatDateUTC(item.windowEnd) : '—'}`
                : null
              const confidenceLabel =
                typeof item.confidence === 'number'
                  ? `${Math.round(item.confidence * 100)}% confidence`
                  : null
              const accepting = pendingRecommendationId === item.id
              const dismissing = pendingDismissId === item.id

              return (
                <div
                  key={item.id}
                  className="rounded-md border border-purple-500/20 bg-purple-500/5 px-3 py-3 text-sm text-gray-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{item.kitTypeName ?? 'Any kit type'}</span>
                        <span className="text-xs text-purple-200 border border-purple-400/40 rounded-full px-2 py-0.5">Qty {item.recommendedQuantity}</span>
                      </div>
                      <div className="text-xs text-gray-300">{item.reason}</div>
                      <div className="text-[11px] text-gray-400 space-x-2">
                        <span>{dueLabel}</span>
                        {windowLabel && <span>• {windowLabel}</span>}
                        {confidenceLabel && <span>• {confidenceLabel}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openRecommendationOrder(item)}
                        className="rounded border border-blue-400/60 px-2.5 py-1 text-xs font-semibold text-blue-200 hover:border-blue-300 hover:text-blue-100"
                        disabled={accepting || dismissing}
                      >
                        Create order
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleRecommendationAccept(item) }}
                        className="rounded border border-green-500/40 px-2.5 py-1 text-xs font-semibold text-green-200 hover:border-green-300 hover:text-green-100 disabled:opacity-60"
                        disabled={accepting}
                      >
                        {accepting ? 'Saving…' : 'Mark accepted'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleRecommendationDismiss(item) }}
                        className="rounded border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-200 hover:border-red-300 hover:text-red-100 disabled:opacity-60"
                        disabled={dismissing}
                      >
                        {dismissing ? 'Updating…' : 'Dismiss'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </Section>
      )}

      {!isDismissed('supplyDeficit') && (
        <Section
          id="supplyDeficit"
          title={supplyDeficitGroup?.severity === 'critical' ? 'Critical supply issues (deficit)' : 'Supply issues covered by pending orders'}
          count={supplyDeficitTotal}
          tone={supplyDeficitGroup?.severity === 'critical' ? 'red' : 'yellow'}
          dismissible
          onDismiss={() => dismissSection('supplyDeficit')}
          actionLabel={supplyDeficitHasMore || supplyDeficitHiddenCount > 0 ? 'View all in Inventory' : 'Go to Inventory'}
          onAction={() => onNavigate?.('inventory') }
          forceShowChildren={supplyDeficit.length > 0}
        >
          {visibleSupplyDeficit.map(item => {
            const outstanding = item.deficit
            const pendingQty = item.pendingOrderQuantity
            const original = item.originalDeficit
            const isCritical = item.deficit > 0
            const badge = isCritical
              ? {
                  label: 'Critical',
                  className: 'bg-red-500/15 border border-red-500/40 text-red-200'
                }
              : {
                  label: 'Covered',
                  className: 'bg-green-500/15 border border-green-500/40 text-green-200'
                }
            return (
              <div
                key={item.key}
                className={`rounded-md px-3 py-3 text-sm border ${
                  isCritical
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-yellow-400/30 bg-yellow-400/5'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-white">{item.kitTypeName}</div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {original > 0 ? `Forecast needs ${original} kit${original === 1 ? '' : 's'} this window` : 'No forecasted demand'}.
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
                              <span className="ml-2 text-green-400">Received</span>
                            )}
                            {order.status === 'cancelled' && (
                              <span className="ml-2 text-gray-500">Cancelled</span>
                            )}
                          </div>
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
          {supplyDeficitHiddenCount > 0 && (
            <div className="text-xs text-gray-400 mt-2">{supplyDeficitHiddenCount} additional kit types not shown here.</div>
          )}
          {(supplyDeficitHasMore || supplyDeficitHiddenCount > 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate?.('inventory')
              }}
              className="text-xs text-blue-300 hover:text-blue-200 font-semibold"
            >
              View complete deficit list in Inventory →
            </button>
          )}
        </Section>
      )}

      {!isDismissed('expiringSoon') && (
        <Section
          id="expiringSoon"
          title={`Expiring within ${EXPIRING_DAYS} days`}
          count={expiringSoonCount}
          tone="yellow"
          dismissible
          onDismiss={() => dismissSection('expiringSoon')}
          actionLabel={expiringHasMore || expiringHiddenCount > 0 ? 'View all in Inventory' : 'View in Inventory'}
          onAction={() => onNavigate?.('inventory', { expiringOnly: true }) }
        >
          {visibleExpiringSoon.map(kit => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">
                {kit.accessionNumber ?? 'Unassigned'}
                {kit.kitTypeName && <span className="text-gray-400"> {kit.kitTypeName}</span>}
              </div>
              <div className="text-yellow-300">{kit.expirationDate ? formatDateUTC(kit.expirationDate) : '—'}</div>
            </div>
          ))}
          {expiringHiddenCount > 0 && (
            <div className="text-xs text-gray-400">{expiringHiddenCount} more not shown here.</div>
          )}
          {(expiringHasMore || expiringHiddenCount > 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate?.('inventory', { expiringOnly: true })
              }}
              className="text-xs text-blue-300 hover:text-blue-200 font-semibold"
            >
              View all expiring kits in Inventory →
            </button>
          )}
        </Section>
      )}

      {!isDismissed('pendingAging') && (
        <Section
          id="pendingAging"
          title={`Pending shipment > ${PENDING_AGING_DAYS} days`}
          count={pendingAgingCount}
          tone="purple"
          dismissible
          onDismiss={() => dismissSection('pendingAging')}
          actionLabel={pendingAgingHasMore || pendingAgingHiddenCount > 0 ? 'View all shipments' : 'Go to Shipments'}
          onAction={() => onNavigate?.('shipments', { shipmentFilter: 'pending-aging' })}
        >
          {visiblePendingAging.map(kit => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">{kit.accessionNumber ?? 'Unassigned'}</div>
              <div className="text-gray-400">{kit.daysInStatus ?? 0} days</div>
            </div>
          ))}
          {pendingAgingHiddenCount > 0 && (
            <div className="text-xs text-gray-400">{pendingAgingHiddenCount} more not shown here.</div>
          )}
          {(pendingAgingHasMore || pendingAgingHiddenCount > 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate?.('shipments', { shipmentFilter: 'pending-aging' })
              }}
              className="text-xs text-blue-300 hover:text-blue-200 font-semibold"
            >
              View all delayed shipments →
            </button>
          )}
        </Section>
      )}

      {!isDismissed('shippedStuck') && (
        <Section
          id="shippedStuck"
          title={`Shipped without delivery > ${SHIPPED_AGING_DAYS} days`}
          count={shippedStuckCount}
          tone="blue"
          dismissible
          onDismiss={() => dismissSection('shippedStuck')}
          actionLabel={shippedStuckHasMore || shippedStuckHiddenCount > 0 ? 'View all shipments' : 'Go to Shipments'}
          onAction={() => onNavigate?.('shipments', { shipmentFilter: 'shipped-stuck' })}
        >
          {visibleShippedStuck.map(kit => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">{kit.accessionNumber ?? 'Unassigned'}</div>
              <div className="text-gray-400">{kit.daysInStatus ?? 0} days</div>
            </div>
          ))}
          {shippedStuckHiddenCount > 0 && (
            <div className="text-xs text-gray-400">{shippedStuckHiddenCount} more not shown here.</div>
          )}
          {(shippedStuckHasMore || shippedStuckHiddenCount > 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate?.('shipments', { shipmentFilter: 'shipped-stuck' })
              }}
              className="text-xs text-blue-300 hover:text-blue-200 font-semibold"
            >
              View all stalled shipments →
            </button>
          )}
        </Section>
      )}

      {!isDismissed('lowBuffer') && (
        <Section
          id="lowBuffer"
          title="Low buffer (<= 2 extra kits)"
          count={lowBufferCount}
          tone="yellow"
          dismissible
          onDismiss={() => dismissSection('lowBuffer')}
          actionLabel={lowBufferHasMore || lowBufferHiddenCount > 0 ? 'View all in Inventory' : 'Go to Inventory'}
          onAction={() => onNavigate?.('inventory')}
        >
          {visibleLowBuffer.map(item => {
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
          {lowBufferHiddenCount > 0 && (
            <div className="text-xs text-gray-400">{lowBufferHiddenCount} more not shown here.</div>
          )}
          {(lowBufferHasMore || lowBufferHiddenCount > 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate?.('inventory')
              }}
              className="text-xs text-blue-300 hover:text-blue-200 font-semibold"
            >
              View all low-buffer kits in Inventory →
            </button>
          )}
        </Section>
      )}

      {!isDismissed('expired') && (
        <Section
          id="expired"
          title="Expired kits"
          count={expiredCount}
          tone="gray"
          dismissible
          onDismiss={() => dismissSection('expired')}
          actionLabel={expiredHasMore || expiredHiddenCount > 0 ? 'View all expired kits' : 'Go to Expired View'}
          onAction={() => onNavigate?.('expired')}
        >
          {visibleExpired.map(kit => (
            <div key={kit.id} className="flex items-center justify-between text-sm">
              <div className="text-gray-200">{kit.accessionNumber ?? 'Unassigned'}</div>
              <div className="text-red-400">{kit.expirationDate ? formatDateUTC(kit.expirationDate) : '—'}</div>
            </div>
          ))}
          {expiredHiddenCount > 0 && (
            <div className="text-xs text-gray-400">{expiredHiddenCount} more not shown here.</div>
          )}
          {(expiredHasMore || expiredHiddenCount > 0) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate?.('expired')
              }}
              className="text-xs text-blue-300 hover:text-blue-200 font-semibold"
            >
              View all expired kits →
            </button>
          )}
        </Section>
      )}
      </div>
    </>
  )
}
