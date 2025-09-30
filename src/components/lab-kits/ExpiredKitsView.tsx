'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LabKit } from '@/types/database'
import { formatDateUTC, parseDateUTC } from '@/lib/date-utils'
import EmptyState from './EmptyState'
import { EMPTY_STATE_TYPES, ACTION_TYPES } from '@/lib/lab-kits/empty-states'

type ArchiveStatusFilter = 'expired' | 'destroyed' | 'archived' | 'all'

interface ExpiredKitsViewProps {
  studyId: string
  refreshKey?: number
  onRefresh: () => void
  statusFilter?: ArchiveStatusFilter
  onNavigateToInventory?: () => void
}

interface LabKitWithVisit extends LabKit {
  visit_schedule?: {
    visit_name: string
    visit_number: number
  }
}

export default function ExpiredKitsView({ studyId, refreshKey, onRefresh, statusFilter = 'expired', onNavigateToInventory }: ExpiredKitsViewProps) {
  const [archiveKits, setArchiveKits] = useState<LabKitWithVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKits, setSelectedKits] = useState<Set<string>>(new Set())
  const [destroying, setDestroying] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const statusLabelMap: Record<ArchiveStatusFilter, string> = {
    expired: 'Expired',
    destroyed: 'Destroyed',
    archived: 'Archived',
    all: 'Archived'
  }

  const sectionTitle = `${statusLabelMap[statusFilter]} Lab Kits`
  const sectionDescription = statusFilter === 'all'
    ? 'Expired, destroyed, and archived lab kits'
    : `${statusLabelMap[statusFilter]} lab kits for this study`
  const searchPlaceholder = `Search ${statusFilter === 'all' ? 'archived' : statusFilter} kits...`

  const formatDate = (dateString: string | null) => (dateString ? formatDateUTC(dateString, 'en-US') : '-')

  const loadExpiredKits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const statuses = statusFilter === 'all' ? ['expired', 'destroyed', 'archived'] : [statusFilter]
      const statusQuery = statuses.length === 1 ? `&status=${statuses[0]}` : ''
      const response = await fetch(`/api/lab-kits?studyId=${studyId}${statusQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        const kits = data.labKits || []
        
        // Auto-expire kits that have passed expiration date
        if (statuses.includes('expired')) {
          await autoExpireKits(kits, token)
        }

        const filtered = kits.filter((kit: LabKitWithVisit) => statuses.includes(kit.status as any))
        setArchiveKits(filtered)
      }
    } catch (error) {
      console.error('Error loading expired kits:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId, statusFilter])

  useEffect(() => {
    loadExpiredKits()
  }, [refreshKey, loadExpiredKits])

  useEffect(() => {
    setSelectedKits(new Set())
  }, [statusFilter])

  const autoExpireKits = async (kits: LabKitWithVisit[], token: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today
    
    const kitsToExpire = kits.filter((kit: LabKitWithVisit) => {
      if (!kit.expiration_date || kit.status === 'expired' || kit.status === 'destroyed') {
        return false
      }
      
      // Parse expiration date safely (UTC for date-only)
      const expDate = (parseDateUTC(kit.expiration_date) || new Date(kit.expiration_date)) as Date
      
      return expDate < today // Kit expires before today (is already expired)
    })

    if (kitsToExpire.length > 0) {
      // Update status to expired for kits past expiration date
      for (const kit of kitsToExpire) {
        await fetch(`/api/lab-kits/${kit.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'expired' })
        })
      }
    }
  }

  const handleSelectAll = () => {
    if (!allowDestroy) return
    if (selectedKits.size === selectableKits.length) {
      setSelectedKits(new Set())
    } else {
      setSelectedKits(new Set(selectableKits.map(kit => kit.id)))
    }
  }

  const handleSelectKit = (kitId: string) => {
    if (!allowDestroy) return
    const target = selectableKits.find(kit => kit.id === kitId)
    if (!target) return
    const newSelected = new Set(selectedKits)
    if (newSelected.has(kitId)) {
      newSelected.delete(kitId)
    } else {
      newSelected.add(kitId)
    }
    setSelectedKits(newSelected)
  }

  const handleMarkAsDestroyed = async () => {
    const expiredSelection = archiveKits.filter(kit => kit.status === 'expired' && selectedKits.has(kit.id))

    if (expiredSelection.length === 0) {
      alert('Please select kits to mark as destroyed')
      return
    }

    const confirmMessage = `Are you sure you want to mark ${expiredSelection.length} kit(s) as destroyed? This action cannot be undone.`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setDestroying(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      // Update each selected kit to destroyed status
      for (const kit of expiredSelection) {
        await fetch(`/api/lab-kits/${kit.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'destroyed' })
        })
      }

      // Clear selections and refresh
      setSelectedKits(new Set())
      onRefresh()
    } catch (error) {
      console.error('Error marking kits as destroyed:', error)
      alert('Failed to mark kits as destroyed')
    } finally {
      setDestroying(false)
    }
  }

  // Removed unused isExpired function

  const getDaysExpired = (expirationDate: string | null) => {
    if (!expirationDate) return 0
    
    // Handle date-only strings (YYYY-MM-DD) by treating as local timezone
    let expDate: Date
    if (/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      const [year, month, day] = expirationDate.split('-').map(Number)
      expDate = new Date(year, month - 1, day) // month is 0-indexed
    } else {
      expDate = new Date(expirationDate)
    }
    
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today
    
    const diffTime = today.getTime() - expDate.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const filteredKits = archiveKits.filter(kit => 
    searchTerm === '' || 
    kit.accession_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (kit.kit_type && kit.kit_type.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const selectableKits = filteredKits.filter(kit => kit.status === 'expired')
  const allowDestroy = (statusFilter === 'expired' || statusFilter === 'all') && selectableKits.length > 0

  useEffect(() => {
    setSelectedKits(prev => {
      const next = new Set([...prev].filter(id => selectableKits.some(kit => kit.id === id)))
      return next.size === prev.size ? prev : next
    })
  }, [selectableKits])

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mr-3"></div>
          <span className="text-white">Loading {sectionTitle.toLowerCase()}...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-white">{sectionTitle}</h2>
            <span className="text-sm text-gray-400">({filteredKits.length} kits)</span>
          </div>
          
          {allowDestroy && selectedKits.size > 0 && (
            <button
              onClick={handleMarkAsDestroyed}
              disabled={destroying}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {destroying && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              <span>{destroying ? 'Destroying...' : `Mark ${selectedKits.size} as Destroyed`}</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-4">{sectionDescription}</p>

      {filteredKits.length === 0 ? (
        <div className="p-6">
          <EmptyState
            type={statusFilter === 'expired' ? EMPTY_STATE_TYPES.NO_EXPIRED : EMPTY_STATE_TYPES.NO_ARCHIVE}
            onAction={(actionType) => {
              if (actionType === ACTION_TYPES.GO_INVENTORY) {
                onNavigateToInventory?.()
              }
            }}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-600">
                {allowDestroy ? (
                  <th className="text-left py-3 px-2 w-12">
                    <input
                      type="checkbox"
                      checked={selectableKits.length > 0 && selectedKits.size === selectableKits.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-red-600 border-gray-600 rounded focus:ring-red-500 bg-gray-700"
                    />
                  </th>
                ) : (
                  <th className="py-3 px-2 w-12"></th>
                )}
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Accession #</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Kit Name</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Status</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Lot Number</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Expiration Date</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Days Expired</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Visit Assignment</th>
              </tr>
            </thead>
            <tbody>
              {filteredKits.map((kit) => (
                <tr 
                  key={kit.id} 
                  className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                    selectedKits.has(kit.id) ? 'bg-red-900/20' : ''
                  }`}
                >
                  <td className="py-3 px-2">
                    {allowDestroy && kit.status === 'expired' ? (
                      <input
                        type="checkbox"
                        checked={selectedKits.has(kit.id)}
                        onChange={() => handleSelectKit(kit.id)}
                        className="w-4 h-4 text-red-600 border-gray-600 rounded focus:ring-red-500 bg-gray-700"
                      />
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-100 font-medium">{kit.accession_number}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300">{kit.kit_type || 'N/A'}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300 capitalize">{kit.status}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300">{kit.lot_number || 'N/A'}</span>
                  </td>
                  <td className="py-3 px-4">
                    {kit.expiration_date ? (
                      <span className="text-red-400 font-medium">
                        {formatDate(kit.expiration_date)}
                      </span>
                    ) : (
                      <span className="text-gray-500">N/A</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {kit.expiration_date && kit.status === 'expired' ? (
                      <span className="text-red-400 font-semibold">
                        {getDaysExpired(kit.expiration_date)} days
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {kit.visit_schedule ? (
                      <span className="text-gray-300">{kit.visit_schedule.visit_name}</span>
                    ) : (
                      <span className="text-gray-500">Unassigned</span>
                    )}
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
