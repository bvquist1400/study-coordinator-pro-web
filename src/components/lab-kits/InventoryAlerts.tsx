'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface InventoryAlert {
  studyId: string
  studyName: string
  criticalIssues: number
  warnings: number
  totalVisits: number
}

export default function InventoryAlerts() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadInventoryAlerts()
  }, [])

  const loadInventoryAlerts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) return

      // Get all studies
      const studiesResponse = await fetch('/api/studies', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!studiesResponse.ok) return

      const { studies } = await studiesResponse.json()
      
      if (!studies || studies.length === 0) {
        setAlerts([])
        setLoading(false)
        return
      }

      // Get forecasts for all studies
      const alertPromises = studies.map(async (study: any) => {
        try {
          const forecastResponse = await fetch(`/api/inventory-forecast?study_id=${study.id}&days=30`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })

          if (!forecastResponse.ok) return null

          const { forecast, summary } = await forecastResponse.json()
          
          const criticalIssues = forecast?.filter((f: any) => f.status === 'critical').length || 0
          const warnings = forecast?.filter((f: any) => f.status === 'warning').length || 0

          if (criticalIssues > 0 || warnings > 0) {
            return {
              studyId: study.id,
              studyName: `${study.protocol_number} - ${study.study_title}`,
              criticalIssues,
              warnings,
              totalVisits: summary?.totalVisitsScheduled || 0
            }
          }
          return null
        } catch (error) {
          console.error(`Error fetching forecast for study ${study.id}:`, error)
          return null
        }
      })

      const results = await Promise.all(alertPromises)
      const validAlerts = results.filter((alert): alert is InventoryAlert => alert !== null)
      
      // Sort by critical issues first, then warnings
      validAlerts.sort((a, b) => {
        if (a.criticalIssues !== b.criticalIssues) {
          return b.criticalIssues - a.criticalIssues
        }
        return b.warnings - a.warnings
      })

      setAlerts(validAlerts)
    } catch (error) {
      console.error('Error loading inventory alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = (studyId: string) => {
    router.push(`/lab-kits?study=${studyId}`)
  }

  const handleViewAllInventory = () => {
    router.push('/lab-kits')
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Lab Kit Inventory</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Lab Kit Inventory</h3>
          <p className="text-sm text-gray-400">Supply status across all studies</p>
        </div>
        <button
          onClick={handleViewAllInventory}
          className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
        >
          View All →
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-green-400 font-semibold">All Clear</p>
          <p className="text-gray-400 text-sm">No inventory issues detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.slice(0, 3).map((alert) => (
            <div
              key={alert.studyId}
              onClick={() => handleViewDetails(alert.studyId)}
              className="bg-gray-700/30 rounded-lg p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-white truncate">
                    {alert.studyName}
                  </div>
                  <div className="flex items-center space-x-4 mt-1">
                    {alert.criticalIssues > 0 && (
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        <span className="text-xs text-red-400">
                          {alert.criticalIssues} critical
                        </span>
                      </div>
                    )}
                    {alert.warnings > 0 && (
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                        <span className="text-xs text-yellow-400">
                          {alert.warnings} warning{alert.warnings > 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-gray-400">
                      {alert.totalVisits} upcoming visits
                    </span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
          
          {alerts.length > 3 && (
            <button
              onClick={handleViewAllInventory}
              className="w-full text-center py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              View {alerts.length - 3} more alert{alerts.length - 3 > 1 ? 's' : ''} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}