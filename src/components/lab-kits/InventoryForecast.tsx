'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'

interface ForecastUpcomingVisit {
  visit_date: string
  subject_number: string | null
  visit_name: string | null
  quantity_required: number
}

interface ForecastRequirementBreakdown {
  requirementId: string
  visitScheduleId: string
  visitName: string
  visitNumber: number | string | null
  quantityPerVisit: number
  isOptional: boolean
  visitsScheduled: number
  kitsRequired: number
  upcomingVisits?: ForecastUpcomingVisit[]
}

interface ForecastPendingOrder {
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

interface ForecastBufferMeta {
  source: 'kit-specific' | 'study-default' | 'none'
  appliedDays: number | null
  minCount: number | null
  targetKits: number
  dailyBurnRate: number
  deliveryDays: number
}

interface RiskFactor {
  type: string
  score: number
  detail: string
}

interface InventoryForecastItem {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  visitName: string
  optional: boolean
  visitsScheduled: number
  kitsRequired: number
  requiredWithBuffer: number
  kitsAvailable: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
  upcomingVisits: ForecastUpcomingVisit[]
  requirements: ForecastRequirementBreakdown[]
  originalDeficit: number
  pendingOrderQuantity: number
  pendingOrders: ForecastPendingOrder[]
  bufferKitsNeeded: number
  bufferMeta: ForecastBufferMeta
  baselineTarget: number
  dynamicCushion: number
  deliveryDaysApplied: number
  recommendedOrderQty: number
  riskScore: number
  riskLevel: "high" | "medium" | "low"
  riskFactors: RiskFactor[]
}

interface ForecastSummary {
  totalVisitsScheduled: number
  criticalIssues: number
  warnings: number
  highRisk: number
  mediumRisk: number
  daysAhead: number
  baseWindowDays: number
  inventoryBufferDays: number
  visitWindowBufferDays: number
  deliveryDaysDefault: number
}

interface InventoryForecastProps {
  studyId: string
  daysAhead?: number
}

type SeverityKey = 'critical' | 'warning' | 'ok'

function SummaryChip({ label, count, tone }: { label: string; count: number; tone: 'red' | 'yellow' | 'green' }) {
  const isZero = count === 0
  const toneClasses: Record<'red' | 'yellow' | 'green', { border: string; text: string; dot: string }> = {
    red: { border: 'border-red-500/50 bg-red-500/10', text: 'text-red-200', dot: 'bg-red-500' },
    yellow: { border: 'border-yellow-400/60 bg-yellow-500/10', text: 'text-yellow-200', dot: 'bg-yellow-400' },
    green: { border: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-200', dot: 'bg-emerald-400' }
  }

  const classes = toneClasses[tone]

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${classes.border} ${isZero ? 'opacity-60' : ''}`}>
      <span className={`w-2 h-2 rounded-full ${classes.dot}`}></span>
      <span className={`text-xs font-semibold uppercase tracking-wide ${classes.text}`}>{label}</span>
      <span className="text-sm font-bold text-white">{count}</span>
    </div>
  )
}

export default function InventoryForecast({ studyId, daysAhead = 30 }: InventoryForecastProps) {
  const [forecast, setForecast] = useState<InventoryForecastItem[]>([])
  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showOnlyIssues, setShowOnlyIssues] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Set<SeverityKey>>(new Set(['ok']))

  const loadForecast = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/inventory-forecast?study_id=${studyId}&days=${daysAhead}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        const parsedForecast: InventoryForecastItem[] = Array.isArray(data.forecast)
          ? data.forecast.map((raw: any): InventoryForecastItem | null => {
              if (!raw) return null
              const bufferMetaRaw = raw.bufferMeta || {}
              const bufferMeta: ForecastBufferMeta = {
                source:
                  bufferMetaRaw.source === 'kit-specific' || bufferMetaRaw.source === 'study-default' || bufferMetaRaw.source === 'none'
                    ? bufferMetaRaw.source
                    : 'none',
                appliedDays: typeof bufferMetaRaw.appliedDays === 'number' ? bufferMetaRaw.appliedDays : null,
                minCount: typeof bufferMetaRaw.minCount === 'number' ? bufferMetaRaw.minCount : null,
                targetKits: typeof bufferMetaRaw.targetKits === 'number' ? bufferMetaRaw.targetKits : (typeof raw.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0),
                dailyBurnRate: typeof bufferMetaRaw.dailyBurnRate === 'number' ? bufferMetaRaw.dailyBurnRate : 0,
                deliveryDays: typeof bufferMetaRaw.deliveryDays === 'number' ? bufferMetaRaw.deliveryDays : (typeof raw.deliveryDaysApplied === 'number' ? raw.deliveryDaysApplied : 0)
              }

              return {
                key: String(raw.key ?? raw.kitTypeId ?? raw.kitTypeName ?? Math.random()),
                kitTypeId: raw.kitTypeId ?? null,
                kitTypeName: raw.kitTypeName ?? 'Unknown kit',
                visitName: raw.visitName ?? raw.kitTypeName ?? 'Visit',
                optional: Boolean(raw.optional),
                visitsScheduled: Number(raw.visitsScheduled) || 0,
                kitsRequired: Number(raw.kitsRequired) || 0,
                requiredWithBuffer: typeof raw.requiredWithBuffer === 'number' ? raw.requiredWithBuffer : (Number(raw.kitsRequired) || 0) + (typeof raw.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0),
                kitsAvailable: Number(raw.kitsAvailable) || 0,
                kitsExpiringSoon: Number(raw.kitsExpiringSoon) || 0,
                deficit: Number(raw.deficit) || 0,
                status: raw.status === 'critical' || raw.status === 'warning' ? raw.status : 'ok',
                upcomingVisits: Array.isArray(raw.upcomingVisits) ? raw.upcomingVisits : [],
                requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
                originalDeficit: Number(raw.originalDeficit) || 0,
                pendingOrderQuantity: Number(raw.pendingOrderQuantity) || 0,
                pendingOrders: Array.isArray(raw.pendingOrders) ? raw.pendingOrders : [],
                bufferKitsNeeded: typeof raw.bufferKitsNeeded === 'number' ? raw.bufferKitsNeeded : 0,
                bufferMeta,
                baselineTarget: typeof raw.baselineTarget === 'number' ? raw.baselineTarget : Number(raw.kitsRequired) || 0,
                dynamicCushion: typeof raw.dynamicCushion === 'number' ? raw.dynamicCushion : 0,
                deliveryDaysApplied: typeof raw.deliveryDaysApplied === 'number' ? raw.deliveryDaysApplied : bufferMeta.deliveryDays || 0,
                recommendedOrderQty: typeof raw.recommendedOrderQty === 'number' ? Math.max(0, Math.round(raw.recommendedOrderQty)) : 0,
                riskScore: typeof raw.riskScore === 'number' ? raw.riskScore : 0,
                riskLevel: raw.riskLevel === 'high' || raw.riskLevel === 'medium' ? raw.riskLevel : 'low',
                riskFactors: Array.isArray(raw.riskFactors)
                  ? raw.riskFactors.map((factor: any) => ({
                      type: typeof factor?.type === 'string' ? factor.type : 'context',
                      score: Number(factor?.score) || 0,
                      detail: typeof factor?.detail === 'string' ? factor.detail : ''
                    }))
                  : []
              }
            }).filter(Boolean) as InventoryForecastItem[]
          : []

        setForecast(parsedForecast)
        setSummary(data.summary || null)
      } else {
        console.error('Failed to fetch inventory forecast:', response.status)
      }
    } catch (error) {
      console.error('Error loading forecast:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId, daysAhead])

  useEffect(() => {
    loadForecast()
  }, [loadForecast])

  const severityConfig: Array<{ key: SeverityKey; label: string; description: string; tone: 'red' | 'yellow' | 'green' }> = [
    { key: 'critical', label: 'Critical', description: 'Immediate action required to cover kit shortfalls.', tone: 'red' },
    { key: 'warning', label: 'Warnings', description: 'Monitor buffer gaps and pending coverage closely.', tone: 'yellow' },
    { key: 'ok', label: 'Stable', description: 'Buffer targets satisfied based on current inventory.', tone: 'green' }
  ]

  const severityBuckets = severityConfig.map((config) => {
    const items = forecast.filter((item) => (config.key === 'ok' ? item.status === 'ok' : item.status === config.key))
    const aggregate = items.reduce(
      (acc, item) => {
        return {
          deficit: acc.deficit + Math.max(0, item.deficit || 0),
          pending: acc.pending + Math.max(0, item.pendingOrderQuantity || 0),
          expiring: acc.expiring + Math.max(0, item.kitsExpiringSoon || 0)
        }
      },
      { deficit: 0, pending: 0, expiring: 0 }
    )
    return { ...config, items, aggregate }
  })

  const totalCritical = severityBuckets.find((bucket) => bucket.key === 'critical')?.items.length ?? 0
  const totalWarnings = severityBuckets.find((bucket) => bucket.key === 'warning')?.items.length ?? 0
  const totalStable = severityBuckets.find((bucket) => bucket.key === 'ok')?.items.length ?? 0
  const totalShortfall = severityBuckets.reduce((sum, bucket) => sum + bucket.aggregate.deficit, 0)
  const filteredBuckets = severityBuckets.filter((bucket) => bucket.items.length > 0 && (!showOnlyIssues || bucket.key !== 'ok'))
  const hasIssues = severityBuckets.some((bucket) => bucket.key !== 'ok' && bucket.items.length > 0)

  const suggestedOrders = useMemo(() => {
    return forecast
      .filter((item) => item.recommendedOrderQty > 0)
      .slice()
      .sort((a, b) => {
        const riskRank: Record<InventoryForecastItem['riskLevel'], number> = { high: 0, medium: 1, low: 2 }
        const riskDiff = riskRank[a.riskLevel] - riskRank[b.riskLevel]
        if (riskDiff !== 0) return riskDiff
        const scoreDiff = b.riskScore - a.riskScore
        if (scoreDiff !== 0) return scoreDiff
        return b.recommendedOrderQty - a.recommendedOrderQty
      })
  }, [forecast])
  const totalSuggestedQty = suggestedOrders.reduce((sum, item) => sum + item.recommendedOrderQty, 0)
  const highRiskCount = summary?.highRisk ?? 0
  const hasSuggestedOrders = suggestedOrders.length > 0

  const getStatusIcon = (status: 'ok' | 'warning' | 'critical') => {
    switch (status) {
      case 'critical':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'ok':
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStatusMessage = (item: InventoryForecastItem) => {
    const outstanding = Math.max(0, item.deficit)
    const pending = item.pendingOrderQuantity ?? 0
    const bufferTarget = item.bufferMeta?.targetKits ?? item.bufferKitsNeeded ?? 0
    const totalTarget = item.requiredWithBuffer ?? (item.kitsRequired + bufferTarget)
    const original = Math.max(0, item.originalDeficit ?? outstanding)
    const slackAfterPending = item.kitsAvailable + pending - totalTarget
    const slackOnHand = item.kitsAvailable - totalTarget
    const recommended = Math.max(0, item.recommendedOrderQty || 0)

    if (outstanding > 0) {
      if (pending > 0) {
        return `${outstanding} kit${outstanding === 1 ? '' : 's'} short after ordering ${pending} (target ${totalTarget}${bufferTarget > 0 ? ` incl. ${bufferTarget} buffer` : ''})`
      }
      return `${outstanding} kit${outstanding === 1 ? '' : 's'} short (target ${totalTarget}${bufferTarget > 0 ? ` incl. ${bufferTarget} buffer` : ''})`
    }

    if (original > 0 && pending > 0) {
      return `${pending} kit${pending === 1 ? '' : 's'} en route to satisfy buffer target (${totalTarget})`
    }

    if (recommended > 0) {
      const reason = item.riskFactors.find((factor) => factor.type === 'deficit' || factor.type === 'surge')?.detail || item.riskFactors[0]?.detail
      return `Suggest ordering ${recommended} kit${recommended === 1 ? '' : 's'}${reason ? ` · ${reason}` : ''}`
    }

    if (item.kitsExpiringSoon > 0) {
      return `${item.kitsExpiringSoon} kit${item.kitsExpiringSoon === 1 ? '' : 's'} expiring soon`
    }

    if (bufferTarget > 0) {
      const extra = Math.max(0, slackAfterPending)
      if (extra === 0 && pending > 0) {
        return `Buffer goal ${bufferTarget}; ${pending} kit${pending === 1 ? '' : 's'} en route`
      }
      if (extra <= Math.min(2, bufferTarget)) {
        return `Buffer goal ${bufferTarget}; ${extra} extra kit${extra === 1 ? '' : 's'} after buffer`
      }
      return `${extra} extra kit${extra === 1 ? '' : 's'} ready after ${bufferTarget}-kit buffer`
    }

    const buffer = slackOnHand
    if (buffer <= 2) {
      return `Low buffer: ${buffer} extra kit${buffer === 1 ? '' : 's'} ready`
    }
    return `${buffer} extra kit${buffer === 1 ? '' : 's'} ready`
  }

  const toggleExpanded = (key: string) => {
    const newExpanded = new Set(expanded)
    if (expanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpanded(newExpanded)
  }

  const toggleSection = (key: SeverityKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Inventory Forecast</h3>
            <p className="text-gray-400 mt-1">
              {summary
                ? `Next ${summary.daysAhead} days · Safety cushion ${summary.inventoryBufferDays}d · Delivery time ${summary.deliveryDaysDefault}d`
                : `Next ${daysAhead} days supply analysis`}
            </p>
            {summary && (
              <p className="text-xs text-gray-500 mt-1">
                Buffer: {summary.inventoryBufferDays}d inventory · {summary.visitWindowBufferDays}d window{summary.deliveryDaysDefault ? ` · Delivery ${summary.deliveryDaysDefault}d` : ''}
              </p>
            )}
            {hasSuggestedOrders && (
              <p className="text-xs text-purple-200 mt-2">
                {`${suggestedOrders.length} kit type${suggestedOrders.length === 1 ? '' : 's'} need orders totaling ${totalSuggestedQty} kit${totalSuggestedQty === 1 ? '' : 's'}.`}
              </p>
            )}
            {totalShortfall > 0 && (
              <p className="text-sm text-red-300 mt-3">
                {totalShortfall} kit{totalShortfall === 1 ? '' : 's'} short across upcoming visits.
              </p>
            )}
            {!hasIssues && showOnlyIssues && (
              <p className="text-sm text-gray-400 mt-3">
                No critical or warning forecast items detected. Turn off “Only issues” to review stable coverage.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4 items-start lg:items-end">
            <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
              <SummaryChip label="Critical" count={totalCritical} tone="red" />
              <SummaryChip label="Warnings" count={totalWarnings} tone="yellow" />
              <SummaryChip label="High Risk" count={highRiskCount} tone="red" />
              <SummaryChip label="Suggested Orders" count={suggestedOrders.length} tone={hasSuggestedOrders ? 'yellow' : 'green'} />
              <SummaryChip label="Stable" count={totalStable} tone="green" />
            </div>
            <div className="flex items-center gap-3">
              {summary && (
                <div className="text-right text-sm text-gray-400">
                  <div>{summary.totalVisitsScheduled} visit{summary.totalVisitsScheduled === 1 ? '' : 's'} scheduled</div>
                  {(summary.inventoryBufferDays > 0 || summary.visitWindowBufferDays > 0) && (
                    <div className="text-xs text-gray-500">
                      Buffer: {summary.inventoryBufferDays}d inventory · {summary.visitWindowBufferDays}d window{summary.deliveryDaysDefault ? ` · Delivery ${summary.deliveryDaysDefault}d` : ''}
                    </div>
                  )}
                  {(summary.highRisk > 0 || summary.mediumRisk > 0) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {summary.highRisk > 0 && (
                        <span className="text-red-300 font-semibold mr-2">
                          {summary.highRisk} high-risk
                        </span>
                      )}
                      {summary.mediumRisk > 0 && (
                        <span className="text-yellow-200">
                          {summary.mediumRisk} medium-risk
                        </span>
                      )}
                    </div>
                  )}
                  {(summary.criticalIssues > 0 || summary.warnings > 0) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {summary.criticalIssues > 0 && (
                        <span className="text-red-300 font-semibold mr-2">
                          {summary.criticalIssues} critical
                        </span>
                      )}
                      {summary.warnings > 0 && (
                        <span className="text-yellow-200">
                          {summary.warnings} warning{summary.warnings === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  )}
                  {hasSuggestedOrders && (
                    <div className="text-xs text-purple-200 mt-1">
                      Suggested orders: {suggestedOrders.length} kit type{suggestedOrders.length === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={showOnlyIssues}
                  onChange={(e) => setShowOnlyIssues(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                Only issues
              </label>
            </div>
          </div>
        </div>
      </div>

      {hasSuggestedOrders && (
        <div className="px-6 py-4 border-b border-gray-700 bg-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Suggested Orders</h4>
            <span className="text-xs text-purple-200/80">{`Top ${Math.min(3, suggestedOrders.length)} of ${suggestedOrders.length}`}</span>
          </div>
          <div className="space-y-2">
            {suggestedOrders.slice(0, 3).map((item) => {
              const primaryFactor = item.riskFactors.find((factor) => factor.type === 'deficit' || factor.type === 'surge') || item.riskFactors[0]
              return (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-lg border border-purple-500/40 bg-purple-500/10 px-4 py-3">
                  <div className="text-sm text-purple-100">
                    <div className="font-medium text-white">{item.kitTypeName}</div>
                    <div className="text-xs text-purple-200/80">
                      {primaryFactor?.detail || 'Covers upcoming demand and delivery window'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-purple-100">Order {item.recommendedOrderQty}</div>
                    {item.deliveryDaysApplied > 0 && (
                      <div className="text-[10px] uppercase tracking-wide text-purple-200/70">Delivery {item.deliveryDaysApplied}d</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {suggestedOrders.length > 3 && (
            <p className="text-xs text-purple-200/70 mt-2">{`+${suggestedOrders.length - 3} more kit type${suggestedOrders.length - 3 === 1 ? '' : 's'} flagged below`}</p>
          )}
        </div>
      )}

      {/* Forecast Sections */}
      <div className="divide-y divide-gray-700">
        {filteredBuckets.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>{showOnlyIssues ? 'No forecast issues detected.' : `No visits scheduled in the next ${daysAhead} days.`}</p>
            {showOnlyIssues && (
              <button
                onClick={() => setShowOnlyIssues(false)}
                className="mt-4 text-sm text-blue-400 hover:text-blue-300"
              >
                Show stable forecast
              </button>
            )}
          </div>
        ) : (
          filteredBuckets.map((bucket) => {
            const isCollapsed = collapsedSections.has(bucket.key)
            const subtitleParts: string[] = []
            if (bucket.aggregate.deficit > 0) {
              subtitleParts.push(`${bucket.aggregate.deficit} kit${bucket.aggregate.deficit === 1 ? '' : 's'} short`)
            }
            if (bucket.aggregate.pending > 0) {
              subtitleParts.push(`${bucket.aggregate.pending} pending order${bucket.aggregate.pending === 1 ? '' : 's'}`)
            }
            if (bucket.aggregate.expiring > 0 && bucket.key !== 'ok') {
              subtitleParts.push(`${bucket.aggregate.expiring} expiring soon`)
            }
            const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : bucket.description

            return (
              <div key={bucket.key} className="bg-gray-900/20">
                <button
                  type="button"
                  onClick={() => toggleSection(bucket.key)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(bucket.key === 'ok' ? 'ok' : bucket.key)}
                    <div>
                      <p className="text-sm font-semibold text-white uppercase tracking-wide">{bucket.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">
                      {bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-gray-800">
                    {bucket.items.map((item) => {
                      const pendingQty = item.pendingOrderQuantity ?? 0
                      const bufferTarget = item.bufferMeta?.targetKits ?? item.bufferKitsNeeded ?? 0
                      const totalTarget = item.requiredWithBuffer ?? (item.kitsRequired + bufferTarget)
                      const slackAfterBuffer = item.kitsAvailable - totalTarget
                      const lowBufferThreshold = bufferTarget > 0 ? Math.min(2, bufferTarget) : 2
                      const hasLowBuffer = slackAfterBuffer >= 0 && slackAfterBuffer <= lowBufferThreshold
                      const hasPendingCoverage = pendingQty > 0 && item.deficit <= 0 && (item.originalDeficit ?? 0) > 0
                      const highlight = hasPendingCoverage || hasLowBuffer

                      return (
                        <div
                          key={item.key}
                          className={`p-6 transition-colors ${highlight ? 'border-l-4 border-blue-400/70 bg-blue-500/10' : ''}`}
                        >
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => toggleExpanded(item.key)}
                          >
                            <div className="flex items-center space-x-4">
                              {getStatusIcon(item.status)}
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-lg font-semibold text-white">{item.kitTypeName}</h4>
                                  {item.optional && (
                                    <span className="text-xs uppercase tracking-wide text-gray-300 bg-gray-700/60 px-2 py-0.5 rounded-full border border-gray-600">
                                      Optional
                                    </span>
                                  )}
                                  {hasPendingCoverage && (
                                    <span className="text-[11px] uppercase tracking-wide text-blue-200 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-400/50">
                                      Pending order{pendingQty > 0 ? ` (${pendingQty})` : ''}
                                    </span>
                                  )}
                                  {!hasPendingCoverage && hasLowBuffer && (
                                    <span className="text-[11px] uppercase tracking-wide text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-400/50">
                                      Low buffer
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-400">{getStatusMessage(item)}</p>
                                {(() => {
                                  const meta = item.bufferMeta
                                  if (!meta) return null
                                  const details: string[] = []
                                  if (meta.appliedDays) {
                                    details.push(`${meta.appliedDays} day${meta.appliedDays === 1 ? '' : 's'}`)
                                  }
                                  if (meta.minCount) {
                                    details.push(`min ${meta.minCount} kit${meta.minCount === 1 ? '' : 's'}`)
                                  }
                                  const descriptor = meta.source === 'kit-specific'
                                    ? 'Kit override'
                                    : meta.source === 'study-default'
                                      ? 'Study default'
                                      : 'No buffer configured'
                                  return (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {descriptor}
                                      {details.length > 0 ? ` · ${details.join(' · ')}` : ''}
                                    </p>
                                  )
                                })()}
                              </div>
                            </div>

                            <div className="flex items-center space-x-6">
                              <div className="text-right">
                                <div className="text-sm font-medium text-white">
                                  {item.kitsAvailable} kits ready · need {item.kitsRequired}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {item.visitsScheduled} visit{item.visitsScheduled === 1 ? '' : 's'} scheduled
                                </div>
                              </div>

                              <svg
                                className={`w-5 h-5 text-gray-400 transition-transform ${expanded.has(item.key) ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {expanded.has(item.key) && (
                            <div className="mt-4 ml-9 space-y-4">
                              <div className="bg-gray-700/30 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-gray-300 mb-3">Visit Requirements</h5>
                                <div className="space-y-2">
                                  {item.requirements.map((req) => (
                                    <div key={req.requirementId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                      <div className="text-gray-200">
                                        {req.visitName}
                                        {req.visitNumber !== null && (
                                          <span className="text-gray-400">
                                            {' '}
                                            · {typeof req.visitNumber === 'number' ? `V${req.visitNumber}` : req.visitNumber}
                                          </span>
                                        )}
                                        <span className="text-gray-400"> · {req.quantityPerVisit} kit{req.quantityPerVisit === 1 ? '' : 's'}/visit</span>
                                        {req.isOptional && <span className="ml-2 text-xs text-gray-400">(optional)</span>}
                                      </div>
                                      <div className="text-xs text-gray-400">
                                        {req.visitsScheduled} visit{req.visitsScheduled === 1 ? '' : 's'} · {req.kitsRequired} total
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {item.upcomingVisits.length > 0 && (
                                <div className="bg-gray-700/30 rounded-lg p-4">
                                  <h5 className="text-sm font-semibold text-gray-300 mb-3">Upcoming Visits</h5>
                                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {item.upcomingVisits.map((visit, index) => (
                                      <div key={`${visit.visit_date}-${visit.subject_number ?? 'subject'}-${index}`} className="flex flex-wrap justify-between gap-2 text-sm">
                                        <div className="text-gray-300">
                                          {visit.subject_number || 'Subject'}
                                          {visit.visit_name && <span className="text-gray-400"> · {visit.visit_name}</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 flex items-center gap-3">
                                          <span>{formatDateUTC(visit.visit_date)}</span>
                                          <span>×{visit.quantity_required}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
