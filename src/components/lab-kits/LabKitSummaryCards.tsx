'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface LabKitSummaryCardsProps {
  studyId: string
  refreshKey?: number
  onFilterExpiring?: () => void
}

interface LabKitSummary {
  totalKits: number
  availableKits: number
  expiringSoon: number
  inTransit: number
}

export default function LabKitSummaryCards({ studyId, refreshKey, onFilterExpiring }: LabKitSummaryCardsProps) {
  const [summary, setSummary] = useState<LabKitSummary>({
    totalKits: 0,
    availableKits: 0,
    expiringSoon: 0,
    inTransit: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (studyId) {
      loadSummary()
    }
  }, [studyId, refreshKey])

  const loadSummary = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/lab-kits?studyId=${studyId}&summary=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        calculateSummary(data.labKits || [])
      } else {
        const err = await response.json().catch(() => ({}))
        console.error('Failed loading lab kit summary:', response.status, err)
        setSummary({
          totalKits: 0,
          availableKits: 0,
          expiringSoon: 0,
          inTransit: 0
        })
      }
    } catch (error) {
      console.error('Error loading lab kit summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateSummary = (labKits: any[]) => {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    
    let totalKits = labKits.length
    let availableKits = 0
    let expiringSoon = 0
    let inTransit = 0

    labKits.forEach(kit => {
      // Available kits
      if (kit.status === 'available') {
        availableKits++
      }

      // Expiring soon (within 30 days)
      if (kit.expiration_date) {
        const expirationDate = new Date(kit.expiration_date)
        if (expirationDate <= thirtyDaysFromNow && expirationDate >= now) {
          expiringSoon++
        }
      }

      // In transit (shipped status)
      if (kit.status === 'shipped') {
        inTransit++
      }
    })

    setSummary({
      totalKits,
      availableKits,
      expiringSoon,
      inTransit
    })
  }

  const cards = [
    {
      title: 'Total Lab Kits',
      value: summary.totalKits,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'bg-blue-900/50 text-blue-300 border-blue-600',
      bgColor: 'bg-blue-600/10'
    },
    {
      title: 'Available Kits',
      value: summary.availableKits,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      ),
      color: 'bg-green-900/50 text-green-300 border-green-600',
      bgColor: 'bg-green-600/10'
    },
    {
      title: 'Expiring <30 Days',
      value: summary.expiringSoon,
      onClick: onFilterExpiring,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: summary.expiringSoon > 0 
        ? 'bg-red-900/50 text-red-300 border-red-500'
        : 'bg-gray-900/50 text-gray-300 border-gray-600',
      bgColor: summary.expiringSoon > 0 
        ? 'bg-red-500/20'
        : 'bg-gray-600/10'
    },
    {
      title: 'In Transit',
      value: summary.inTransit,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      color: 'bg-purple-900/50 text-purple-300 border-purple-600',
      bgColor: 'bg-purple-600/10'
    }
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="h-24 bg-gray-700/50 rounded-lg"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`rounded-lg border p-6 ${card.color} ${card.bgColor} backdrop-blur-sm ${
            card.onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
          }`}
          onClick={card.onClick}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-75 mb-1">{card.title}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </div>
            <div className="opacity-75">
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}