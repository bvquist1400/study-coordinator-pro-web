'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { LabKit } from '@/types/database'

interface ExpiredKitsViewProps {
  studyId: string
  refreshKey?: number
  onRefresh: () => void
}

interface LabKitWithVisit extends LabKit {
  visit_schedule?: {
    visit_name: string
    visit_number: number
  }
}

export default function ExpiredKitsView({ studyId, refreshKey, onRefresh }: ExpiredKitsViewProps) {
  const [expiredKits, setExpiredKits] = useState<LabKitWithVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKits, setSelectedKits] = useState<Set<string>>(new Set())
  const [destroying, setDestroying] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    // Handle date-only strings (YYYY-MM-DD) by treating as local timezone
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number)
      const dt = new Date(year, month - 1, day) // month is 0-indexed
      return dt.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      })
    }
    // Handle full datetime strings
    const dt = new Date(dateString)
    return dt.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const loadExpiredKits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/lab-kits?studyId=${studyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        const kits = data.labKits || []
        
        // Auto-expire kits that have passed expiration date
        await autoExpireKits(kits, token)
        
        // Filter for expired and destroyed kits (excluding destroyed from main view)
        const expiredKits = kits.filter((kit: LabKitWithVisit) => 
          kit.status === 'expired' && kit.status !== 'destroyed'
        )
        setExpiredKits(expiredKits)
      }
    } catch (error) {
      console.error('Error loading expired kits:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId, refreshKey])

  useEffect(() => {
    loadExpiredKits()
  }, [loadExpiredKits])

  const autoExpireKits = async (kits: LabKitWithVisit[], token: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today
    
    const kitsToExpire = kits.filter((kit: LabKitWithVisit) => {
      if (!kit.expiration_date || kit.status === 'expired' || kit.status === 'destroyed') {
        return false
      }
      
      // Handle date-only strings (YYYY-MM-DD) by treating as local timezone
      let expDate: Date
      if (/^\d{4}-\d{2}-\d{2}$/.test(kit.expiration_date)) {
        const [year, month, day] = kit.expiration_date.split('-').map(Number)
        expDate = new Date(year, month - 1, day) // month is 0-indexed
      } else {
        expDate = new Date(kit.expiration_date)
      }
      
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
    if (selectedKits.size === filteredKits.length) {
      setSelectedKits(new Set())
    } else {
      setSelectedKits(new Set(filteredKits.map(kit => kit.id)))
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

  const handleMarkAsDestroyed = async () => {
    if (selectedKits.size === 0) {
      alert('Please select kits to mark as destroyed')
      return
    }

    const confirmMessage = `Are you sure you want to mark ${selectedKits.size} kit(s) as destroyed? This action cannot be undone.`
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setDestroying(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      // Update each selected kit to destroyed status
      for (const kitId of selectedKits) {
        await fetch(`/api/lab-kits/${kitId}`, {
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

  const isExpired = (expirationDate: string | null) => {
    if (!expirationDate) return false
    return new Date(expirationDate) < new Date()
  }

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

  const filteredKits = expiredKits.filter(kit => 
    searchTerm === '' || 
    kit.accession_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (kit.kit_type && kit.kit_type.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mr-3"></div>
          <span className="text-white">Loading expired kits...</span>
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
            <h2 className="text-xl font-semibold text-white">Expired Lab Kits</h2>
            <span className="text-sm text-gray-400">({filteredKits.length} kits)</span>
          </div>
          
          {selectedKits.size > 0 && (
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
            placeholder="Search expired kits..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 bg-gray-700/50 border border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {filteredKits.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-400 text-lg mb-2">No expired kits found</p>
          <p className="text-gray-500 text-sm">Expired kits will automatically appear here when their expiration date passes</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left py-3 px-2 w-12">
                  <input
                    type="checkbox"
                    checked={selectedKits.size === filteredKits.length && filteredKits.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-red-600 border-gray-600 rounded focus:ring-red-500 bg-gray-700"
                  />
                </th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Accession #</th>
                <th className="text-left text-sm font-medium text-gray-300 py-3 px-4">Kit Name</th>
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
                    <input
                      type="checkbox"
                      checked={selectedKits.has(kit.id)}
                      onChange={() => handleSelectKit(kit.id)}
                      className="w-4 h-4 text-red-600 border-gray-600 rounded focus:ring-red-500 bg-gray-700"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-100 font-medium">{kit.accession_number}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-gray-300">{kit.kit_type || 'N/A'}</span>
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
                    {kit.expiration_date ? (
                      <span className="text-red-400 font-semibold">
                        {getDaysExpired(kit.expiration_date)} days
                      </span>
                    ) : (
                      <span className="text-gray-500">N/A</span>
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
