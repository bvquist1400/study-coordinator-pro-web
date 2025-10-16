'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import { useSite } from '@/components/site/SiteProvider'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'

type Severity = 'critical' | 'warning' | 'stable'

interface StudySummary {
  id: string
  protocol_number: string
  study_title: string
}

interface ForecastPendingOrder {
  id: string
  quantity: number
  vendor: string | null
  expectedArrival: string | null
  status: 'pending' | 'received' | 'cancelled'
  isOverdue?: boolean
  notes?: string | null
  createdAt?: string
}

interface ForecastItem {
  key?: string
  kitTypeId?: string | null
  kitTypeName?: string
  visitName?: string
  kitsRequired?: number
  requiredWithBuffer?: number
  kitsAvailable?: number
  kitsExpiringSoon?: number
  deficit?: number
  status?: 'critical' | 'warning' | 'ok'
  upcomingVisits?: Array<{ visit_date?: string | null; visit_name?: string | null }>
  pendingOrders?: ForecastPendingOrder[]
  pendingOrderQuantity?: number
  bufferMeta?: {
    appliedDays?: number | null
    minCount?: number | null
    targetKits?: number | null
    dailyBurnRate?: number | null
    deliveryDays?: number | null
  }
  bufferKitsNeeded?: number
}

interface ForecastResponse {
  forecast?: ForecastItem[]
}

interface Shipment {
  id: string
  study_id: string | null
  study_protocol: string | null
  study_title: string | null
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
  tracking_status: string | null
  last_tracking_update: string | null
}

interface TimelineEvent {
  id: string
  title: string
  dateLabel: string
  rawDate: string
  status: string
  accent: string
  order: number
}

interface ActionQueueItem {
  id: string
  severity: Severity
  title: string
  detail: string
  meta: string
  ctaLabel: string
  href: string
  timeLabel?: string | null
}

type CapacityIntent = 'good' | 'caution' | 'bad'

interface CapacityMetric {
  id: string
  label: string
  value: string
  subLabel: string
  intent: CapacityIntent
}

const severityStyles: Record<Severity, string> = {
  critical: 'border-red-500/60 bg-red-500/10 text-red-200',
  warning: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  stable: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200',
}

const intentStyles: Record<CapacityIntent, string> = {
  good: 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200',
  caution: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  bad: 'border-red-600/60 bg-red-500/10 text-red-200',
}

const TIMELINE_LIMIT = 8
const ACTION_QUEUE_LIMIT = 6
const FORECAST_CACHE_TTL = 60 * 1000

const forecastCache = new Map<string, { timestamp: number; items: ForecastItem[] }>()

export default function LabKitCommandCenterPage() {
  const { currentSiteId } = useSite()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionItems, setActionItems] = useState<ActionQueueItem[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [capacityMetrics, setCapacityMetrics] = useState<CapacityMetric[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          throw new Error('You are signed out. Please log back in to view the command center.')
        }

        const studiesUrl = currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies'
        const studiesResp = await fetch(studiesUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!studiesResp.ok) {
          throw new Error('Unable to load accessible studies.')
        }

        const studiesBody = await studiesResp.json().catch(() => ({}))
        const studies: StudySummary[] = Array.isArray(studiesBody?.studies) ? studiesBody.studies : []

        if (studies.length === 0) {
          if (!cancelled) {
            setActionItems([])
            setTimelineEvents([])
            setCapacityMetrics([])
          }
          return
        }

        const forecastResults = await Promise.allSettled(
          studies.map(async (study) => {
            const cacheHit = forecastCache.get(study.id)
            if (cacheHit && Date.now() - cacheHit.timestamp < FORECAST_CACHE_TTL) {
              return { study, items: cacheHit.items }
            }

            const response = await fetch(`/api/inventory-forecast?study_id=${study.id}&days=30`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok) {
              throw new Error(`Forecast unavailable for ${study.protocol_number}`)
            }
            const body: ForecastResponse = await response.json()
            const items = Array.isArray(body.forecast) ? body.forecast : []
            forecastCache.set(study.id, { timestamp: Date.now(), items })
            return { study, items }
          })
        )

        const forecastWithStudy: Array<{ study: StudySummary; item: ForecastItem }> = []
        const forecastErrors: string[] = []

        forecastResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            result.value.items.forEach((item) => {
              forecastWithStudy.push({ study: result.value.study, item })
            })
          } else {
            forecastErrors.push(result.reason instanceof Error ? result.reason.message : 'Unknown forecast error')
          }
        })

        const shipmentsResp = await fetch('/api/shipments/all', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const shipmentsBody = shipmentsResp.ok ? await shipmentsResp.json().catch(() => ({})) : {}
        const shipments: Shipment[] = Array.isArray(shipmentsBody?.shipments) ? shipmentsBody.shipments : []

        if (cancelled) return

        if (forecastErrors.length > 0) {
          setError(forecastErrors[0])
        }

        setActionItems(buildActionQueue(forecastWithStudy, shipments, studies))
        setTimelineEvents(buildTimeline(forecastWithStudy, shipments))
        setCapacityMetrics(buildCapacityMetrics(forecastWithStudy, shipments))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unexpected error loading command center.')
        setActionItems([])
        setTimelineEvents([])
        setCapacityMetrics([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [currentSiteId])

  const activeQueueCount = useMemo(() => actionItems.filter(item => item.severity !== 'stable').length, [actionItems])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Lab Kit Command Center</h1>
            <p className="text-gray-400 mt-1 max-w-2xl">
              Snapshot the health of all lab kit programs, triage urgent actions, and jump straight into the right workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/lab-kits?view=inventory"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
            >
              Add Inventory
            </Link>
            <Link
              href="/lab-kits?view=orders-shipments"
              className="rounded-md border border-blue-500/60 px-4 py-2 text-sm font-semibold text-blue-200 hover:border-blue-400 hover:text-blue-100 transition-colors"
            >
              Plan Order
            </Link>
            <Link
              href="/shipments"
              className="rounded-md border border-purple-500/60 px-4 py-2 text-sm font-semibold text-purple-200 hover:border-purple-400 hover:text-purple-100 transition-colors"
            >
              Create Shipment
            </Link>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-5">
          <section className="xl:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Action Queue</h2>
                <p className="text-sm text-gray-500">Prioritized alerts pulled from forecast, shipments, and inventory health.</p>
              </div>
              <span className="rounded-full bg-gray-800/80 px-3 py-1 text-xs text-gray-300">
                {loading ? 'Loading…' : `${activeQueueCount} open`}
              </span>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-24 rounded-xl border border-gray-700/60 bg-gray-800/40 animate-pulse" />
                ))}
              </div>
            ) : actionItems.length === 0 ? (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/40 px-6 py-8 text-center text-sm text-gray-400">
                No active issues detected. Forecast, orders, and shipments are within configured thresholds.
              </div>
            ) : (
              <div className="space-y-3">
                {actionItems.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-xl border ${severityStyles[item.severity]} backdrop-blur-sm transition hover:border-white/40`}
                >
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="uppercase tracking-wide text-white/70">{item.severity}</span>
                        {item.timeLabel && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">{item.timeLabel}</span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                      <p className="text-sm text-white/70">{item.detail}</p>
                      <p className="text-xs text-white/50">{item.meta}</p>
                    </div>
                    <Link
                      href={item.href}
                      className="inline-flex items-center justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
                    >
                      {item.ctaLabel}
                    </Link>
                  </div>
                </article>
                ))}
              </div>
            )}
          </section>

          <aside className="xl:col-span-2 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Movement Timeline</h2>
              <p className="text-sm text-gray-500">Recent and upcoming order, shipment, and receipt activity.</p>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-20 rounded-lg border border-gray-700/60 bg-gray-800/40 animate-pulse" />
                ))}
              </div>
            ) : timelineEvents.length === 0 ? (
              <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 px-6 py-6 text-center text-sm text-gray-400">
                No recent movements. Orders and shipments will appear here automatically.
              </div>
            ) : (
              <ol className="space-y-3">
                {timelineEvents.map((item) => (
                  <li key={item.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className={`h-10 w-0.5 ${item.accent}`} />
                      <span className="h-3 w-0.5 bg-gray-700" />
                    </div>
                    <div className="flex-1 rounded-lg border border-gray-700/70 bg-gray-900/60 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                        <span className="text-xs text-gray-400">{item.dateLabel}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-400">{item.status}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>

        <section className="rounded-xl border border-gray-700/70 bg-gray-900/60 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Capacity Health</h2>
              <p className="text-sm text-gray-500">Buffer coverage, lead times, and expiring stock impact across programs.</p>
            </div>
            <Link href="/lab-kits?view=settings" className="text-sm font-semibold text-blue-300 hover:text-blue-200 transition">
              Adjust thresholds →
            </Link>
          </div>
          {loading ? (
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-24 rounded-lg border border-gray-700/60 bg-gray-800/40 animate-pulse" />
              ))}
            </div>
          ) : capacityMetrics.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-gray-700 px-6 py-8 text-center text-sm text-gray-400">
              No capacity metrics available yet. Configure kit buffering rules to populate this dashboard.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              {capacityMetrics.map((metric) => (
                <div
                  key={metric.id}
                  className={`rounded-lg border px-4 py-5 ${intentStyles[metric.intent]} backdrop-blur-sm`}
                >
                  <p className="text-xs uppercase tracking-wide text-white/60">{metric.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{metric.value}</p>
                  <p className="mt-1 text-sm text-white/70">{metric.subLabel}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

function buildActionQueue(
  forecast: Array<{ study: StudySummary; item: ForecastItem }>,
  shipments: Shipment[],
  studies: StudySummary[]
): ActionQueueItem[] {
  const items: ActionQueueItem[] = []
  const seen = new Set<string>()
  const now = new Date()

  const rankedForecast = forecast
    .filter(({ item }) => item && (item.status === 'critical' || item.status === 'warning' || (item.kitsExpiringSoon ?? 0) > 0))
    .map(({ study, item }) => {
      const severity: Severity =
        item.status === 'critical' ? 'critical' : item.status === 'warning' ? 'warning' : 'warning'
      const deficit = Math.max(0, Number(item.deficit ?? 0))
      const upcoming = Array.isArray(item.upcomingVisits) ? item.upcomingVisits[0] : undefined
      const targetDate = upcoming?.visit_date ? parseDateUTC(upcoming.visit_date) : null
      const daysUntil = targetDate ? Math.max(0, Math.round((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : null
      const kitName = item.kitTypeName || upcoming?.visit_name || 'Lab kit'
      const title = `${study.protocol_number} · ${kitName}`
      const detailParts: string[] = []
      if (deficit > 0) {
        detailParts.push(`Need +${deficit} kits to meet buffered requirement`)
      }
      if ((item.kitsExpiringSoon ?? 0) > 0) {
        detailParts.push(`${item.kitsExpiringSoon} expiring in window`)
      }
      if (Array.isArray(item.pendingOrders) && item.pendingOrders.length > 0) {
        const pendingQty = item.pendingOrders.reduce((sum, order) => sum + (order.quantity ?? 0), 0)
        if (pendingQty > 0) {
          detailParts.push(`${pendingQty} kits already ordered`)
        }
      }
      const detail = detailParts.join(' · ') || 'Review forecast details to confirm coverage.'
      const meta = study.study_title
      const href = `/lab-kits?studyId=${study.id}&view=forecast${item.kitTypeId ? `&kitType=${item.kitTypeId}` : ''}`
      const timeLabel = daysUntil !== null
        ? (daysUntil === 0 ? 'Due today' : daysUntil > 0 ? `In ${daysUntil}d` : `${Math.abs(daysUntil)}d overdue`)
        : null

      return {
        id: `${study.id}-${item.kitTypeId ?? item.key ?? Math.random().toString(36).slice(2)}`,
        severity,
        title,
        detail,
        meta,
        ctaLabel: 'Open forecast',
        href,
        timeLabel,
        priority: severity === 'critical' ? 0 : 1,
        deficit,
        daysUntil: daysUntil ?? 999,
      }
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (b.deficit !== a.deficit) return b.deficit - a.deficit
      return a.daysUntil - b.daysUntil
    })

  rankedForecast.forEach((entry) => {
    if (items.length >= ACTION_QUEUE_LIMIT) return
    if (seen.has(entry.id)) return
    seen.add(entry.id)
    items.push({
      id: entry.id,
      severity: entry.severity,
      title: entry.title,
      detail: entry.detail,
      meta: entry.meta,
      ctaLabel: entry.ctaLabel,
      href: entry.href,
      timeLabel: entry.timeLabel,
    })
  })

  if (items.length < ACTION_QUEUE_LIMIT) {
    const shipmentEntries = shipments
      .filter((shipment) => shipment.tracking_status && shipment.tracking_status !== 'delivered')
      .map<ActionQueueItem>((shipment) => {
        const severity: Severity =
          shipment.tracking_status === 'exception' || shipment.tracking_status === 'lost'
            ? 'critical'
            : shipment.tracking_status === 'delayed'
              ? 'warning'
              : 'stable'
        const studyMeta = shipment.study_id
          ? studies.find((s) => s.id === shipment.study_id)
          : null
        const meta = studyMeta
          ? `${studyMeta.protocol_number} · ${studyMeta.study_title}`
          : shipment.study_protocol
            ? `${shipment.study_protocol} · ${shipment.study_title ?? 'Study'}`
            : shipment.study_title ?? 'Shipment tracking'

        const eta = shipment.estimated_delivery || shipment.actual_delivery || shipment.shipped_date
        const etaLabel = eta ? formatDateUTC(eta, 'en-US', { month: 'short', day: 'numeric' }) : 'Unknown ETA'
        const etaDate = eta ? parseDateUTC(eta) : null
        let timeLabel: string | null = null
        if (etaDate) {
          const rawDiff = Math.round((etaDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          timeLabel = rawDiff === 0 ? 'ETA today' : rawDiff > 0 ? `ETA in ${rawDiff}d` : `${Math.abs(rawDiff)}d late`
        }

        return {
          id: `shipment-${shipment.id}`,
          severity,
          title: `Shipment ${shipment.airway_bill_number} (${shipment.carrier})`,
          detail: `Status: ${shipment.tracking_status ?? 'unknown'} · ETA ${etaLabel}`,
          meta,
          ctaLabel: 'View shipment',
          href: `/shipments?id=${shipment.id}`,
          timeLabel,
        }
      })
      .sort((a, b) => (a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : 0))

    for (const shipment of shipmentEntries) {
      if (items.length >= ACTION_QUEUE_LIMIT) break
      if (seen.has(shipment.id)) continue
      seen.add(shipment.id)
      items.push(shipment)
    }
  }

  return items
}

function buildTimeline(
  forecast: Array<{ study: StudySummary; item: ForecastItem }>,
  shipments: Shipment[]
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  const addEvent = (event: TimelineEvent) => {
    events.push(event)
  }

  shipments.forEach((shipment) => {
    const rawDate = shipment.actual_delivery || shipment.estimated_delivery || shipment.shipped_date
    if (!rawDate) return
    const accent = shipment.tracking_status === 'delivered'
      ? 'bg-emerald-500/80'
      : shipment.tracking_status === 'delayed'
        ? 'bg-amber-500/80'
        : 'bg-purple-500/80'

    addEvent({
      id: `shipment-${shipment.id}`,
      title: `Shipment ${shipment.airway_bill_number} (${shipment.carrier})`,
      dateLabel: formatDateUTC(rawDate, 'en-US', { month: 'short', day: 'numeric' }),
      rawDate,
      status: `Tracking status: ${shipment.tracking_status ?? 'unknown'}`,
      accent,
      order: shipment.tracking_status === 'delivered' ? 2 : shipment.tracking_status === 'delayed' ? 0 : 1,
    })
  })

  forecast.forEach(({ study, item }) => {
    if (!Array.isArray(item.pendingOrders)) return
    item.pendingOrders.forEach((order) => {
      const rawDate = order.expectedArrival || order.createdAt
      if (!rawDate) return
      addEvent({
        id: `order-${order.id}`,
        title: `Order ${order.id.slice(0, 6)} · ${item.kitTypeName ?? 'Lab kit'}`,
        dateLabel: formatDateUTC(rawDate, 'en-US', { month: 'short', day: 'numeric' }),
        rawDate,
        status: `${study.protocol_number} · ${order.status === 'pending' ? 'Pending' : order.status === 'received' ? 'Received' : 'Cancelled'} · Qty ${order.quantity}`,
        accent: order.status === 'pending' ? 'bg-blue-500/80' : order.status === 'received' ? 'bg-emerald-500/80' : 'bg-gray-500/70',
        order: order.status === 'pending' ? 0 : order.status === 'received' ? 2 : 3,
      })
    })
  })

  events.sort((a, b) => {
    const dateA = parseDateUTC(a.rawDate) || new Date(a.rawDate)
    const dateB = parseDateUTC(b.rawDate) || new Date(b.rawDate)
    if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
      return dateB.getTime() - dateA.getTime()
    }
    return a.order - b.order
  })

  return events.slice(0, TIMELINE_LIMIT)
}

function buildCapacityMetrics(
  forecast: Array<{ study: StudySummary; item: ForecastItem }>,
  shipments: Shipment[]
): CapacityMetric[] {
  if (forecast.length === 0) return []

  const totalAvailable = forecast.reduce((sum, { item }) => sum + (Number(item.kitsAvailable ?? 0) || 0), 0)
  const totalPending = forecast.reduce((sum, { item }) => sum + (Number(item.pendingOrderQuantity ?? 0) || 0), 0)
  const totalExpiring = forecast.reduce((sum, { item }) => sum + (Number(item.kitsExpiringSoon ?? 0) || 0), 0)
  const totalDailyBurn = forecast.reduce((sum, { item }) => sum + (Number(item.bufferMeta?.dailyBurnRate ?? 0) || 0), 0)
  const deliverySamples = forecast
    .map(({ item }) => (item.bufferMeta?.deliveryDays ?? null))
    .filter((value): value is number => typeof value === 'number' && value >= 0)

  const coverageDaysRaw = totalDailyBurn > 0
    ? (totalAvailable + totalPending - totalExpiring) / totalDailyBurn
    : 0
  const coverageDays = Math.max(0, Math.round(coverageDaysRaw))

  const coverageIntent: CapacityIntent =
    coverageDays >= 21 ? 'good' : coverageDays >= 14 ? 'caution' : 'bad'

  const avgLeadTime = deliverySamples.length > 0
    ? deliverySamples.reduce((sum, value) => sum + value, 0) / deliverySamples.length
    : null

  const leadIntent: CapacityIntent =
    avgLeadTime === null ? 'caution' : avgLeadTime <= 7 ? 'good' : avgLeadTime <= 10 ? 'caution' : 'bad'
  const leadValue = avgLeadTime === null ? '—' : `${avgLeadTime.toFixed(1)} days`
  const leadSubLabel = avgLeadTime === null
    ? 'No vendor lead time data available'
    : `Based on ${deliverySamples.length} kit types`

  const outlierThreshold = 10
  const leadOutliers = forecast.filter(({ item }) => (item.bufferMeta?.deliveryDays ?? 0) > outlierThreshold)
  const worstLeadTime = leadOutliers.reduce((max, { item }) => Math.max(max, item.bufferMeta?.deliveryDays ?? 0), 0)
  const worstStudyNames = new Set(
    leadOutliers
      .map(({ study }) => study.protocol_number)
      .filter(Boolean)
  )

  const outlierIntent: CapacityIntent =
    leadOutliers.length === 0 ? 'good' : worstLeadTime <= 14 ? 'caution' : 'bad'
  const outlierValue =
    leadOutliers.length === 0 ? 'No outliers' : `${leadOutliers.length} kit${leadOutliers.length === 1 ? '' : 's'}`
  const outlierSubLabel =
    leadOutliers.length === 0
      ? 'All vendors within 10 days'
      : `Worst ${worstLeadTime}d · ${worstStudyNames.size} protocol${worstStudyNames.size === 1 ? '' : 's'}`

  const actualDeliverySamples = shipments
    .map((shipment) => {
      const shipped = parseDateUTC(shipment.shipped_date)
      const delivered = parseDateUTC(shipment.actual_delivery)
      if (!shipped || !delivered) return null
      const diff = Math.max(0, Math.round((delivered.getTime() - shipped.getTime()) / (24 * 60 * 60 * 1000)))
      return diff
    })
    .filter((value): value is number => typeof value === 'number')

  const targetLeadAverage = deliverySamples.length > 0
    ? deliverySamples.reduce((sum, value) => sum + value, 0) / deliverySamples.length
    : null

  const actualLeadAverage = actualDeliverySamples.length > 0
    ? actualDeliverySamples.reduce((sum, value) => sum + value, 0) / actualDeliverySamples.length
    : null

  const leadPerformanceDelta =
    targetLeadAverage !== null && actualLeadAverage !== null
      ? actualLeadAverage - targetLeadAverage
      : null

  const lateShipments = leadPerformanceDelta !== null && targetLeadAverage !== null
    ? actualDeliverySamples.filter((sample) => sample > targetLeadAverage + 2).length
    : 0

  const performanceIntent: CapacityIntent =
    leadPerformanceDelta === null
      ? 'caution'
      : leadPerformanceDelta <= 1
        ? 'good'
        : leadPerformanceDelta <= 3
          ? 'caution'
          : 'bad'

  const performanceValue =
    leadPerformanceDelta === null
      ? 'No data'
      : Math.abs(leadPerformanceDelta) < 0.5
        ? 'On target'
        : leadPerformanceDelta < 0
          ? `${Math.abs(leadPerformanceDelta).toFixed(1)}d early`
          : `${leadPerformanceDelta.toFixed(1)}d late`

  const performanceSubLabel =
    leadPerformanceDelta === null
      ? 'Need recent shipments with delivered dates'
      : lateShipments === 0
        ? `${actualDeliverySamples.length} shipments · none exceeded ${((targetLeadAverage ?? 0) + 2).toFixed(1)}d (target +2d)`
        : `${actualDeliverySamples.length} shipments · ${lateShipments} exceeded ${((targetLeadAverage ?? 0) + 2).toFixed(1)}d (target +2d)`

  const totalInventory = totalAvailable + totalPending
  const expiringRatio = totalInventory > 0 ? totalExpiring / totalInventory : 0
  const expiringIntent: CapacityIntent =
    totalExpiring === 0 ? 'good' : expiringRatio <= 0.1 ? 'good' : expiringRatio <= 0.25 ? 'caution' : 'bad'

  const studiesWithExpiring = new Set<string>()
  forecast.forEach(({ study, item }) => {
    if ((item.kitsExpiringSoon ?? 0) > 0) {
      studiesWithExpiring.add(study.id)
    }
  })

  return [
    {
      id: 'coverage',
      label: 'Overall buffer coverage',
      value: `${coverageDays} days`,
      subLabel: `Across ${forecast.length} kit types`,
      intent: coverageIntent,
    },
    {
      id: 'lead-time',
      label: 'Average vendor lead time',
      value: leadValue,
      subLabel: leadSubLabel,
      intent: leadIntent,
    },
    {
      id: 'lead-outliers',
      label: 'High lead time vendors',
      value: outlierValue,
      subLabel: outlierSubLabel,
      intent: outlierIntent,
    },
    {
      id: 'lead-performance',
      label: 'Lead time performance',
      value: performanceValue,
      subLabel: performanceSubLabel,
      intent: performanceIntent,
    },
    {
      id: 'expiring',
      label: 'Expiring stock impact',
      value: `${totalExpiring} kits`,
      subLabel: `${studiesWithExpiring.size} studies affected`,
      intent: expiringIntent,
    },
  ]
}
