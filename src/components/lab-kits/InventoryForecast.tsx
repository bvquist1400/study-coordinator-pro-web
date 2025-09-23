'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDateUTC } from '@/lib/date-utils'

interface ForecastUpcomingVisit {
  visit_date: string
  subject_number: string | null
  visit_name: string | null
  quantity_required: number
}

interface ForecastRequirementBreakdown {
  requirementId: string
  visitScheduleId: string
  visitName: string
  visitNumber: number | string | null
  quantityPerVisit: number
  isOptional: boolean
  visitsScheduled: number
  kitsRequired: number
  upcomingVisits?: ForecastUpcomingVisit[]
}

interface ForecastPendingOrder {
  id: string
  quantity: number
  vendor: string | null
  expectedArrival: string | null
  status: 'pending' | 'received' | 'cancelled'
  isOverdue: boolean
  notes: string | null
  createdAt: string
  createdBy: string | null
  receivedDate: string | null
}

interface InventoryForecastItem {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  visitName: string
  optional: boolean
  visitsScheduled: number
  kitsRequired: number
  requiredWithBuffer: number
  kitsAvailable: number
  kitsExpiringSoon: number
  deficit: number
  status: 'ok' | 'warning' | 'critical'
  upcomingVisits: ForecastUpcomingVisit[]
  requirements: ForecastRequirementBreakdown[]
  originalDeficit: number
  pendingOrderQuantity: number
  pendingOrders: ForecastPendingOrder[]
  bufferKitsNeeded: number
}

interface ForecastSummary {
  totalVisitsScheduled: number
  criticalIssues: number
  warnings: number
  daysAhead: number
  baseWindowDays: number
  inventoryBufferDays: number
  visitWindowBufferDays: number
}

interface InventoryForecastProps {
  studyId: string
  daysAhead?: number
}

export default function InventoryForecast({ studyId, daysAhead = 30 }: InventoryForecastProps) {
  const [forecast, setForecast] = useState<InventoryForecastItem[]>([])
  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showOnlyIssues, setShowOnlyIssues] = useState(true)
  const [showAll, setShowAll] = useState(false)

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

  const getStatusMessage = (item: InventoryForecastItem) => {
    const outstanding = Math.max(0, item.deficit)
    const pending = item.pendingOrderQuantity ?? 0
    const original = Math.max(0, item.originalDeficit ?? outstanding)
    const totalTarget = item.requiredWithBuffer ?? item.kitsRequired
    const bufferGoal = item.bufferKitsNeeded ?? Math.max(0, totalTarget - item.kitsRequired)
    const slackAfterPending = item.kitsAvailable + pending - totalTarget
    const slackOnHand = item.kitsAvailable - totalTarget

    if (outstanding > 0) {
      if (pending > 0) {
        return `${outstanding} kit${outstanding === 1 ? '' : 's'} short after ordering ${pending} (target ${totalTarget}${bufferGoal > 0 ? ` incl. ${bufferGoal} buffer` : ''})`
      }
      return `${outstanding} kit${outstanding === 1 ? '' : 's'} short (target ${totalTarget}${bufferGoal > 0 ? ` incl. ${bufferGoal} buffer` : ''})`
    }

    if (original > 0 && pending > 0) {
      return `${pending} kit${pending === 1 ? '' : 's'} en route to satisfy buffer target (${totalTarget})`
    }

    if (item.kitsExpiringSoon > 0) {
      return `${item.kitsExpiringSoon} kit${item.kitsExpiringSoon === 1 ? '' : 's'} expiring soon`
    }

    if (bufferGoal > 0) {
      const extra = Math.max(0, slackAfterPending)
      if (extra <= 2) {
        return `Buffer goal ${bufferGoal}; ${extra} extra kit${extra === 1 ? '' : 's'} after buffer`
      }
      return `${extra} extra kit${extra === 1 ? '' : 's'} ready after ${bufferGoal}-kit buffer`
    }

    const buffer = slackOnHand
    if (buffer <= 2) {
      return `Low buffer: ${buffer} extra kit${buffer === 1 ? '' : 's'} ready`
    }
    return `${buffer} extra kit${buffer === 1 ? '' : 's'} ready`
  }

  const toggleExpanded = (key: string) => {
    const newExpanded = new Set(expanded)
    if (expanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
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

  const displayForecast = showOnlyIssues
    ? forecast.filter(f => f.status !== 'ok')
    : forecast

  const maxItems = 6
  const visible = showAll ? displayForecast : displayForecast.slice(0, maxItems)

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Inventory Forecast</h3>
            <p className="text-gray-400 mt-1">
              {summary
                ? `Next ${summary.daysAhead} days supply analysis${summary.visitWindowBufferDays > 0 ? ` (base ${summary.baseWindowDays} + ${summary.visitWindowBufferDays} buffer)` : ''}`
                : `Next ${daysAhead} days supply analysis`}
            </p>
            {summary && summary.inventoryBufferDays > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Inventory buffer target: {summary.inventoryBufferDays} day{summary.inventoryBufferDays === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-6">
            {/* Compact filter */}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={showOnlyIssues}
                onChange={(e) => setShowOnlyIssues(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              Only issues
            </label>
            {summary && (
              <div className="text-right">
                <div className="text-sm text-gray-400">
                  {summary.totalVisitsScheduled} visit{summary.totalVisitsScheduled !== 1 ? 's' : ''} scheduled
                </div>
                {(summary.inventoryBufferDays > 0 || summary.visitWindowBufferDays > 0) && (
                  <div className="text-xs text-gray-500">
                    Buffer: {summary.inventoryBufferDays}d inventory · {summary.visitWindowBufferDays}d window
                  </div>
                )}
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
      </div>

      {/* Forecast Items */}
      <div className="divide-y divide-gray-700">
        {displayForecast.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>{showOnlyIssues ? 'No issues detected' : `No visits scheduled in the next ${daysAhead} days`}</p>
          </div>
        ) : (
          visible.map((item) => {
            const pendingQty = item.pendingOrderQuantity ?? 0
            const hasPendingCoverage = pendingQty > 0 && item.deficit <= 0 && (item.originalDeficit ?? 0) > 0
            const lowBuffer = (item.kitsAvailable - item.kitsRequired)
            const lowBufferWithPending = pendingQty > 0 && lowBuffer <= 2
            const highlight = hasPendingCoverage || lowBufferWithPending

            return (
            <div
              key={item.key}
              className={`p-6 transition-colors ${
                highlight ? 'border-l-4 border-blue-400/70 bg-blue-500/10' : ''
              }`}
            >
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpanded(item.key)}
              >
                <div className="flex items-center space-x-4">
                  {getStatusIcon(item.status)}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-semibold text-white">{item.kitTypeName}</h4>
                      {item.optional && (
                        <span className="text-xs uppercase tracking-wide text-gray-300 bg-gray-700/60 px-2 py-0.5 rounded-full border border-gray-600">
                          Optional
                        </span>
                      )}
                      {highlight && (
                        <span className="text-[11px] uppercase tracking-wide text-blue-200 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-400/50">
                          Pending order {pendingQty > 0 ? `(${pendingQty})` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{getStatusMessage(item)}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">
                      {item.kitsAvailable} kits ready · need {item.kitsRequired}
                    </div>
                    <div className="text-xs text-gray-400">
                      {item.visitsScheduled} visit{item.visitsScheduled === 1 ? '' : 's'} scheduled
                    </div>
                  </div>
                  
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expanded.has(item.key) ? 'rotate-180' : ''
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
              {expanded.has(item.key) && (
                <div className="mt-4 ml-9 space-y-4">
                  <div className="bg-gray-700/30 rounded-lg p-4">
                    <h5 className="text-sm font-semibold text-gray-300 mb-3">Visit Requirements</h5>
                    <div className="space-y-2">
                      {item.requirements.map(req => (
                        <div key={req.requirementId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="text-gray-200">
                            {req.visitName}
                            {req.visitNumber !== null && (
                              <span className="text-gray-400">
                                {' '}
                                · {typeof req.visitNumber === 'number' ? `V${req.visitNumber}` : req.visitNumber}
                              </span>
                            )}
                            <span className="text-gray-400"> · {req.quantityPerVisit} kit{req.quantityPerVisit === 1 ? '' : 's'}/visit</span>
                            {req.isOptional && <span className="ml-2 text-xs text-gray-400">(optional)</span>}
                          </div>
                          <div className="text-xs text-gray-400">
                            {req.visitsScheduled} visit{req.visitsScheduled === 1 ? '' : 's'} · {req.kitsRequired} total
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {item.upcomingVisits.length > 0 && (
                    <div className="bg-gray-700/30 rounded-lg p-4">
                      <h5 className="text-sm font-semibold text-gray-300 mb-3">Upcoming Visits</h5>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {item.upcomingVisits.map((visit, index) => (
                          <div key={`${visit.visit_date}-${visit.subject_number ?? 'subject'}-${index}`} className="flex flex-wrap justify-between gap-2 text-sm">
                            <div className="text-gray-300">
                              {visit.subject_number || 'Subject'}
                              {visit.visit_name && <span className="text-gray-400"> · {visit.visit_name}</span>}
                            </div>
                            <div className="text-xs text-gray-400 flex items-center gap-3">
                              <span>{formatDateUTC(visit.visit_date)}</span>
                              <span>×{visit.quantity_required}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )})
        )}
        {displayForecast.length > maxItems && (
          <div className="p-4 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {showAll ? 'Show less' : `Show all ${displayForecast.length}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
