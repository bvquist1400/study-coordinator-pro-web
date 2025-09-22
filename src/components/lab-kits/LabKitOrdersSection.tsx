'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import LabKitOrderModal from './LabKitOrderModal'
import { formatDateUTC } from '@/lib/date-utils'

type OrderStatus = 'pending' | 'received' | 'cancelled'

type OrderRow = {
  id: string
  study_id: string
  kit_type_id: string | null
  kit_type_name: string | null
  quantity: number
  vendor: string | null
  expected_arrival: string | null
  status: OrderStatus
  notes: string | null
  created_by: string | null
  created_by_profile: { id: string; full_name: string | null; email: string | null } | null
  created_at: string
  updated_at: string
  received_date: string | null
  study_protocol_number?: string | null
  study_title?: string | null
}

const STATUS_OPTIONS: Array<{ value: 'all' | OrderStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' }
]

const STATUS_BADGE: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/40' },
  received: { label: 'Received', className: 'bg-green-500/20 text-green-200 border-green-400/40' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-300 border-gray-400/40' }
}

interface LabKitOrdersSectionProps {
  studyId: string
  refreshKey?: number
  externalNotice?: { type: 'success' | 'error'; message: string } | null
  onClearExternalNotice?: () => void
  onOrderReceived?: (details: { study_id: string; kit_type_id: string | null; received_date: string | null; kit_type_name: string | null }) => void
}

export default function LabKitOrdersSection({
  studyId,
  refreshKey = 0,
  externalNotice,
  onClearExternalNotice,
  onOrderReceived
}: LabKitOrdersSectionProps) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [panelNotice, setPanelNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [pendingSearch, setPendingSearch] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null)

  const fetchOrders = useCallback(async () => {
    if (!studyId) {
      setOrders([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const params = new URLSearchParams({ studyId })
      params.set('_', String(refreshKey))
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchTerm.trim()) params.set('search', searchTerm.trim())

      const response = await fetch(`/api/lab-kit-orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to load lab kit orders')
      }

      const payload = await response.json()
      setOrders(Array.isArray(payload?.orders) ? payload.orders : [])
    } catch (error) {
      setPanelNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load lab kit orders.' })
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [studyId, statusFilter, searchTerm, refreshKey])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (externalNotice) {
      setPanelNotice(externalNotice)
      onClearExternalNotice?.()
    }
  }, [externalNotice, onClearExternalNotice])

  const handleMarkStatus = useCallback(async (order: OrderRow, nextStatus: OrderStatus) => {
    try {
      setProcessingId(order.id)
      setPanelNotice(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const payload: Record<string, unknown> = { status: nextStatus }
      if (nextStatus === 'received') {
        payload.receivedDate = new Date().toISOString().slice(0, 10)
      }

      const response = await fetch(`/api/lab-kit-orders/${order.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update order')
      }

      const body = await response.json().catch(() => ({}))
      const updatedOrderData = body?.order
      const receivedDateISO = typeof payload.receivedDate === 'string' ? payload.receivedDate : null

      if (nextStatus === 'received') {
        const kitTypeId = updatedOrderData?.kit_type_id ?? order.kit_type_id ?? null
        const receivedDate = updatedOrderData?.received_date ?? receivedDateISO ?? order.received_date ?? null
        const kitTypeName = order.kit_type_name ?? null
        onOrderReceived?.({ study_id: order.study_id, kit_type_id: kitTypeId, received_date: receivedDate, kit_type_name: kitTypeName })
      }

      setPanelNotice({ type: 'success', message: nextStatus === 'received' ? 'Order marked as received.' : 'Order cancelled.' })
      await fetchOrders()
    } catch (error) {
      setPanelNotice({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update order.' })
    } finally {
      setProcessingId(null)
    }
  }, [fetchOrders, onOrderReceived])

  const handleNewOrderSuccess = useCallback(async (message?: string) => {
    await fetchOrders()
    if (message) {
      setPanelNotice({ type: 'success', message })
    }
  }, [fetchOrders])

  const activeOrders = useMemo(() => orders.filter(order => order.status === 'pending'), [orders])

  if (!studyId) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-10 text-center text-gray-400">
        Select a study to manage kit orders.
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="border-b border-gray-700 px-6 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Kit Orders</h3>
          <p className="text-sm text-gray-400">Plan replenishments and track pending deliveries</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="text-sm text-gray-400">
            Pending orders: <span className="text-white font-semibold">{activeOrders.length}</span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            New order
          </button>
        </div>
      </div>

      <div className="border-b border-gray-700 px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as 'all' | OrderStatus)}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <form
            className="flex items-center gap-2"
            onSubmit={event => {
              event.preventDefault()
              setSearchTerm(pendingSearch)
            }}
          >
            <input
              type="text"
              value={pendingSearch}
              onChange={event => setPendingSearch(event.target.value)}
              placeholder="Search vendor or notes"
              className="w-56 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:border-blue-500 hover:text-white"
            >
              Search
            </button>
          </form>
        </div>
        <button
          onClick={() => {
            setPendingSearch('')
            setSearchTerm('')
          }}
          className="text-sm text-gray-400 hover:text-white"
        >
          Clear filters
        </button>
      </div>

      {panelNotice && (
        <div className={`px-6 py-3 text-sm ${panelNotice.type === 'error' ? 'text-red-300' : 'text-green-300'}`}>
          {panelNotice.message}
        </div>
      )}

      {loading ? (
        <div className="px-6 py-10 text-center text-gray-400">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="px-6 py-10 text-center text-gray-400">No orders found for the selected filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-6 py-3 text-left">Kit type</th>
                <th className="px-6 py-3 text-left">Quantity</th>
                <th className="px-6 py-3 text-left">Vendor</th>
                <th className="px-6 py-3 text-left">Expected arrival</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Placed</th>
                <th className="px-6 py-3 text-left">Notes</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm text-gray-200">
              {orders.map(order => {
                const badge = STATUS_BADGE[order.status]
                const createdBy = order.created_by_profile?.full_name || order.created_by_profile?.email || '—'
                return (
                  <tr key={order.id} className="hover:bg-gray-900/40">
                    <td className="px-6 py-3">
                      <div className="font-medium text-white">{order.kit_type_name || '—'}</div>
                      {studyId === 'all' && (
                        <div className="text-xs text-blue-200">
                          {order.study_protocol_number || order.study_title || order.study_id}
                        </div>
                      )}
                      <div className="text-xs text-gray-400">Placed by {createdBy}</div>
                    </td>
                    <td className="px-6 py-3">{order.quantity}</td>
                    <td className="px-6 py-3">{order.vendor || '—'}</td>
                    <td className="px-6 py-3">
                      {order.expected_arrival ? formatDateUTC(order.expected_arrival) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                      {order.status === 'received' && order.received_date && (
                        <div className="mt-1 text-[11px] text-gray-400">{`Received ${formatDateUTC(order.received_date)}`}</div>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div>{formatDateUTC(order.created_at)}</div>
                      <div className="text-xs text-gray-400">Updated {formatDateUTC(order.updated_at)}</div>
                    </td>
                    <td className="px-6 py-3 max-w-xs">
                      <span className="block truncate" title={order.notes || ''}>
                        {order.notes || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {order.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleMarkStatus(order, 'received')}
                            disabled={processingId === order.id}
                            className="rounded border border-green-500/60 px-3 py-1 text-xs font-semibold text-green-300 hover:border-green-400 hover:text-green-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {processingId === order.id ? 'Updating…' : 'Mark received'}
                          </button>
                          <button
                            onClick={() => setEditingOrder(order)}
                            disabled={processingId === order.id}
                            className="rounded border border-blue-500/60 px-3 py-1 text-xs font-semibold text-blue-300 hover:border-blue-400 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Cancel this order?')) {
                                handleMarkStatus(order, 'cancelled')
                              }
                            }}
                            disabled={processingId === order.id}
                            className="rounded border border-red-500/60 px-3 py-1 text-xs font-semibold text-red-300 hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">No actions</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <LabKitOrderModal
          studyId={studyId}
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleNewOrderSuccess}
          allowKitTypeChange
        />
      )}
      {editingOrder && (
        <LabKitOrderModal
          studyId={studyId}
          isOpen={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          onSuccess={async (message) => {
            await handleNewOrderSuccess(message || 'Order updated.')
            setEditingOrder(null)
          }}
          orderId={editingOrder.id}
          defaultKitTypeId={editingOrder.kit_type_id ?? undefined}
          defaultKitTypeName={editingOrder.kit_type_name ?? undefined}
          defaultQuantity={editingOrder.quantity}
          defaultVendor={editingOrder.vendor ?? undefined}
          defaultExpectedArrival={editingOrder.expected_arrival ?? undefined}
          defaultNotes={editingOrder.notes ?? undefined}
          allowKitTypeChange
        />
      )}
    </div>
  )
}
