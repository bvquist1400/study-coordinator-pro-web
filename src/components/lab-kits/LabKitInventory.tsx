'use client'

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { supabase } from '@/lib/supabase/client'
import { LabKit, StudyKitType } from '@/types/database'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'
import EmptyState from './EmptyState'
import { EMPTY_STATE_TYPES, ACTION_TYPES } from '@/lib/lab-kits/empty-states'

interface LabKitInventoryProps {
  studyId: string
  refreshKey?: number
  onRefresh: () => void
  showExpiringOnly?: boolean
  prefillFilters?: { search: string; status: string; version: number }
  onOpenAddKit?: () => void
  onOpenBulkImport?: () => void
  onOpenQuickStart?: () => void
  onResetExpiringFilter?: () => void
}

interface LabKitWithVisit extends LabKit {
  visit_schedules?: {
    visit_name: string
    visit_number: number
  }
  studies?: { protocol_number?: string | null; study_title?: string | null } | null
  kit_type_label?: string | null
  kit_type_info?: {
    id: string
    name: string | null
    description: string | null
    is_active: boolean | null
  } | null
  subject_assignment?: {
    visit_id: string | null
    visit_date: string | null
    subject_id: string | null
    subject_number: string | null
    visit_name?: string | null
  } | null
  latest_shipment?: {
    id: string | null
    airway_bill_number: string | null
    carrier: string | null
    tracking_status: string | null
    shipped_date: string | null
    estimated_delivery: string | null
    actual_delivery: string | null
    accession_number: string | null
  } | null
}

function useInventoryRenderMetrics(viewMode: 'grouped' | 'list', rowCount: number) {
  const startRef = useRef<number>(0)
  const lastSampleRef = useRef<{ viewMode: 'grouped' | 'list'; rowCount: number; duration: number } | null>(null)

  useLayoutEffect(() => {
    if (typeof performance === 'undefined') return
    startRef.current = performance.now()
  })

  useEffect(() => {
    if (typeof performance === 'undefined') return
    if (process.env.NODE_ENV === 'production') return

    const duration = performance.now() - startRef.current
    const rounded = Math.round(duration)
    const previous = lastSampleRef.current

    const changed =
      !previous ||
      previous.viewMode !== viewMode ||
      previous.rowCount !== rowCount ||
      Math.abs(previous.duration - rounded) >= 5

    if (changed) {
      // Quick console sample for dev profiling without adding state churn
      // eslint-disable-next-line no-console
      console.info('[LabKitInventory] render', {
        viewMode,
        rows: rowCount,
        ms: rounded
      })
      lastSampleRef.current = { viewMode, rowCount, duration: rounded }
    }
  }, [viewMode, rowCount])
}

export default function LabKitInventory({ studyId, refreshKey, onRefresh, showExpiringOnly, prefillFilters, onOpenAddKit, onOpenBulkImport, onOpenQuickStart, onResetExpiringFilter }: LabKitInventoryProps) {
  const [labKits, setLabKits] = useState<LabKitWithVisit[]>([])
  const [loading, setLoading] = useState(true)
  // Default to showing Available kits
  const [statusFilter, setStatusFilter] = useState<string>('available')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedKit, setSelectedKit] = useState<LabKitWithVisit | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedKits, setSelectedKits] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'edit' | 'delete' | 'archive' | null>(null)
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [groupByVisit, setGroupByVisit] = useState(true)

  const getKitTypeLabel = useCallback((kit: LabKitWithVisit) => {
    return kit.kit_type_info?.name || kit.kit_type_label || kit.kit_type || '—'
  }, [])

  const loadLabKits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/lab-kits?studyId=${studyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setLabKits(data.labKits || [])
      } else {
        const err = await response.json().catch(() => ({}))
        console.error('Failed loading lab kits:', response.status, err)
        setLabKits([])
      }
    } catch (error) {
      console.error('Error loading lab kits:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    loadLabKits()
  }, [loadLabKits, refreshKey])

  useEffect(() => {
    if (!prefillFilters) return
    setSearchTerm(prefillFilters.search ?? '')
    setStatusFilter(prefillFilters.status || 'available')
  }, [prefillFilters])

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full"
    
    switch (status) {
      case 'available':
        return `${baseClasses} bg-green-900/50 text-green-300 border border-green-600`
      case 'assigned':
        return `${baseClasses} bg-blue-900/50 text-blue-300 border border-blue-600`
      case 'used':
        return `${baseClasses} bg-purple-900/50 text-purple-300 border border-purple-600`
      case 'pending_shipment':
        return `${baseClasses} bg-orange-900/50 text-orange-300 border border-orange-600`
      case 'shipped':
        return `${baseClasses} bg-yellow-900/50 text-yellow-300 border border-yellow-600`
      case 'delivered':
        return `${baseClasses} bg-emerald-900/50 text-emerald-300 border border-emerald-600`
      case 'expired':
        return `${baseClasses} bg-red-900/50 text-red-300 border border-red-600`
      default:
        return `${baseClasses} bg-gray-900/50 text-gray-300 border border-gray-600`
    }
  }

  const formatDate = (dateString: string | null) => (dateString ? formatDateUTC(dateString, 'en-US') : '-')

  const isExpiringSoon = (expirationDate: string | null) => {
    if (!expirationDate) return false
    
    // Parse using UTC for date-only to avoid shifts
    const expDate = (parseDateUTC(expirationDate) || new Date(expirationDate)) as Date
    
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today
    
    const thirtyDaysFromNow = new Date(today)
    thirtyDaysFromNow.setDate(today.getDate() + 30)
    
    return expDate <= thirtyDaysFromNow && expDate >= today
  }

  const filteredLabKits = labKits.filter(kit => {
    // Never show destroyed or archived kits in main inventory
    if (kit.status === 'destroyed' || kit.status === 'archived') return false
    
    const matchesStatus = statusFilter === 'all' || kit.status === statusFilter
    const kitTypeLabel = getKitTypeLabel(kit)
    const matchesSearch = searchTerm === '' || 
      kit.accession_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kitTypeLabel && kitTypeLabel.toLowerCase().includes(searchTerm.toLowerCase()))
    
    // If showExpiringOnly is true, only show kits expiring within 30 days
    const matchesExpiring = !showExpiringOnly || (kit.expiration_date && isExpiringSoon(kit.expiration_date))
    
    return matchesStatus && matchesSearch && matchesExpiring
  })

  const activeViewMode: 'grouped' | 'list' = groupByVisit ? 'grouped' : 'list'
  useInventoryRenderMetrics(activeViewMode, filteredLabKits.length)

  // Group kits by visit assignment
  const groupedLabKits = groupByVisit ? 
    filteredLabKits.reduce((groups, kit) => {
      const visitKey = kit.visit_schedules?.visit_name || 'Unassigned'
      if (!groups[visitKey]) {
        groups[visitKey] = []
      }
      groups[visitKey].push(kit)
      return groups
    }, {} as Record<string, LabKitWithVisit[]>) :
    { 'All Kits': filteredLabKits }

  const statusTotals = useMemo(() => {
    const totals = new Map<string, number>()
    labKits.forEach(kit => {
      if (kit.status === 'destroyed' || kit.status === 'archived') return
      totals.set(kit.status, (totals.get(kit.status) ?? 0) + 1)
    })
    totals.set('all', filteredLabKits.length)
    return totals
  }, [labKits, filteredLabKits.length])

  const showLogisticsColumns = statusFilter === 'shipped' || statusFilter === 'delivered'

  const listScrollParentRef = useRef<HTMLDivElement | null>(null)
  const baseColumnCount = 8
  const totalColumns = baseColumnCount + (showLogisticsColumns ? 2 : 0) + (studyId === 'all' ? 1 : 0)
  const shouldVirtualize = !groupByVisit && filteredLabKits.length > 80
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? filteredLabKits.length : 0,
    getScrollElement: () => listScrollParentRef.current,
    estimateSize: () => 72,
    overscan: 12
  })
  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : []
  const paddingTop = shouldVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = shouldVirtualize && virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0

  const renderListRow = (kit: LabKitWithVisit) => (
    <tr
      key={kit.id}
      className={`hover:bg-gray-700/30 transition-colors ${
        selectedKits.has(kit.id) ? 'bg-blue-600/10' : ''
      }`}
      data-kit-id={kit.id}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <input
          type="checkbox"
          checked={selectedKits.has(kit.id)}
          onChange={() => handleSelectKit(kit.id)}
          className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
        />
      </td>
      {studyId === 'all' && (
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-300">
            <div className="font-medium text-white">{kit.studies?.protocol_number || '—'}</div>
            <div
              className="text-xs text-gray-400 truncate max-w-40"
              title={kit.studies?.study_title || undefined}
            >
              {kit.studies?.study_title || ''}
            </div>
          </div>
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-white">
          {kit.accession_number}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-gray-300">
          {getKitTypeLabel(kit)}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-gray-300">
          {kit.visit_schedules ?
            `${kit.visit_schedules.visit_name} (${kit.visit_schedules.visit_number})`
            : 'Unassigned'
          }
        </div>
      </td>
      {showLogisticsColumns && (
        <td className="px-6 py-4">
          {kit.subject_assignment ? (
            <div className="text-sm text-gray-200">
              <div className="font-medium text-white">
                {kit.subject_assignment.subject_number || kit.subject_assignment.subject_id || 'Subject'}
              </div>
              <div className="text-xs text-gray-400">
                {kit.subject_assignment.visit_name || 'Visit'}
                {kit.subject_assignment.visit_date ? ` • ${formatDateUTC(kit.subject_assignment.visit_date)}` : ''}
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-500">Unassigned</span>
          )}
        </td>
      )}
      {showLogisticsColumns && (
        <td className="px-6 py-4">
          {kit.latest_shipment ? (
            <div className="text-xs text-gray-300 space-y-1">
              <div className="font-medium text-white uppercase tracking-wide">
                {(kit.latest_shipment.tracking_status || 'pending').replace(/_/g, ' ')}
              </div>
              <div className="text-gray-400">
                AWB {kit.latest_shipment.airway_bill_number || '—'}
              </div>
              <div className="text-gray-500">
                {kit.latest_shipment.shipped_date ? `Ship ${formatDateUTC(kit.latest_shipment.shipped_date)}` : 'Ship date unknown'}
                {kit.latest_shipment.estimated_delivery ? ` · ETA ${formatDateUTC(kit.latest_shipment.estimated_delivery)}` : ''}
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-500">No shipment</span>
          )}
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={getStatusBadge(kit.status)}>
          {kit.status.charAt(0).toUpperCase() + kit.status.slice(1)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-300">
          {kit.expiration_date ? (
            <span className={isExpiringSoon(kit.expiration_date) ? 'text-yellow-300' : ''}>
              {formatDate(kit.expiration_date)}
            </span>
          ) : '-'}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-300">
          {formatDate(kit.received_date)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex space-x-2">
          <button
            onClick={() => handleViewDetails(kit)}
            className="text-blue-400 hover:text-blue-300 transition-colors"
            title="View details"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            onClick={() => handleDelete(kit)}
            disabled={deleting === kit.id}
            className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 p-1 rounded"
            title="Delete lab kit permanently"
          >
            {deleting === kit.id ? (
              <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>
      </td>
    </tr>
  )

  const handleStatusChange = async (kitId: string, newStatus: LabKit['status']) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/lab-kits/${kitId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        onRefresh()
      } else {
        const error = await response.json()
        alert(`Error updating kit status: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating kit status:', error)
      alert('Failed to update kit status')
    }
  }

  const handleDelete = async (kit: LabKitWithVisit) => {
    if (!confirm(`Are you sure you want to permanently delete lab kit "${kit.accession_number}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(kit.id)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/lab-kits/${kit.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        onRefresh()
      } else {
        const error = await response.json()
        alert(`Error deleting lab kit: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting lab kit:', error)
      alert('Failed to delete lab kit')
    } finally {
      setDeleting(null)
    }
  }

  const handleViewDetails = (kit: LabKitWithVisit) => {
    setSelectedKit(kit)
  }

  const handleSelectAll = () => {
    if (selectedKits.size === filteredLabKits.length) {
      setSelectedKits(new Set())
    } else {
      setSelectedKits(new Set(filteredLabKits.map(kit => kit.id)))
    }
  }

  const handleSelectKit = (kitId: string) => {
    const newSelected = new Set(selectedKits)
    if (newSelected.has(kitId)) {
      newSelected.delete(kitId)
    } else {
      newSelected.add(kitId)
    }
    setSelectedKits(newSelected)
  }

  const handleBulkDelete = async () => {
    if (selectedKits.size === 0) return
    
    if (!confirm(`Are you sure you want to permanently delete ${selectedKits.size} lab kit(s)? This action cannot be undone.`)) {
      return
    }

    try {
      setBulkAction('delete')
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const kitIds = Array.from(selectedKits)
      const response = await fetch('/api/lab-kits/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ kitIds })
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(errText || 'Failed to delete lab kits')
      }

      const result = await response.json()
      const deletedCount = Array.isArray(result?.deleted) ? result.deleted.length : 0
      const deniedCount = Array.isArray(result?.denied) ? result.denied.length : 0
      const lockedCount = Array.isArray(result?.locked) ? result.locked.length : 0
      const missingCount = Array.isArray(result?.missing) ? result.missing.length : 0

      setSelectedKits(new Set())
      onRefresh()

      const messages = []
      if (deletedCount > 0) {
        messages.push(`Deleted ${deletedCount} lab kit${deletedCount === 1 ? '' : 's'}.`)
      }
      const issueNotes = []
      if (lockedCount > 0) issueNotes.push(`${lockedCount} locked`)
      if (deniedCount > 0) issueNotes.push(`${deniedCount} denied`)
      if (missingCount > 0) issueNotes.push(`${missingCount} missing`)

      if (issueNotes.length > 0) {
        messages.push(`Skipped: ${issueNotes.join(', ')}.`)
      }

      if (messages.length > 0) {
        alert(messages.join('\n'))
      }
    } catch (error) {
      console.error('Error bulk deleting kits:', error)
      alert('Failed to delete some lab kits')
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkArchive = async () => {
    if (selectedKits.size === 0) return
    
    if (!confirm(`Are you sure you want to archive ${selectedKits.size} lab kit(s)? They will be hidden from the main inventory but kept for records.`)) {
      return
    }

    try {
      setBulkAction('archive')
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const kitIds = Array.from(selectedKits)
      const response = await fetch('/api/lab-kits/batch-archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ kitIds })
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(errText || 'Failed to archive lab kits')
      }

      const result = await response.json()
      const archivedCount = Array.isArray(result?.archived) ? result.archived.length : 0
      const deniedCount = Array.isArray(result?.denied) ? result.denied.length : 0
      const immutableCount = Array.isArray(result?.immutable) ? result.immutable.length : 0
      const alreadyCount = Array.isArray(result?.alreadyArchived) ? result.alreadyArchived.length : 0
      const missingCount = Array.isArray(result?.missing) ? result.missing.length : 0

      setSelectedKits(new Set())
      onRefresh()

      const messages = []
      if (archivedCount > 0) {
        messages.push(`Archived ${archivedCount} lab kit${archivedCount === 1 ? '' : 's'}.`)
      }
      const issueNotes = []
      if (alreadyCount > 0) issueNotes.push(`${alreadyCount} already archived`)
      if (immutableCount > 0) issueNotes.push(`${immutableCount} immutable`)
      if (deniedCount > 0) issueNotes.push(`${deniedCount} denied`)
      if (missingCount > 0) issueNotes.push(`${missingCount} missing`)

      if (issueNotes.length > 0) {
        messages.push(`Skipped: ${issueNotes.join(', ')}.`)
      }

      if (messages.length > 0) {
        alert(messages.join('\n'))
      }
    } catch (error) {
      console.error('Error bulk archiving kits:', error)
      alert('Failed to archive some lab kits')
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkEdit = () => {
    if (selectedKits.size === 0) return
    setShowBulkEditModal(true)
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="animate-pulse p-6">
          <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Filters and Search */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">Status</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'available', label: 'Available' },
                { key: 'shipped', label: 'Shipped' },
                { key: 'delivered', label: 'Delivered' },
                { key: 'expired', label: 'Expired' },
                { key: 'all', label: 'All' }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-gray-700/40 text-gray-300 border-gray-600 hover:bg-gray-700/60'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="ml-1 text-[11px] text-gray-200/90">
                    ({statusTotals.get(tab.key) ?? 0})
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-between lg:justify-end">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 3.5a7.5 7.5 0 0013.15 13.15z" />
              </svg>
              <input
                type="text"
                placeholder="Search accession # or kit type"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-full"
              />
            </div>
            <button
              onClick={() => setGroupByVisit(!groupByVisit)}
              className={`px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${
                groupByVisit
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700/50 hover:bg-gray-600 text-gray-300 border border-gray-600'
              }`}
            >
              {groupByVisit ? 'Grouped view' : 'List view'}
            </button>
            <button
              onClick={() => setShowPendingModal(true)}
              className="px-4 py-2 rounded-md font-medium bg-orange-600 hover:bg-orange-700 text-white transition-colors whitespace-nowrap"
              title="Mark selected kits or pasted accessions as pending shipment"
            >
              Mark Pending Shipment
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Pending Modal */}
      {showPendingModal && (
        <BulkPendingShipmentModal
          studyId={studyId}
          selectedIds={Array.from(selectedKits)}
          onClose={() => setShowPendingModal(false)}
          onDone={() => { setShowPendingModal(false); setSelectedKits(new Set()); onRefresh() }}
        />
      )}

      {/* Bulk Actions Toolbar */}
      {selectedKits.size > 0 && (
        <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-blue-400 font-medium">
                {selectedKits.size} kit{selectedKits.size === 1 ? '' : 's'} selected
              </span>
              <button
                onClick={() => setSelectedKits(new Set())}
                className="text-gray-400 hover:text-white text-sm"
              >
                Clear selection
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowPendingModal(true)}
                disabled={bulkAction !== null}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h10M9 20h6" />
                </svg>
                <span>Mark Pending</span>
              </button>
              <button
                onClick={handleBulkEdit}
                disabled={bulkAction !== null}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Bulk Edit</span>
              </button>

              <button
                onClick={handleBulkArchive}
                disabled={bulkAction !== null}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {bulkAction === 'archive' && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8l6 6 10-10" />
                </svg>
                <span>Archive</span>
              </button>

              <button
                onClick={handleBulkDelete}
                disabled={bulkAction !== null}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {bulkAction === 'delete' && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lab Kits Table */}
      {filteredLabKits.length > 0 ? (
        groupByVisit ? (
          // Grouped View
          <div className="space-y-6">
            {Object.entries(groupedLabKits).map(([visitName, kits]) => (
              <div key={visitName} className="border border-gray-700 rounded-lg">
                <div className="bg-gray-700/30 px-6 py-3 border-b border-gray-700">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">{visitName}</h3>
                    <span className="text-sm text-gray-400">{kits.length} kit{kits.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700/20">
                      <tr>
                        <th className="px-6 py-3 w-12">
                          <input
                            type="checkbox"
                            checked={kits.every(kit => selectedKits.has(kit.id))}
                            onChange={() => {
                              const allSelected = kits.every(kit => selectedKits.has(kit.id))
                              const newSelected = new Set(selectedKits)
                              kits.forEach(kit => {
                                if (allSelected) {
                                  newSelected.delete(kit.id)
                                } else {
                                  newSelected.add(kit.id)
                                }
                              })
                              setSelectedKits(newSelected)
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                          />
                        </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Accession #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Kit Type
                    </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Visit
                  </th>
                  {showLogisticsColumns && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Subject
                    </th>
                  )}
                  {showLogisticsColumns && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Shipment Status
                    </th>
                  )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Expiration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Received
                    </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {kits.map((kit) => (
                <tr 
                  key={kit.id} 
                  className={`hover:bg-gray-700/30 transition-colors ${
                    selectedKits.has(kit.id) ? 'bg-blue-600/10' : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedKits.has(kit.id)}
                      onChange={() => handleSelectKit(kit.id)}
                      className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">
                      {kit.accession_number}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300">
                      {getKitTypeLabel(kit)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300">
                      {kit.visit_schedules ? 
                        `${kit.visit_schedules.visit_name} (${kit.visit_schedules.visit_number})` 
                        : 'Unassigned'
                      }
                    </div>
                  </td>
                  {showLogisticsColumns && (
                    <td className="px-6 py-4">
                      {kit.subject_assignment ? (
                        <div className="text-sm text-gray-200">
                          <div className="font-medium text-white">
                            {kit.subject_assignment.subject_number || kit.subject_assignment.subject_id || 'Subject'}
                          </div>
                          <div className="text-xs text-gray-400">
                            {kit.subject_assignment.visit_name || 'Visit'}
                            {kit.subject_assignment.visit_date ? ` • ${formatDateUTC(kit.subject_assignment.visit_date)}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Unassigned</span>
                      )}
                    </td>
                  )}
                  {showLogisticsColumns && (
                    <td className="px-6 py-4">
                      {kit.latest_shipment ? (
                        <div className="text-xs text-gray-300 space-y-1">
                          <div className="font-medium text-white uppercase tracking-wide">
                            {(kit.latest_shipment.tracking_status || 'pending').replace(/_/g, ' ')}
                          </div>
                          <div className="text-gray-400">
                            AWB {kit.latest_shipment.airway_bill_number || '—'}
                          </div>
                          <div className="text-gray-500">
                            {kit.latest_shipment.shipped_date ? `Ship ${formatDateUTC(kit.latest_shipment.shipped_date)}` : 'Ship date unknown'}
                            {kit.latest_shipment.estimated_delivery ? ` · ETA ${formatDateUTC(kit.latest_shipment.estimated_delivery)}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">No shipment</span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadge(kit.status)}>
                      {kit.status.charAt(0).toUpperCase() + kit.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${
                      isExpiringSoon(kit.expiration_date) ? 'text-yellow-300' : 'text-gray-300'
                    }`}>
                      {formatDate(kit.expiration_date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-300">
                      {formatDate(kit.received_date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center space-x-3">
                      {kit.status === 'available' && (
                        <button
                          onClick={() => handleStatusChange(kit.id, 'expired')}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          Mark Expired
                        </button>
                      )}
                      {kit.status === 'shipped' && (
                        <button
                          onClick={() => handleStatusChange(kit.id, 'delivered')}
                          className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                          Mark Delivered
                        </button>
                      )}
                      {kit.status === 'expired' && (
                        <button
                          onClick={() => handleStatusChange(kit.id, 'available')}
                          className="text-green-400 hover:text-green-300 font-medium"
                        >
                          Mark Available
                        </button>
                      )}
                      <button 
                        onClick={() => handleViewDetails(kit)}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleDelete(kit)}
                        disabled={deleting === kit.id}
                        className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 p-1 rounded"
                        title="Delete lab kit permanently"
                      >
                        {deleting === kit.id ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Regular View with optional virtualization
          <div className="overflow-x-auto">
            <div
              ref={listScrollParentRef}
              className={shouldVirtualize ? 'max-h-[70vh] overflow-y-auto' : 'overflow-y-visible'}
            >
              <table className="w-full">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedKits.size === filteredLabKits.length && filteredLabKits.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
                      />
                    </th>
                    {studyId === 'all' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Study</th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Accession #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Kit Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Visit
                    </th>
                    {showLogisticsColumns && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Subject
                      </th>
                    )}
                    {showLogisticsColumns && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Shipment Status
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Expiration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Received
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {shouldVirtualize ? (
                    <>
                      {paddingTop > 0 && (
                        <tr key="virtual-padding-top" style={{ height: `${paddingTop}px` }}>
                          <td colSpan={totalColumns} />
                        </tr>
                      )}
                      {virtualRows.map(virtualRow => {
                        const kit = filteredLabKits[virtualRow.index]
                        return kit ? renderListRow(kit) : null
                      })}
                      {paddingBottom > 0 && (
                        <tr key="virtual-padding-bottom" style={{ height: `${paddingBottom}px` }}>
                          <td colSpan={totalColumns} />
                        </tr>
                      )}
                    </>
                  ) : (
                    filteredLabKits.map(renderListRow)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <EmptyStateHandler
          labKits={labKits}
          filteredLabKits={filteredLabKits}
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          showExpiringOnly={showExpiringOnly}
          studyId={studyId}
          onClearFilters={() => {
            setSearchTerm('')
            setStatusFilter('available')
            onResetExpiringFilter?.()
          }}
          onOpenAddKit={onOpenAddKit}
          onOpenBulkImport={onOpenBulkImport}
          onOpenQuickStart={onOpenQuickStart}
          onResetExpiringFilter={onResetExpiringFilter}
          onRefresh={onRefresh}
        />
      )}

      {/* View Details Modal */}
      {selectedKit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Lab Kit Details</h2>
                <button
                  onClick={() => setSelectedKit(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Accession Number</label>
                    <p className="text-gray-100 font-medium">{selectedKit.accession_number}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Kit Name</label>
                    <p className="text-gray-100">{getKitTypeLabel(selectedKit)}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                    <span className={getStatusBadge(selectedKit.status)}>
                      {selectedKit.status.charAt(0).toUpperCase() + selectedKit.status.slice(1)}
                    </span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Visit Assignment</label>
                    <p className="text-gray-100">
                      {selectedKit.visit_schedules ? 
                        `${selectedKit.visit_schedules.visit_name} (${selectedKit.visit_schedules.visit_number})` 
                        : 'Unassigned'
                      }
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Subject</label>
                    <p className="text-gray-100">
                      {selectedKit.subject_assignment?.subject_number || selectedKit.subject_assignment?.subject_id || 'Unassigned'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Lot Number</label>
                    <p className="text-gray-100">{selectedKit.lot_number || 'N/A'}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Expiration Date</label>
                    <p className={`text-gray-100 ${isExpiringSoon(selectedKit.expiration_date) ? 'text-yellow-300' : ''}`}>
                      {formatDate(selectedKit.expiration_date)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Received Date</label>
                    <p className="text-gray-100">{formatDate(selectedKit.received_date)}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Created</label>
                    <p className="text-gray-100">{formatDate(selectedKit.created_at)}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Tracking Number</label>
                    <p className="text-gray-100">{selectedKit.latest_shipment?.airway_bill_number || 'N/A'}</p>
                    {selectedKit.latest_shipment?.tracking_status && (
                      <p className="text-xs text-gray-400 mt-1 capitalize">
                        Status: {selectedKit.latest_shipment.tracking_status.replace(/_/g, ' ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {selectedKit.notes && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Notes</label>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-gray-100">{selectedKit.notes}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-700 mt-6">
                <button
                  onClick={() => setSelectedKit(null)}
                  className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <BulkEditModal
          selectedKits={Array.from(selectedKits).map(id => filteredLabKits.find(kit => kit.id === id)!)}
          onClose={() => setShowBulkEditModal(false)}
          onSave={() => {
            setShowBulkEditModal(false)
            setSelectedKits(new Set())
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

interface BulkPendingShipmentModalProps {
  studyId: string
  selectedIds: string[]
  onClose: () => void
  onDone: () => void
}

function BulkPendingShipmentModal({ studyId, selectedIds, onClose, onDone }: BulkPendingShipmentModalProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<{ updated: number; invalid: Array<{ id?: string; accession_number?: string; reason: string }> } | null>(null)

  const parseAccessions = () => {
    const tokens = text
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
    return Array.from(new Set(tokens))
  }

  const submit = async () => {
    try {
      setSubmitting(true)
      setErrorMsg(null)
      setResult(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const accessionNumbers = parseAccessions()
      const resp = await fetch('/api/lab-kits/pending-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ studyId, labKitIds: selectedIds, accessionNumbers })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setErrorMsg(json.error || 'Failed to mark pending shipment')
        return
      }
      setResult(json)
    } catch {
      setErrorMsg('Failed to mark pending shipment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 border border-gray-700 rounded-2xl max-w-2xl w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Mark Pending Shipment</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
          </div>

          <div className="space-y-4">
            <p className="text-gray-300 text-sm">Selected kits: <span className="font-medium">{selectedIds.length}</span></p>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Paste accession numbers (optional)</label>
              <textarea
                rows={6}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="One per line, or separated by spaces/commas"
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {text && (
                <p className="text-xs text-gray-400 mt-1">Parsed: {parseAccessions().length}</p>
              )}
            </div>

            {errorMsg && (
              <div className="bg-red-900/20 border border-red-700 text-red-300 px-3 py-2 rounded">{errorMsg}</div>
            )}

            {result && (
              <div className="bg-gray-700/40 border border-gray-600 text-gray-100 px-3 py-2 rounded">
                <p>Updated: {result.updated}</p>
                {result.invalid?.length > 0 && (
                  <div className="mt-2 text-sm">
                    <p className="text-gray-300 mb-1">Invalid:</p>
                    <ul className="list-disc list-inside text-gray-300 max-h-40 overflow-auto">
                      {result.invalid.map((r, i) => (
                        <li key={i} className="font-mono">
                          {(r.accession_number || r.id || 'unknown')}: {r.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Close</button>
            {result ? (
              <button onClick={onDone} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">Done</button>
            ) : (
              <button onClick={submit} disabled={submitting} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50">
                {submitting ? 'Marking…' : 'Mark Pending'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Bulk Edit Modal Component
interface BulkEditModalProps {
  selectedKits: LabKitWithVisit[]
  onClose: () => void
  onSave: () => void
}

function BulkEditModal({ selectedKits, onClose, onSave }: BulkEditModalProps) {
  const [bulkData, setBulkData] = useState({
    kit_type_id: '',
    lot_number: '',
    expiration_date: '',
    status: '',
    notes: '',
    visit_schedule_id: ''
  })
  const [saving, setSaving] = useState(false)
  const [updateFields, setUpdateFields] = useState({
    kit_type_id: false,
    lot_number: false,
    expiration_date: false,
    status: false,
    notes: false,
    visit_schedule_id: false
  })
  const [visitSchedules, setVisitSchedules] = useState<Array<{id: string, visit_name: string, visit_number: string}>>([])
  const [loadingVisits, setLoadingVisits] = useState(true)
  const [kitTypes, setKitTypes] = useState<StudyKitType[]>([])
  const [kitTypesLoading, setKitTypesLoading] = useState(true)
  const [kitTypeError, setKitTypeError] = useState<string | null>(null)

  // Load visit schedules for the study
  useEffect(() => {
    const loadVisitSchedules = async () => {
      if (selectedKits.length === 0) return
      
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        
        if (!token) return

        const response = await fetch(`/api/visit-schedules?study_id=${selectedKits[0].study_id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })

        if (response.ok) {
          const data = await response.json()
          setVisitSchedules(data.visitSchedules || [])
        }
      } catch (error) {
        console.error('Error loading visit schedules:', error)
      } finally {
        setLoadingVisits(false)
      }
    }

    loadVisitSchedules()
  }, [selectedKits])

  useEffect(() => {
    const loadKitTypes = async () => {
      if (selectedKits.length === 0) return
      try {
        setKitTypesLoading(true)
        setKitTypeError(null)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return

        const response = await fetch(`/api/study-kit-types?study_id=${selectedKits[0].study_id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })

        if (response.ok) {
          const { kitTypes: serverKitTypes } = await response.json()
          setKitTypes(Array.isArray(serverKitTypes) ? serverKitTypes : [])
        } else {
          setKitTypes([])
          setKitTypeError('Failed to load kit types')
        }
      } catch (error) {
        console.error('Error loading study kit types:', error)
        setKitTypes([])
        setKitTypeError('Failed to load kit types')
      } finally {
        setKitTypesLoading(false)
      }
    }

    loadKitTypes()
  }, [selectedKits])

  const handleSave = async () => {
    try {
      setSaving(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      // Only send fields that are marked for update and have values
      const updateData: Partial<LabKit> & { kit_type?: string | null } = {}
      const kitTypeMap = new Map(kitTypes.map(type => [type.id, type]))
      Object.entries(updateFields).forEach(([field, shouldUpdate]) => {
        if (shouldUpdate) {
          const value = bulkData[field as keyof typeof bulkData]
          if (field === 'visit_schedule_id') {
            // Handle visit assignment specially - allow null/empty values
            ;(updateData as Record<string, any>)[field] = value === 'null' || value === '' ? null : value
          } else if (field === 'kit_type_id') {
            const nextId = value === 'null' || value === '' ? null : value
            ;(updateData as Record<string, any>).kit_type_id = nextId
            if (nextId) {
              updateData.kit_type = kitTypeMap.get(nextId)?.name ?? null
            } else {
              updateData.kit_type = null
            }
          } else if (value) {
            // For other fields, only include if they have a value
            ;(updateData as Record<string, any>)[field] = value
          }
        }
      })

      if (Object.keys(updateData).length === 0) {
        alert('Please select at least one field to update')
        return
      }

      // Update each selected kit
      for (const kit of selectedKits) {
        await fetch(`/api/lab-kits/${kit.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updateData)
        })
      }

      onSave()
    } catch (error) {
      console.error('Error bulk updating kits:', error)
      alert('Failed to update some lab kits')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-2xl max-w-2xl w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Bulk Edit Lab Kits</h2>
              <p className="text-gray-400 mt-1">Editing {selectedKits.length} lab kit(s)</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>

          {/* Form Fields */}
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <input
              type="checkbox"
              checked={updateFields.kit_type_id}
              onChange={(e) => setUpdateFields(prev => ({ ...prev, kit_type_id: e.target.checked }))}
              className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
            />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">Kit Type</label>
              <select
                value={bulkData.kit_type_id}
                onChange={(e) => setBulkData(prev => ({ ...prev, kit_type_id: e.target.value }))}
                disabled={!updateFields.kit_type_id || kitTypesLoading}
                className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">Select kit type…</option>
                <option value="null">Remove kit type</option>
                {kitTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}{!type.is_active ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
              {kitTypesLoading && (
                <p className="text-xs text-gray-400 mt-1">Loading kit types…</p>
              )}
              {kitTypeError && (
                <p className="text-xs text-red-400 mt-1">{kitTypeError}</p>
              )}
              {!kitTypesLoading && kitTypes.length === 0 && !kitTypeError && (
                <p className="text-xs text-yellow-400 mt-1">No catalog kit types defined for this study.</p>
              )}
            </div>
          </div>

            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={updateFields.lot_number}
                onChange={(e) => setUpdateFields(prev => ({ ...prev, lot_number: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">Lot Number</label>
                <input
                  type="text"
                  value={bulkData.lot_number}
                  onChange={(e) => setBulkData(prev => ({ ...prev, lot_number: e.target.value }))}
                  disabled={!updateFields.lot_number}
                  placeholder="e.g., LOT12345"
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={updateFields.expiration_date}
                onChange={(e) => setUpdateFields(prev => ({ ...prev, expiration_date: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">Expiration Date</label>
                <input
                  type="date"
                  value={bulkData.expiration_date}
                  onChange={(e) => setBulkData(prev => ({ ...prev, expiration_date: e.target.value }))}
                  disabled={!updateFields.expiration_date}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={updateFields.status}
                onChange={(e) => setUpdateFields(prev => ({ ...prev, status: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={bulkData.status}
                  onChange={(e) => setBulkData(prev => ({ ...prev, status: e.target.value }))}
                  disabled={!updateFields.status}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">Select Status...</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="used">Used</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={updateFields.visit_schedule_id}
                onChange={(e) => setUpdateFields(prev => ({ ...prev, visit_schedule_id: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">Visit Assignment</label>
                <select
                  value={bulkData.visit_schedule_id}
                  onChange={(e) => setBulkData(prev => ({ ...prev, visit_schedule_id: e.target.value }))}
                  disabled={!updateFields.visit_schedule_id || loadingVisits}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">Select Visit...</option>
                  <option value="null">Unassigned</option>
                  {visitSchedules.map(visit => (
                    <option key={visit.id} value={visit.id}>
                      {visit.visit_name} ({visit.visit_number})
                    </option>
                  ))}
                </select>
                {loadingVisits && (
                  <p className="text-sm text-gray-400 mt-1">Loading visit schedules...</p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={updateFields.notes}
                onChange={(e) => setUpdateFields(prev => ({ ...prev, notes: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                <textarea
                  value={bulkData.notes}
                  onChange={(e) => setBulkData(prev => ({ ...prev, notes: e.target.value }))}
                  disabled={!updateFields.notes}
                  placeholder="Add notes to all selected kits..."
                  rows={3}
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-700 mt-6">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {saving && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Empty State Handler Component
interface EmptyStateHandlerProps {
  labKits: LabKitWithVisit[]
  filteredLabKits: LabKitWithVisit[]
  searchTerm: string
  statusFilter: string
  showExpiringOnly?: boolean
  studyId: string
  onClearFilters: () => void
  onOpenAddKit?: () => void
  onOpenBulkImport?: () => void
  onOpenQuickStart?: () => void
  onResetExpiringFilter?: () => void
  onRefresh?: () => void
}

function EmptyStateHandler({
  labKits,
  filteredLabKits,
  searchTerm,
  statusFilter,
  showExpiringOnly,
  onClearFilters,
  onOpenAddKit,
  onOpenBulkImport,
  onOpenQuickStart,
  onResetExpiringFilter,
  onRefresh
}: EmptyStateHandlerProps) {
  // Determine which empty state to show
  const getEmptyStateType = () => {
    // If there are no kits at all in the study
    if (labKits.length === 0) {
      return EMPTY_STATE_TYPES.FIRST_TIME
    }

    // If showing expiring only filter and no results
    if (showExpiringOnly && filteredLabKits.length === 0) {
      return EMPTY_STATE_TYPES.NO_EXPIRING
    }

    // If there are filters/search active but no results
    if (filteredLabKits.length === 0 && (searchTerm || statusFilter !== 'all')) {
      return EMPTY_STATE_TYPES.FILTERED
    }

    // Default to filtered if we got here
    return EMPTY_STATE_TYPES.FILTERED
  }

  const emptyStateType = getEmptyStateType()

  // Build active filters list
  const activeFilters = []
  if (searchTerm) {
    activeFilters.push({ label: 'Search', value: searchTerm })
  }
  if (statusFilter !== 'all') {
    activeFilters.push({ label: 'Status', value: statusFilter })
  }
  if (showExpiringOnly) {
    activeFilters.push({ label: 'Filter', value: 'Expiring Soon' })
  }

  const handleAction = (actionType: string) => {
    switch (actionType) {
      case ACTION_TYPES.OPEN_ADD_KIT:
        onOpenAddKit?.()
        break
      case ACTION_TYPES.OPEN_QUICKSTART:
        if (onOpenQuickStart) {
          onOpenQuickStart()
        } else {
          window.open('/docs/lab-kit-coordinator-quickstart.md', '_blank')
        }
        break
      case ACTION_TYPES.OPEN_BULK_IMPORT:
        onOpenBulkImport?.()
        break
      case ACTION_TYPES.CLEAR_FILTERS:
      case ACTION_TYPES.RESET_FILTERS:
        onClearFilters()
        break
      case ACTION_TYPES.RESET_EXPIRING_FILTER:
        onResetExpiringFilter?.()
        break
      case ACTION_TYPES.REFRESH_FORECAST:
        onRefresh?.()
        break
      default:
        break
    }
  }

  return (
    <div className="p-12">
      <EmptyState
        type={emptyStateType}
        context={{
          activeFilters: activeFilters.length > 0 ? activeFilters : undefined
        }}
        onAction={handleAction}
      />
    </div>
  )
}
