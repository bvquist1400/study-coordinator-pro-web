'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { Study } from '@/types/database'

interface InventoryAlert {
  studyId: string
  studyName: string
  criticalIssues: number
  warnings: number
  totalVisits: number
}

interface SuggestedOrder {
  studyId: string
  studyName: string
  kitTypeId: string | null
  kitTypeName: string
  quantity: number
  deliveryDays: number
  riskLevel: 'high' | 'medium' | 'low'
  riskScore: number
  primaryFactor?: string | null
}

export default function InventoryAlerts() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [suggestedOrders, setSuggestedOrders] = useState<SuggestedOrder[]>([])
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
      type ForecastItem = {
        status: 'critical' | 'warning' | string
        recommendedOrderQty?: number
        kitTypeName?: string
        kitTypeId?: string | null
        deliveryDaysApplied?: number
        riskLevel?: 'high' | 'medium' | 'low'
        riskScore?: number
        riskFactors?: Array<{ detail?: string | null; type?: string | null }>
      }

      const alertPromises = (studies as Study[]).map(async (study) => {
        try {
          const forecastResponse = await fetch(`/api/inventory-forecast?study_id=${study.id}&days=30`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })

          if (!forecastResponse.ok) {
            return { alert: null as InventoryAlert | null, suggested: [] as SuggestedOrder[] }
          }

          const { forecast, summary } = await forecastResponse.json()
          
          const criticalIssues = (forecast as ForecastItem[] | undefined)?.filter((f) => f.status === 'critical').length || 0
          const warnings = (forecast as ForecastItem[] | undefined)?.filter((f) => f.status === 'warning').length || 0

          const studyName = `${study.protocol_number} - ${study.study_title}`

          const suggested: SuggestedOrder[] = (forecast as ForecastItem[] | undefined)
            ?.filter(item => (item.recommendedOrderQty ?? 0) > 0)
            .map(item => ({
              studyId: study.id,
              studyName,
              kitTypeId: item.kitTypeId ?? null,
              kitTypeName: item.kitTypeName || 'Unknown kit',
              quantity: Math.max(0, Math.round(item.recommendedOrderQty || 0)),
              deliveryDays: Math.max(0, Math.round(item.deliveryDaysApplied || 0)),
              riskLevel: (item.riskLevel === 'high' || item.riskLevel === 'medium') ? item.riskLevel : 'low',
              riskScore: item.riskScore ?? 0,
              primaryFactor: item.riskFactors?.[0]?.detail || item.riskFactors?.[0]?.type || null
            })) ?? []

          const alert: InventoryAlert | null = (criticalIssues > 0 || warnings > 0)
            ? {
                studyId: study.id,
                studyName,
                criticalIssues,
                warnings,
                totalVisits: summary?.totalVisitsScheduled || 0
              }
            : null

          return { alert, suggested }
        } catch (error) {
          console.error(`Error fetching forecast for study ${study.id}:`, error)
          return { alert: null as InventoryAlert | null, suggested: [] as SuggestedOrder[] }
        }
      })

      const results = await Promise.all(alertPromises)
      const validAlerts: InventoryAlert[] = []
      const aggregatedSuggestions: SuggestedOrder[] = []

      results.forEach(result => {
        if (result.alert) {
          validAlerts.push(result.alert)
        }
        aggregatedSuggestions.push(...result.suggested)
      })
      
      // Sort by critical issues first, then warnings
      validAlerts.sort((a, b) => {
        if (a.criticalIssues !== b.criticalIssues) {
          return b.criticalIssues - a.criticalIssues
        }
        return b.warnings - a.warnings
      })

      aggregatedSuggestions.sort((a, b) => {
        const rank = (level: SuggestedOrder['riskLevel']) => (level === 'high' ? 0 : level === 'medium' ? 1 : 2)
        const levelDiff = rank(a.riskLevel) - rank(b.riskLevel)
        if (levelDiff !== 0) return levelDiff
        if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore
        return b.quantity - a.quantity
      })

      setAlerts(validAlerts)
      setSuggestedOrders(aggregatedSuggestions)
    } catch (error) {
      console.error('Error loading inventory alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = (studyId: string) => {
    router.push(`/lab-kits?studyId=${studyId}`)
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
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 space-y-8">
      <div className="flex items-center justify-between">
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm uppercase tracking-wide text-gray-300">Active Issues</h4>
          {alerts.length > 0 && (
            <span className="text-xs text-gray-400">{alerts.length} studies</span>
          )}
        </div>
        {alerts.length === 0 ? (
          <div className="text-center py-6 rounded-lg border border-gray-700/60 bg-gray-700/20">
            <p className="text-sm text-gray-400">No critical or warning states</p>
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

      <div className="pt-4 border-t border-gray-700/60">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm uppercase tracking-wide text-gray-300">Suggested Orders</h4>
          {suggestedOrders.length > 0 && (
            <span className="text-xs text-purple-200/80">
              {suggestedOrders.length} kit type{suggestedOrders.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {suggestedOrders.length === 0 ? (
          <div className="text-center py-6 rounded-lg border border-purple-500/20 bg-purple-500/5">
            <p className="text-sm text-purple-200/70">No recommendations at this time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestedOrders.slice(0, 3).map((item, index) => (
              <div key={`${item.studyId}-${item.kitTypeId ?? index}`} className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">{item.kitTypeName}</div>
                    <div className="text-xs text-purple-200/80">{item.studyName}</div>
                    {item.primaryFactor && (
                      <div className="text-xs text-purple-200/60">
                        {item.primaryFactor}
                      </div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-sm font-semibold text-purple-100">Order {item.quantity}</div>
                    {item.deliveryDays > 0 && (
                      <div className="text-[10px] uppercase tracking-wide text-purple-200/70">
                        Delivery {item.deliveryDays}d
                      </div>
                    )}
                    <div className="text-[10px] uppercase tracking-wide text-purple-200/80">
                      {item.riskLevel === 'high' ? 'High priority' : item.riskLevel === 'medium' ? 'Monitor closely' : 'Low priority'}
                    </div>
                    <button
                      onClick={() => handleViewDetails(item.studyId)}
                      className="block w-full rounded border border-purple-400/60 px-3 py-1 text-[11px] font-semibold text-purple-200 hover:border-purple-300 hover:text-purple-100"
                    >
                      Open inventory
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {suggestedOrders.length > 3 && (
              <button
                onClick={handleViewAllInventory}
                className="w-full text-center py-2 text-sm text-purple-200 hover:text-purple-100 transition-colors"
              >
                View all suggestions →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
