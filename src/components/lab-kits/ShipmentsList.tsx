'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUSShort } from '@/lib/date-utils'

interface ShipmentsListProps {
  studyId: string | null // null means show all studies
  refreshKey: number
  onRefresh: () => void
  onLocateKit?: (options: { studyId?: string | null; accessionNumber?: string | null }) => void
  groupByAwb?: boolean
}

type Shipment = {
  id: string
  airway_bill_number: string
  carrier: string
  shipped_date: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
  tracking_status: string | null
  accession_number: string | null
  study_id: string | null
  study_protocol?: string | null
  study_title?: string | null
  lab_kit_id: string | null
  subject_visit_id: string | null
  kit?: {
    id: string
    kit_type: string | null
    status: string | null
    accession_number: string | null
    visit_schedule_id: string | null
    visit_schedule?: {
      id: string
      visit_name: string | null
      visit_number: number | null
    } | null
  } | null
  subject_assignment?: {
    subject_id: string | null
    subject_number: string | null
    visit_id: string | null
    visit_name: string | null
    visit_date: string | null
  } | null
}

interface AwbGroup {
  key: string
  airwayBill: string | null
  shipments: Shipment[]
  carriers: Set<string>
  studyProtocols: Set<string>
  studyTitles: Set<string>
  studyIds: Set<string>
  shippedDate: string | null
  estimatedDelivery: string | null
  actualDelivery: string | null
  hasPending: boolean
  hasDelivered: boolean
}

export default function ShipmentsList({ studyId, refreshKey, onRefresh, onLocateKit, groupByAwb = false }: ShipmentsListProps) {
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const handleMarkDelivered = async (shipmentId: string) => {
    try {
      setUpdating(shipmentId)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const deliveryDate = new Date().toISOString().split('T')[0]

      const resp = await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tracking_status: 'delivered',
          actual_delivery: deliveryDate
        })
      })

      if (resp.ok) {
        setShipments(prev => prev.map(shipment => shipment.id === shipmentId
          ? {
              ...shipment,
              tracking_status: 'delivered',
              actual_delivery: deliveryDate,
              kit: shipment.kit ? { ...shipment.kit, status: 'delivered' } : shipment.kit
            }
          : shipment
        ))
        onRefresh() // Refresh the shipments list
      } else {
        const error = await resp.json().catch(() => ({ error: 'Failed to update shipment' }))
        console.error('Failed to mark shipment as delivered:', error.error)
        alert('Failed to mark shipment as delivered: ' + error.error)
      }
    } catch (error) {
      console.error('Error updating shipment:', error)
      alert('Failed to mark shipment as delivered')
    } finally {
      setUpdating(null)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          setShipments([])
          setLoading(false)
          return
        }
        const url = studyId ? `/api/shipments?studyId=${studyId}` : '/api/shipments/all'
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!resp.ok) {
          setShipments([])
        } else {
          const json = await resp.json()
          setShipments(json.shipments || [])
        }
      } catch {
        setShipments([])
      } finally {
        setLoading(false)
      }
    }
    load() // Always load, whether studyId is provided or not
  }, [studyId, refreshKey])

  const awbGroupList: AwbGroup[] = useMemo(() => {
    if (!groupByAwb) return []

    const map = new Map<string, AwbGroup>()

    for (const shipment of shipments) {
      const awb = shipment.airway_bill_number || null
      const key = awb ? `awb:${awb}` : `awb:none:${shipment.id}`
      let group = map.get(key)
      if (!group) {
        group = {
          key,
          airwayBill: awb,
          shipments: [],
          carriers: new Set<string>(),
          studyProtocols: new Set<string>(),
          studyTitles: new Set<string>(),
          studyIds: new Set<string>(),
          shippedDate: null,
          estimatedDelivery: null,
          actualDelivery: null,
          hasPending: false,
          hasDelivered: false
        }
        map.set(key, group)
      }

      group.shipments.push(shipment)
      if (shipment.carrier) group.carriers.add(shipment.carrier)
      if (shipment.study_protocol) group.studyProtocols.add(shipment.study_protocol)
      if (shipment.study_title) group.studyTitles.add(shipment.study_title)
      if (shipment.study_id) group.studyIds.add(shipment.study_id)

      if (shipment.shipped_date) {
        if (!group.shippedDate || shipment.shipped_date < group.shippedDate) {
          group.shippedDate = shipment.shipped_date
        }
      }

      if (shipment.estimated_delivery) {
        if (!group.estimatedDelivery || shipment.estimated_delivery < group.estimatedDelivery) {
          group.estimatedDelivery = shipment.estimated_delivery
        }
      }

      if (shipment.actual_delivery) {
        if (!group.actualDelivery || shipment.actual_delivery > group.actualDelivery) {
          group.actualDelivery = shipment.actual_delivery
        }
      }

      if (shipment.tracking_status !== 'delivered') {
        group.hasPending = true
      }
      if (shipment.tracking_status === 'delivered') {
        group.hasDelivered = true
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aDate = a.shippedDate || a.actualDelivery || a.estimatedDelivery || ''
      const bDate = b.shippedDate || b.actualDelivery || b.estimatedDelivery || ''
      return bDate.localeCompare(aDate)
    })
  }, [groupByAwb, shipments])

  useEffect(() => {
    if (!groupByAwb) return
    const pendingKeys = awbGroupList
      .filter(group => group.hasPending)
      .map(group => group.key)
    setExpandedGroups(prev => {
      const next = new Set(prev)
      pendingKeys.forEach(key => next.add(key))
      return next
    })
  }, [groupByAwb, awbGroupList])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const carrierLabel = (group: AwbGroup) => {
    if (group.carriers.size === 0) return 'Carrier —'
    if (group.carriers.size === 1) {
      const value = Array.from(group.carriers)[0]
      return value ? value.toUpperCase() : 'Carrier —'
    }
    return 'Multiple carriers'
  }

  const studyLabel = (group: AwbGroup) => {
    if (group.studyProtocols.size <= 1) {
      const protocol = Array.from(group.studyProtocols)[0]
      const title = Array.from(group.studyTitles)[0]
      if (!protocol && !title) return 'Study: —'
      return `Study: ${protocol || title || '—'}`
    }
    return 'Multiple studies'
  }

  const statusBadge = (group: AwbGroup) => {
    if (!group.hasPending) {
      return { label: 'Delivered', className: 'bg-green-900/30 border border-green-700 text-green-200' }
    }
    if (group.hasDelivered) {
      return { label: 'Partial delivery', className: 'bg-yellow-900/40 border border-yellow-700 text-yellow-200' }
    }
    return { label: 'In transit', className: 'bg-blue-900/30 border border-blue-700 text-blue-200' }
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse h-5 w-40 bg-gray-700 rounded mb-4" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-700/60 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const renderAwbGroup = (group: AwbGroup) => {
    const isExpanded = expandedGroups.has(group.key)
    const badge = statusBadge(group)
    const shippedLabel = group.shippedDate ? `Shipped ${formatDateUSShort(group.shippedDate)}` : null
    const etaLabel = group.hasPending && group.estimatedDelivery ? `ETA ${formatDateUSShort(group.estimatedDelivery)}` : null
    const deliveredLabel = !group.hasPending && group.actualDelivery ? `Delivered ${formatDateUSShort(group.actualDelivery)}` : null
    const totalDelivered = group.shipments.filter(s => s.tracking_status === 'delivered').length
    const totalInTransit = group.shipments.length - totalDelivered

    return (
      <div key={group.key} className="border border-gray-700 rounded-lg bg-gray-900/40">
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          className="w-full text-left px-4 py-3 flex items-center justify-between gap-4"
        >
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-white">
                {group.airwayBill ? `AWB ${group.airwayBill}` : 'No Airway Bill'}
              </span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                {badge.label}
              </span>
              <span className="text-xs text-gray-400">
                {group.shipments.length} kit{group.shipments.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mt-1">
              <span>{carrierLabel(group)}</span>
              <span>{studyLabel(group)}</span>
              {shippedLabel && <span>{shippedLabel}</span>}
              {etaLabel && <span>{etaLabel}</span>}
              {deliveredLabel && <span>{deliveredLabel}</span>}
              {totalInTransit > 0 && <span>{totalInTransit} in transit</span>}
              {totalDelivered > 0 && <span>{totalDelivered} delivered</span>}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="border-t border-gray-700 px-4 py-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-gray-400">
                  <tr>
                    <th className="text-left py-2 pr-3">Accession</th>
                    <th className="text-left py-2 pr-3">Subject</th>
                    <th className="text-left py-2 pr-3">Visit</th>
                    <th className="text-left py-2 pr-3">Kit</th>
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2 pr-3">Dates</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {group.shipments.map(shipment => (
                    <tr key={shipment.id} className="text-gray-100 align-top">
                      <td className="py-2 pr-3 font-mono text-xs">
                        {shipment.accession_number || '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {shipment.subject_assignment ? (
                          <div className="space-y-1">
                            <div className="font-medium text-sm text-white">
                              {shipment.subject_assignment.subject_number || shipment.subject_assignment.subject_id || 'Subject'}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {shipment.subject_assignment.visit_name || 'Visit'}
                              {shipment.subject_assignment.visit_date ? ` • ${formatDateUSShort(shipment.subject_assignment.visit_date)}` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {shipment.subject_assignment?.visit_name || '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {shipment.kit ? (
                          <div className="space-y-1">
                            <div className="font-medium text-sm text-white">{shipment.kit.kit_type || 'Kit'}</div>
                            <div className="text-[11px] text-gray-400">
                              {(shipment.kit.status || 'pending').replace(/_/g, ' ')}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${
                          shipment.tracking_status === 'delivered'
                            ? 'bg-green-900/30 border border-green-700 text-green-200'
                            : 'bg-blue-900/30 border border-blue-700 text-blue-200'
                        }`}>
                          {(shipment.tracking_status || 'pending').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-400">
                        <div className="space-y-1">
                          {shipment.shipped_date && <div>Shipped {formatDateUSShort(shipment.shipped_date)}</div>}
                          {shipment.estimated_delivery && shipment.tracking_status !== 'delivered' && (
                            <div>ETA {formatDateUSShort(shipment.estimated_delivery)}</div>
                          )}
                          {shipment.actual_delivery && (
                            <div>Delivered {formatDateUSShort(shipment.actual_delivery)}</div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-xs">
                        <div className="flex flex-col gap-2">
                          {onLocateKit && (
                            <button
                              onClick={() => onLocateKit({ studyId: shipment.study_id, accessionNumber: shipment.accession_number })}
                              className="px-2 py-1 border border-gray-600 text-gray-100 rounded hover:bg-gray-700"
                            >
                              Locate Kit
                            </button>
                          )}
                          {shipment.tracking_status === 'shipped' && (
                            <button
                              onClick={() => handleMarkDelivered(shipment.id)}
                              disabled={updating === shipment.id}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {updating === shipment.id ? 'Marking…' : 'Mark Delivered'}
                            </button>
                          )}
                          {shipment.tracking_status === 'delivered' && (
                            <span className="text-green-400 text-[11px]">✓ Delivered</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (groupByAwb) {
    const pendingGroups = awbGroupList.filter(group => group.hasPending)
    const deliveredGroups = awbGroupList.filter(group => !group.hasPending)

    return (
      <div className="space-y-6">
        {pendingGroups.length === 0 && deliveredGroups.length === 0 ? (
          <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-6 text-gray-400 text-center">
            <p>No shipments found.</p>
            <p className="text-sm mt-1">Ship a kit to see it listed here.</p>
          </div>
        ) : (
          <>
            {pendingGroups.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-blue-200 uppercase tracking-wide">In Transit & Pending Delivery</h3>
                {pendingGroups.map(renderAwbGroup)}
              </section>
            )}
            {deliveredGroups.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-green-200 uppercase tracking-wide">Delivered</h3>
                {deliveredGroups.map(renderAwbGroup)}
              </section>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Shipments</h3>
        <button onClick={onRefresh} className="px-3 py-1.5 text-sm bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md hover:bg-gray-700">
          Refresh
        </button>
      </div>

      {shipments.length === 0 ? (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8 text-center text-gray-400">
          <p>No shipments yet.</p>
          <p className="text-sm mt-1">Use bulk import or internal flow to add shipments.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-700 rounded-lg">
          <table className="min-w-full">
            <thead className="bg-gray-700/50 text-gray-300">
              <tr>
                <th className="text-left px-4 py-2">Airway Bill</th>
                {!studyId && <th className="text-left px-4 py-2">Study</th>}
                <th className="text-left px-4 py-2">Accession</th>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-left px-4 py-2">Kit</th>
                <th className="text-left px-4 py-2">Carrier</th>
                <th className="text-left px-4 py-2">Shipped</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {shipments.map(s => (
                <tr key={s.id} className="text-gray-100 align-top">
                  <td className="px-4 py-3 font-mono whitespace-nowrap">{s.airway_bill_number}</td>
                  {!studyId && (
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="font-medium text-white">{s.study_protocol || 'Unknown'}</div>
                        <div className="text-gray-400 text-xs truncate max-w-xs" title={s.study_title || undefined}>
                          {s.study_title || 'Unknown Study'}
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-sm whitespace-nowrap">{s.accession_number || '-'}</td>
                  <td className="px-4 py-3">
                    {s.subject_assignment ? (
                      <div className="text-sm text-gray-200">
                        <div className="font-medium text-white">
                          {s.subject_assignment.subject_number || s.subject_assignment.subject_id || 'Subject'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {s.subject_assignment.visit_name || 'Visit'}
                          {s.subject_assignment.visit_date ? ` • ${formatDateUSShort(s.subject_assignment.visit_date)}` : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.kit ? (
                      <div className="text-sm text-gray-200 space-y-1">
                        <div className="font-medium text-white">{s.kit.kit_type || 'Kit'}</div>
                        <div className="text-xs text-gray-400 uppercase tracking-wide">
                          {(s.kit.status || 'pending').replace(/_/g, ' ')}
                        </div>
                        {s.kit.visit_schedule?.visit_name && (
                          <div className="text-xs text-gray-500">
                            {s.kit.visit_schedule.visit_name}
                            {s.kit.visit_schedule.visit_number !== null ? ` (${s.kit.visit_schedule.visit_number})` : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">Unlinked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-200">{(s.carrier || '—').toUpperCase()}</div>
                    {s.actual_delivery && (
                      <div className="text-xs text-gray-400">Delivered {formatDateUSShort(s.actual_delivery)}</div>
                    )}
                    {!s.actual_delivery && s.estimated_delivery && (
                      <div className="text-xs text-gray-400">ETA {formatDateUSShort(s.estimated_delivery)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {s.shipped_date ? formatDateUSShort(s.shipped_date) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
                      s.tracking_status === 'shipped' ? 'bg-blue-900/20 border border-blue-700 text-blue-300' :
                      s.tracking_status === 'delivered' ? 'bg-green-900/20 border border-green-700 text-green-300' :
                      'bg-gray-900/20 border border-gray-700 text-gray-300'
                    }`}>
                      {(s.tracking_status || 'pending').replace(/_/g, ' ')}
                    </span>
                    <div className="text-xs text-gray-400 mt-1">
                      {s.actual_delivery
                        ? `Delivered ${formatDateUSShort(s.actual_delivery)}`
                        : s.estimated_delivery
                          ? `Awaiting • ETA ${formatDateUSShort(s.estimated_delivery)}`
                          : 'Awaiting delivery'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      {onLocateKit && (
                        <button
                          onClick={() => onLocateKit({ studyId: s.study_id, accessionNumber: s.accession_number })}
                          className="px-3 py-1 border border-gray-600 text-gray-100 text-xs rounded transition-colors hover:bg-gray-700"
                        >
                          Locate Kit
                        </button>
                      )}
                      {s.tracking_status === 'shipped' && (
                        <button
                          onClick={() => handleMarkDelivered(s.id)}
                          disabled={updating === s.id}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updating === s.id ? (
                            <span className="flex items-center space-x-1">
                              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>Marking...</span>
                            </span>
                          ) : (
                            'Mark Delivered'
                          )}
                        </button>
                      )}
                      {s.tracking_status === 'delivered' && (
                        <span className="text-green-400 text-xs">✓ Delivered</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
