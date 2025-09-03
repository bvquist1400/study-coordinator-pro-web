'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LabKit } from '@/types/database'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'

interface LabKitInventoryProps {
  studyId: string
  refreshKey?: number
  onRefresh: () => void
  showExpiringOnly?: boolean
}

interface LabKitWithVisit extends LabKit {
  visit_schedules?: {
    visit_name: string
    visit_number: number
  }
}

export default function LabKitInventory({ studyId, refreshKey, onRefresh, showExpiringOnly }: LabKitInventoryProps) {
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
  const [groupByVisit, setGroupByVisit] = useState(true)

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

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full"
    
    switch (status) {
      case 'available':
        return `${baseClasses} bg-green-900/50 text-green-300 border border-green-600`
      case 'assigned':
        return `${baseClasses} bg-blue-900/50 text-blue-300 border border-blue-600`
      case 'used':
        return `${baseClasses} bg-purple-900/50 text-purple-300 border border-purple-600`
      case 'shipped':
        return `${baseClasses} bg-yellow-900/50 text-yellow-300 border border-yellow-600`
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
    const matchesSearch = searchTerm === '' || 
      kit.accession_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kit.kit_type && kit.kit_type.toLowerCase().includes(searchTerm.toLowerCase()))
    
    // If showExpiringOnly is true, only show kits expiring within 30 days
    const matchesExpiring = !showExpiringOnly || (kit.expiration_date && isExpiringSoon(kit.expiration_date))
    
    return matchesStatus && matchesSearch && matchesExpiring
  })

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

      // Delete each selected kit
      for (const kitId of selectedKits) {
        await fetch(`/api/lab-kits/${kitId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      }

      setSelectedKits(new Set())
      onRefresh()
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

      // Archive each selected kit
      for (const kitId of selectedKits) {
        await fetch(`/api/lab-kits/${kitId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'archived' })
        })
      }

      setSelectedKits(new Set())
      onRefresh()
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
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by accession number or kit type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="used">Used</option>
              <option value="shipped">Shipped</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <button
              onClick={() => setGroupByVisit(!groupByVisit)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                groupByVisit
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700/50 hover:bg-gray-600 text-gray-300 border border-gray-600'
              }`}
            >
              {groupByVisit ? '📊 Grouped' : '📋 List'}
            </button>
          </div>
        </div>
      </div>

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
                          Accession Number
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Kit Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Visit Assignment
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Expiration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Received Date
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
                      {kit.kit_type || '-'}
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
                      {isExpiringSoon(kit.expiration_date) && (
                        <span className="ml-1 text-yellow-400">⚠️</span>
                      )}
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
          // Regular View
          <div className="overflow-x-auto">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Accession Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Kit Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Visit Assignment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Expiration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Received Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredLabKits.map((kit) => (
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
                        {kit.kit_type || '-'}
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadge(kit.status)}>
                        {kit.status.charAt(0).toUpperCase() + kit.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {kit.expiration_date ? (
                          <span className={isExpiringSoon(kit.expiration_date) ? 'text-red-400 font-semibold' : ''}>
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
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="p-12 text-center">
          <div className="text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No lab kits match your filters' : 'No lab kits found'}
            </p>
            <p className="text-sm">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search criteria'
                : 'Add lab kits to start managing inventory'
              }
            </p>
          </div>
        </div>
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
                    <p className="text-gray-100">{selectedKit.kit_type || 'N/A'}</p>
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
                      {isExpiringSoon(selectedKit.expiration_date) && (
                        <span className="ml-2 text-yellow-400">⚠️ Expiring Soon</span>
                      )}
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

// Bulk Edit Modal Component
interface BulkEditModalProps {
  selectedKits: LabKitWithVisit[]
  onClose: () => void
  onSave: () => void
}

function BulkEditModal({ selectedKits, onClose, onSave }: BulkEditModalProps) {
  const [bulkData, setBulkData] = useState({
    kit_type: '',
    lot_number: '',
    expiration_date: '',
    status: '',
    notes: '',
    visit_schedule_id: ''
  })
  const [saving, setSaving] = useState(false)
  const [updateFields, setUpdateFields] = useState({
    kit_type: false,
    lot_number: false,
    expiration_date: false,
    status: false,
    notes: false,
    visit_schedule_id: false
  })
  const [visitSchedules, setVisitSchedules] = useState<Array<{id: string, visit_name: string, visit_number: string}>>([])
  const [loadingVisits, setLoadingVisits] = useState(true)

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

  const handleSave = async () => {
    try {
      setSaving(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      // Only send fields that are marked for update and have values
      const updateData: Partial<LabKit> = {}
      Object.entries(updateFields).forEach(([field, shouldUpdate]) => {
        if (shouldUpdate) {
          const value = bulkData[field as keyof typeof bulkData]
          if (field === 'visit_schedule_id') {
            // Handle visit assignment specially - allow null/empty values
            ;(updateData as Record<string, any>)[field] = value === 'null' || value === '' ? null : value
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
                checked={updateFields.kit_type}
                onChange={(e) => setUpdateFields(prev => ({ ...prev, kit_type: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-600 rounded focus:ring-blue-500 bg-gray-700"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">Kit Name</label>
                <input
                  type="text"
                  value={bulkData.kit_type}
                  onChange={(e) => setBulkData(prev => ({ ...prev, kit_type: e.target.value }))}
                  disabled={!updateFields.kit_type}
                  placeholder="e.g., Visit 2 Week 4"
                  className="w-full bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
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
