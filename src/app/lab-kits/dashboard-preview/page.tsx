// New consolidated lab kit dashboard prototype.
'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import { useSite } from '@/components/site/SiteProvider'
import { formatDateUTC } from '@/lib/date-utils'
import { useLabKitDashboardData } from '@/hooks/useLabKitDashboardData'
import type { DashboardForecastItem } from '@/hooks/useLabKitDashboardData'

interface StudyOption {
  id: string
  protocol_number: string
  study_title: string
}

function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'default' | 'red' | 'yellow' | 'green' }) {
  const toneClasses: Record<'default' | 'red' | 'yellow' | 'green', string> = {
    default: 'border-gray-700 bg-gray-900/60 text-gray-200',
    red: 'border-red-500/50 bg-red-500/10 text-red-100',
    yellow: 'border-amber-500/50 bg-amber-500/10 text-amber-100',
    green: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
  }

  return (
    <div className={`rounded-lg border px-4 py-5 backdrop-blur ${toneClasses[tone ?? 'default']}`}>
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-2 text-xs text-white/70">{hint}</p>}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-700 px-6 py-16 text-center text-sm text-gray-400">
      {message}
    </div>
  )
}

function ForecastList({ title, items, studyId }: { title: string; items: DashboardForecastItem[]; studyId: string | null }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-500">Sorted by risk score. Pulls directly from the inventory forecast API.</p>
        </div>
        <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      {items.length === 0 ? (
        <EmptyState message="No items meet this threshold." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const upcomingVisit = item.upcomingVisits?.[0]
            const deficitLabel = item.deficit > 0
              ? `${item.deficit} kit${item.deficit === 1 ? '' : 's'} short`
              : item.pendingOrderQuantity > 0
                ? `${item.pendingOrderQuantity} pending`
                : `Buffer target ${item.bufferTarget}`
            const legacyQuery = new URLSearchParams()
            if (studyId) legacyQuery.set('studyId', studyId)
            legacyQuery.set('view', 'forecast')
            if (item.kitTypeId) legacyQuery.set('kitType', item.kitTypeId)
            const legacyHref = `/lab-kits/legacy?${legacyQuery.toString()}`
            const quickOrderQuery = new URLSearchParams()
            quickOrderQuery.set('view', 'orders-shipments')
            quickOrderQuery.set('action', 'plan-order')
            if (studyId) quickOrderQuery.set('studyId', studyId)
            if (item.kitTypeId) quickOrderQuery.set('kitTypeId', item.kitTypeId)
            if (item.kitTypeName) quickOrderQuery.set('kitTypeName', item.kitTypeName)
            const suggestedQty = Math.max(((item as any).recommendedOrderQty ?? item.deficit ?? 1), 1)
            quickOrderQuery.set('quantity', String(suggestedQty))
            const quickOrderHref = `/lab-kits/legacy?${quickOrderQuery.toString()}`

            return (
              <article key={item.key} className="rounded-lg border border-gray-700 bg-gray-900/50 px-5 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="text-base font-semibold text-white">{item.kitTypeName}</h4>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/60">
                        {item.status === 'critical' ? 'Critical' : item.status === 'warning' ? 'Warning' : 'Stable'}
                      </span>
                      {item.riskLevel !== 'low' && (
                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-purple-200">
                          {item.riskLevel} risk
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-300">{deficitLabel}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>{item.kitsAvailable} ready</span>
                      <span>Need {item.requiredWithBuffer}</span>
                      {item.kitsExpiringSoon > 0 && <span>{item.kitsExpiringSoon} expiring soon</span>}
                      {upcomingVisit?.visit_date && (
                        <span>
                          Next visit {formatDateUTC(upcomingVisit.visit_date, 'en-US')}
                          {upcomingVisit.visit_name ? ` · ${upcomingVisit.visit_name}` : ''}
                        </span>
                      )}
                    </div>
                    {item.riskFactors.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-xs text-gray-400">
                        {item.riskFactors.slice(0, 3).map((factor, idx) => (
                          <li key={factor.type + idx}>{factor.detail || factor.type}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 text-right text-xs text-gray-400">
                    <span>Buffer target: {item.bufferTarget}</span>
                    <span>
                      Slack after buffer:{' '}
                      <span className={item.slackAfterBuffer < 0 ? 'text-red-300' : item.slackAfterBuffer === 0 ? 'text-amber-300' : 'text-green-300'}>
                        {item.slackAfterBuffer}
                      </span>
                    </span>
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={quickOrderHref}
                        className="inline-flex items-center justify-center rounded border border-blue-500/60 px-3 py-1 text-[11px] font-semibold text-blue-200 transition-colors hover:border-blue-400 hover:text-blue-100"
                      >
                        Plan order
                      </Link>
                      <Link href={legacyHref} className="inline-flex items-center justify-end text-[11px] font-medium text-blue-300 hover:text-blue-100">
                        Open full forecast →
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function DashboardPreviewContent() {
  const { currentSiteId } = useSite()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const initialStudyId = searchParams.get('studyId')
  const [studies, setStudies] = useState<StudyOption[]>([])
  const [loadingStudies, setLoadingStudies] = useState(true)
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(initialStudyId)

  const { loading, error, reload, state } = useLabKitDashboardData(selectedStudyId)
  const data = state.status === 'loaded' ? state.data : null

  const updateStudyQueryParam = useCallback((value: string | null) => {
    const basePath = pathname && pathname.startsWith('/lab-kits/dashboard-preview') ? '/lab-kits/dashboard-preview' : '/lab-kits'
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('studyId', value)
    } else {
      params.delete('studyId')
    }
    const query = params.toString()
    router.replace(`${basePath}${query ? `?${query}` : ''}`)
  }, [pathname, router, searchParams])

  const loadStudies = useCallback(async () => {
    setLoadingStudies(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const response = await fetch(currentSiteId ? `/api/studies?site_id=${currentSiteId}` : '/api/studies', {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        const json = await response.json().catch(() => ({}))
        const rows = Array.isArray(json?.studies) ? json.studies : []
        setStudies(rows)
        if (rows.length > 0) {
          const selectionStillValid = selectedStudyId && rows.some((row: { id: string }) => row.id === selectedStudyId)
          if (!selectionStillValid) {
            const nextId = rows[0].id
            setSelectedStudyId(nextId)
            updateStudyQueryParam(nextId)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load studies', err)
    } finally {
      setLoadingStudies(false)
    }
  }, [currentSiteId, selectedStudyId, updateStudyQueryParam])

  useEffect(() => {
    void loadStudies()
  }, [loadStudies])

  useEffect(() => {
    const param = searchParams.get('studyId')
    if (param && param !== selectedStudyId) {
      setSelectedStudyId(param)
    }
  }, [searchParams, selectedStudyId])

  const summaryCards = useMemo(() => {
    if (!data) {
      return []
    }

    const totalKits = data.inventory.length
    const available = data.inventoryByStatus['available'] ?? 0
    const assigned = data.inventoryByStatus['assigned'] ?? 0
    const pendingOrdersList = data.orders.filter((order) => order.status === 'pending')
    const pendingOrders = pendingOrdersList.length
    const pendingOrderQty = pendingOrdersList.reduce((sum, order) => sum + Math.max(0, order.quantity), 0)
    const shipmentsInTransit = data.shipments.filter((shipment) => shipment.tracking_status && shipment.tracking_status !== 'delivered').length
    const criticalIssues = data.slices.criticalForecast.length
    const warnings = data.slices.warningForecast.length

    return [
      {
        label: 'Total Kits',
        value: totalKits.toString(),
        hint: `${available} available · ${assigned} assigned`,
        tone: 'default' as const
      },
      {
        label: 'Forecast Horizon',
        value: data.summary ? `${data.summary.daysAhead} days` : 'n/a',
        hint: data.summary ? `${data.summary.totalVisitsScheduled} visits scheduled` : 'No visits in window',
        tone: 'default' as const
      },
      {
        label: 'Active Issues',
        value: `${criticalIssues} critical / ${warnings} warnings`,
        hint: 'Powered by forecast + expiring kit logic',
        tone: criticalIssues > 0 ? 'red' as const : warnings > 0 ? 'yellow' as const : 'green' as const
      },
      {
        label: 'Logistics',
        value: `${pendingOrderQty} kit${pendingOrderQty === 1 ? '' : 's'} pending arrival`,
        hint: `${pendingOrders} vendor order${pendingOrders === 1 ? '' : 's'} · ${shipmentsInTransit} shipment${shipmentsInTransit === 1 ? '' : 's'} in transit`,
        tone: pendingOrders > 0 || shipmentsInTransit > 0 ? 'yellow' as const : 'green' as const
      }
    ]
  }, [data])

  const activeOrders = useMemo(() => data?.orders.filter((order) => order.status === 'pending') ?? [], [data])
  const movementShipments = useMemo(
    () => data?.shipments.filter((shipment) => shipment.tracking_status && shipment.tracking_status !== 'delivered').slice(0, 5) ?? [],
    [data]
  )
  const inventoryPreview = useMemo(() => {
    if (!data) return []
    return data.inventory.slice(0, 8)
  }, [data])

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Lab Kit Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-400">
              Consolidated lab kit workspace with unified forecasting, inventory, order, and shipment signals. Use the quick actions to jump into specialized tools whenever deeper edits are required.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 text-gray-300">
                <span className="text-xs uppercase tracking-wide text-gray-500">Study</span>
                <select
                  value={selectedStudyId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value || null
                    setSelectedStudyId(value)
                    updateStudyQueryParam(value)
                  }}
                  disabled={loadingStudies || studies.length === 0}
                  className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {studies.map((study) => (
                    <option key={study.id} value={study.id}>
                      {study.protocol_number} — {study.study_title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={reload}
                className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:border-blue-500 hover:text-blue-200"
              >
                Refresh data
              </button>
              <Link
                href={selectedStudyId ? `/lab-kits/legacy?studyId=${selectedStudyId}` : '/lab-kits/legacy'}
                className="rounded-md border border-blue-500/60 px-3 py-2 text-sm text-blue-200 hover:border-blue-400 hover:text-blue-100"
              >
                Open tabbed workspace
              </Link>
              <Link
                href="/lab-kits/command-center"
                className="rounded-md border border-purple-500/60 px-3 py-2 text-sm text-purple-200 hover:border-purple-400 hover:text-purple-100"
              >
                Command center
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-gray-500">
            <p>Status: {loading ? 'Loading…' : error ? 'Error' : 'Ready'}</p>
            {error && <p className="max-w-xs text-red-300">{error}</p>}
          </div>
        </header>

        <section>
          <h2 className="text-lg font-semibold text-white">At a Glance</h2>
          <p className="text-sm text-gray-500">Compare key signals across inventory, forecast, and logistics.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.length === 0 ? (
              <EmptyState message={loading ? 'Loading snapshot…' : 'Select a study to see metrics.'} />
            ) : (
              summaryCards.map((card) => (
                <MetricCard key={card.label} label={card.label} value={card.value} hint={card.hint} tone={card.tone} />
              ))
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <ForecastList
              title="Critical Forecast Items"
              items={data?.slices?.criticalForecast ?? []}
              studyId={selectedStudyId}
            />
            <ForecastList
              title="Monitor (Warnings without deficit)"
              items={data?.slices?.warningForecast ?? []}
              studyId={selectedStudyId}
            />
          </div>
          <aside className="space-y-6 lg:col-span-5">
            <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Pending Orders</h3>
                <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">{activeOrders.length}</span>
              </div>
              {activeOrders.length === 0 ? (
                <EmptyState message="No pending vendor orders for this study." />
              ) : (
                <ul className="space-y-3 text-sm text-gray-200">
                  {activeOrders.map((order) => {
                    const quickReceiveParams = new URLSearchParams()
                    quickReceiveParams.set('view', 'orders-shipments')
                    quickReceiveParams.set('action', 'log-receipt')
                    quickReceiveParams.set('orderId', order.id)
                    if (selectedStudyId) {
                      quickReceiveParams.set('studyId', selectedStudyId)
                    }
                    const quickReceiveHref = `/lab-kits/legacy?${quickReceiveParams.toString()}`

                    return (
                      <li key={order.id} className="rounded border border-gray-700 bg-gray-800/80 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">{order.kit_type_name ?? 'Kit order'}</p>
                            <p className="text-xs text-gray-400">{order.quantity} kit{order.quantity === 1 ? '' : 's'} pending arrival to site</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {order.expected_arrival && (
                              <span className="text-xs text-gray-300">
                                ETA {formatDateUTC(order.expected_arrival, 'en-US')}
                              </span>
                            )}
                            <Link
                              href={quickReceiveHref}
                              className="inline-flex items-center justify-center rounded border border-emerald-500/60 px-3 py-1 text-[11px] font-semibold text-emerald-200 transition-colors hover:border-emerald-400 hover:text-emerald-100"
                            >
                              Mark as received
                            </Link>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          Vendor: {order.vendor ?? 'Unassigned'} · Placed {formatDateUTC(order.created_at, 'en-US')}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Shipments in Motion</h3>
                <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">{movementShipments.length}</span>
              </div>
              {movementShipments.length === 0 ? (
                <EmptyState message="No active lab kit shipments for this study." />
              ) : (
                <ul className="space-y-3 text-sm text-gray-200">
                  {movementShipments.map((shipment) => (
                    <li key={shipment.id} className="rounded border border-gray-700 bg-gray-800/80 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{shipment.airway_bill_number ?? 'Shipment'}</p>
                          <p className="text-xs text-gray-400">{shipment.carrier ?? 'Carrier TBD'}</p>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-gray-300">
                          {shipment.tracking_status ?? 'Pending'}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                        <span>Shipped: {shipment.shipped_date ? formatDateUTC(shipment.shipped_date, 'en-US') : '—'}</span>
                        <span>ETA: {shipment.estimated_delivery ? formatDateUTC(shipment.estimated_delivery, 'en-US') : '—'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>

        <section className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Inventory Snapshot</h3>
              <p className="text-sm text-gray-500">Shows the most recently updated kits across all statuses (excluding destroyed/archived).</p>
            </div>
            <Link
              href={selectedStudyId ? `/lab-kits/legacy?studyId=${selectedStudyId}&view=inventory` : '/lab-kits/legacy'}
              className="text-xs font-semibold text-blue-300 hover:text-blue-100"
            >
              Open management workspace →
            </Link>
          </div>
          {inventoryPreview.length === 0 ? (
            <EmptyState message="No kits available to preview." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="min-w-full divide-y divide-gray-800 text-sm">
                <thead className="bg-gray-800/80 text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Accession</th>
                    <th className="px-4 py-2 text-left">Kit Type</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Expiration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-200">
                  {inventoryPreview.map((kit) => (
                    <tr key={kit.id}>
                      <td className="px-4 py-2 font-mono text-xs text-gray-300">{kit.accession_number}</td>
                      <td className="px-4 py-2">{kit.kit_type_label ?? '—'}</td>
                      <td className="px-4 py-2 capitalize">{kit.status.replace('_', ' ')}</td>
                      <td className="px-4 py-2">
                        {kit.expiration_date ? formatDateUTC(kit.expiration_date, 'en-US') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-6 text-sm text-gray-400">
          <h3 className="text-lg font-semibold text-white">Next Steps</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Spot-check parity with the legacy workspace for a handful of studies (inventory totals, risk counts, and pending orders).</li>
            <li>Identify the remaining workflows that still require the legacy tabs (bulk edits, advanced filters) and queue migrations.</li>
            <li>Fold these metrics into automated tests so the dashboard stays in sync with the command center and API responses.</li>
          </ol>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default function LabKitDashboardPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-10">
          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-6 py-4 text-sm text-blue-200">
            Loading lab kit dashboard…
          </div>
        </div>
      }
    >
      <DashboardPreviewContent />
    </Suspense>
  )
}
