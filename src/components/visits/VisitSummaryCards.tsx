'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { SubjectVisit } from '@/types/database'

interface VisitSummaryCardsProps {
  studyId: string
  refreshKey?: number
}

interface VisitSummary {
  upcomingThisWeek: number
  overdueVisits: number
  completedToday: number
  complianceRate: number
}

export default function VisitSummaryCards({ studyId, refreshKey }: VisitSummaryCardsProps) {
  const [summary, setSummary] = useState<VisitSummary>({
    upcomingThisWeek: 0,
    overdueVisits: 0,
    completedToday: 0,
    complianceRate: 0
  })
  const [loading, setLoading] = useState(true)

  const loadSummary = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/subject-visits?study_id=${studyId}&summary=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        calculateSummary(data.subjectVisits || [])
      } else {
        const err = await response.json().catch(() => ({}))
        console.error('Failed loading visit summary:', response.status, err)
        calculateSummary([])
      }
    } catch (error) {
      console.error('Error loading visit summary:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId, refreshKey])

  useEffect(() => {
    if (studyId) {
      loadSummary()
    }
  }, [studyId, loadSummary])

  const calculateSummary = (visits: SubjectVisit[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    let upcomingThisWeek = 0
    let overdueVisits = 0
    let completedToday = 0
    const totalVisits = visits.length
    let compliantVisits = 0

    visits.forEach(visit => {
      // Parse visit_date as local date when the string is date-only
      const vdPart = (visit.visit_date || '').split('T')[0]
      const scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(vdPart)
        ? (() => { const [y, m, d] = vdPart.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) })()
        : new Date(visit.visit_date || '')

      // Upcoming this week (scheduled between now and 7 days from now)
      if (visit.status === 'scheduled' && scheduledDate >= today && scheduledDate <= weekFromNow) {
        upcomingThisWeek++
      }

      // Overdue visits (scheduled before today and not completed)
      if (visit.status === 'scheduled' && scheduledDate < today) {
        overdueVisits++
      }

      // Completed today (without actual_date, use visit_date as proxy)
      if (visit.status === 'completed') {
        const completionDate = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate())
        if (completionDate.getTime() === today.getTime()) {
          completedToday++
        }
      }

      // Visit window compliance
      if (visit.status === 'completed' && visit.is_within_window) {
        compliantVisits++
      }
    })

    const complianceRate = totalVisits > 0 ? Math.round((compliantVisits / totalVisits) * 100) : 0

    setSummary({
      upcomingThisWeek,
      overdueVisits,
      completedToday,
      complianceRate
    })
  }

  const cards = [
    {
      title: 'Upcoming This Week',
      value: summary.upcomingThisWeek,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4l6 6m0-6l-6 6" />
        </svg>
      ),
      color: 'bg-blue-900/50 text-blue-300 border-blue-600',
      bgColor: 'bg-blue-600/10'
    },
    {
      title: 'Overdue Visits',
      value: summary.overdueVisits,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-red-900/50 text-red-300 border-red-600',
      bgColor: 'bg-red-600/10'
    },
    {
      title: 'Completed Today',
      value: summary.completedToday,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-green-900/50 text-green-300 border-green-600',
      bgColor: 'bg-green-600/10'
    },
    {
      title: 'Compliance Rate',
      value: `${summary.complianceRate}%`,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: summary.complianceRate >= 80 
        ? 'bg-green-900/50 text-green-300 border-green-600' 
        : summary.complianceRate >= 60
        ? 'bg-yellow-900/50 text-yellow-300 border-yellow-600'
        : 'bg-red-900/50 text-red-300 border-red-600',
      bgColor: summary.complianceRate >= 80 
        ? 'bg-green-600/10' 
        : summary.complianceRate >= 60
        ? 'bg-yellow-600/10'
        : 'bg-red-600/10'
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
          className={`rounded-lg border p-6 ${card.color} ${card.bgColor} backdrop-blur-sm`}
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
