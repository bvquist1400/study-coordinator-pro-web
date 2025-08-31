'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface InventoryForecast {
  visitName: string
  visitsScheduled: number
  kitsAvailable: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
  upcomingVisits: Array<{
    visit_date: string
    subject_number: string
  }>
}

interface ForecastSummary {
  totalVisitsScheduled: number
  criticalIssues: number
  warnings: number
  daysAhead: number
}

interface InventoryForecastProps {
  studyId: string
  daysAhead?: number
}

export default function InventoryForecast({ studyId, daysAhead = 30 }: InventoryForecastProps) {
  const [forecast, setForecast] = useState<InventoryForecast[]>([])
  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadForecast = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      const response = await fetch(`/api/inventory-forecast?study_id=${studyId}&days=${daysAhead}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setForecast(data.forecast || [])
        setSummary(data.summary || null)
      } else {
        console.error('Failed to fetch inventory forecast:', response.status)
      }
    } catch (error) {
      console.error('Error loading forecast:', error)
    } finally {
      setLoading(false)
    }
  }, [studyId, daysAhead])

  useEffect(() => {
    loadForecast()
  }, [loadForecast])

  const getStatusIcon = (status: 'ok' | 'warning' | 'critical') => {
    switch (status) {
      case 'critical':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'ok':
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStatusMessage = (forecast: InventoryForecast) => {
    if (forecast.deficit > 0) {
      return `${forecast.deficit} kit${forecast.deficit > 1 ? 's' : ''} short for upcoming visits`
    }
    if (forecast.kitsExpiringSoon > 0) {
      return `${forecast.kitsExpiringSoon} kit${forecast.kitsExpiringSoon > 1 ? 's' : ''} expiring soon`
    }
    if (forecast.kitsAvailable - forecast.visitsScheduled <= 2) {
      return `Low buffer: only ${forecast.kitsAvailable - forecast.visitsScheduled} extra kit${forecast.kitsAvailable - forecast.visitsScheduled > 1 ? 's' : ''}`
    }
    return `${forecast.kitsAvailable - forecast.visitsScheduled} extra kit${forecast.kitsAvailable - forecast.visitsScheduled > 1 ? 's' : ''} available`
  }

  const toggleExpanded = (visitName: string) => {
    const newExpanded = new Set(expanded)
    if (expanded.has(visitName)) {
      newExpanded.delete(visitName)
    } else {
      newExpanded.add(visitName)
    }
    setExpanded(newExpanded)
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Inventory Forecast</h3>
            <p className="text-gray-400 mt-1">Next {daysAhead} days supply analysis</p>
          </div>
          {summary && (
            <div className="text-right">
              <div className="text-sm text-gray-400">
                {summary.totalVisitsScheduled} visit{summary.totalVisitsScheduled !== 1 ? 's' : ''} scheduled
              </div>
              {summary.criticalIssues > 0 && (
                <div className="text-red-400 font-semibold">
                  {summary.criticalIssues} critical issue{summary.criticalIssues !== 1 ? 's' : ''}
                </div>
              )}
              {summary.warnings > 0 && (
                <div className="text-yellow-400">
                  {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forecast Items */}
      <div className="divide-y divide-gray-700">
        {forecast.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>No visits scheduled in the next {daysAhead} days</p>
          </div>
        ) : (
          forecast.map((item) => (
            <div key={item.visitName} className="p-6">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpanded(item.visitName)}
              >
                <div className="flex items-center space-x-4">
                  {getStatusIcon(item.status)}
                  <div>
                    <h4 className="text-lg font-semibold text-white">{item.visitName}</h4>
                    <p className="text-sm text-gray-400">{getStatusMessage(item)}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">
                      {item.visitsScheduled} visits / {item.kitsAvailable} kits
                    </div>
                    <div className="text-xs text-gray-400">
                      scheduled / available
                    </div>
                  </div>
                  
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expanded.has(item.visitName) ? 'rotate-180' : ''
                    }`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded Details */}
              {expanded.has(item.visitName) && item.upcomingVisits.length > 0 && (
                <div className="mt-4 ml-9 bg-gray-700/30 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-gray-300 mb-3">Upcoming Visits</h5>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {item.upcomingVisits.map((visit, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-300">{visit.subject_number}</span>
                        <span className="text-gray-400">
                          {new Date(visit.visit_date).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
