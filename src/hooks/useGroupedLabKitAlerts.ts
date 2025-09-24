'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface SupplyDeficitAlert {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  deficit: number
  originalDeficit: number
  pendingOrderQuantity: number
  pendingOrders: Array<{
    id: string
    quantity: number
    vendor: string | null
    expectedArrival: string | null
    status: string
    isOverdue: boolean
    createdAt: string
  }>
  kitsAvailable: number
  kitsRequired: number
  requiredWithBuffer: number
  bufferKitsNeeded: number
  optional: boolean
  status: string
}

export interface KitStatusAlert {
  id: string
  accessionNumber: string | null
  kitTypeId: string | null
  kitTypeName: string | null
  status: string
  expirationDate: string | null
  updatedAt: string | null
  createdAt: string | null
  daysInStatus: number | null
  daysUntilExpiration: number | null
}

export interface LowBufferAlert {
  key: string
  kitTypeId: string | null
  kitTypeName: string
  buffer: number
  kitsAvailable: number
  kitsRequired: number
  requiredWithBuffer: number
  pendingOrderQuantity: number
  bufferKitsNeeded: number
  status: string
}

export interface GroupMeta<T> {
  severity: AlertSeverity
  total: number
  items: T[]
  hasMore: boolean
  active?: number
}

export interface GroupedLabKitAlertsResponse {
  summary: {
    total: number
    bySeverity: Record<AlertSeverity, number>
  }
  groups: {
    supplyDeficit: GroupMeta<SupplyDeficitAlert> & { active: number }
    expiringSoon: GroupMeta<KitStatusAlert>
    pendingShipment: GroupMeta<KitStatusAlert>
    shippedWithoutDelivery: GroupMeta<KitStatusAlert>
    lowBuffer: GroupMeta<LowBufferAlert>
    expired: GroupMeta<KitStatusAlert>
  }
  meta: {
    limit: number
    daysAhead: number
    expiringDays: number
    pendingAgingDays: number
    shippedAgingDays: number
  }
  forecastSummary: {
    totalVisitsScheduled: number
    criticalIssues: number
    warnings: number
    daysAhead: number
    baseWindowDays: number
    inventoryBufferDays: number
    visitWindowBufferDays: number
  }
}

interface UseGroupedAlertsOptions {
  studyId: string | null
  limit?: number
  daysAhead?: number
  expiringDays?: number
  pendingAgingDays?: number
  shippedAgingDays?: number
}

export function useGroupedLabKitAlerts({
  studyId,
  limit,
  daysAhead,
  expiringDays,
  pendingAgingDays,
  shippedAgingDays
}: UseGroupedAlertsOptions) {
  const params = useMemo(() => {
    const query: Record<string, string> = {}
    if (limit !== undefined) query.limit = String(limit)
    if (daysAhead !== undefined) query.days = String(daysAhead)
    if (expiringDays !== undefined) query.expiringDays = String(expiringDays)
    if (pendingAgingDays !== undefined) query.pendingAgingDays = String(pendingAgingDays)
    if (shippedAgingDays !== undefined) query.shippedAgingDays = String(shippedAgingDays)
    return query
  }, [limit, daysAhead, expiringDays, pendingAgingDays, shippedAgingDays])

  const [data, setData] = useState<GroupedLabKitAlertsResponse | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!studyId) {
        setData(undefined)
        setError(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        if (!token) {
          throw new Error('Authentication required')
        }

        const search = new URLSearchParams({ ...params, studyId })
        const response = await fetch(`/api/lab-kits/forecast-alerts?${search.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to load grouped lab kit alerts')
        }

        const payload: GroupedLabKitAlertsResponse = await response.json()
        if (!cancelled) {
          setData(payload)
        }
      } catch (err) {
        if (!cancelled) {
          setData(undefined)
          setError(err instanceof Error ? err : new Error('Failed to load grouped lab kit alerts'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => { cancelled = true }
  }, [studyId, params, refreshToken])

  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1)
  }, [])

  return {
    data,
    error,
    isLoading,
    refresh
  }
}

export type UseGroupedLabKitAlertsReturn = ReturnType<typeof useGroupedLabKitAlerts>
