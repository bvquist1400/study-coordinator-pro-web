import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Json } from '@/types/database'

export interface LabKitRecommendationItem {
  id: string
  studyId: string
  kitTypeId: string | null
  kitTypeName: string | null
  status: 'new' | 'accepted' | 'dismissed' | 'expired'
  recommendedQuantity: number
  reason: string
  windowStart: string | null
  windowEnd: string | null
  latestOrderDate: string | null
  confidence: number | null
  metadata: Json
  dismissedReason: string | null
  actedBy: {
    id: string
    fullName: string | null
    email: string | null
  } | null
  actedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LabKitRecommendationList {
  studyId: string
  recommendations: LabKitRecommendationItem[]
  counts: Record<'new' | 'accepted' | 'dismissed' | 'expired', number>
}

interface UseLabKitRecommendationsOptions {
  studyId: string | null
  statuses?: Array<'new' | 'accepted' | 'dismissed' | 'expired'>
}

interface UseLabKitRecommendationsResult {
  data: LabKitRecommendationList | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
  accept: (id: string, metadata?: Json) => Promise<LabKitRecommendationItem>
  dismiss: (id: string, reason: string, metadata?: Json) => Promise<LabKitRecommendationItem>
}

export function useLabKitRecommendations({ studyId, statuses }: UseLabKitRecommendationsOptions): UseLabKitRecommendationsResult {
  const [data, setData] = useState<LabKitRecommendationList | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const normalizedStatuses = useMemo(() => {
    if (!statuses || statuses.length === 0) return [] as Array<'new' | 'accepted' | 'dismissed' | 'expired'>
    const unique = Array.from(new Set(statuses.map((status) => status.toLowerCase() as typeof status)))
    return unique.filter((status): status is 'new' | 'accepted' | 'dismissed' | 'expired' =>
      status === 'new' || status === 'accepted' || status === 'dismissed' || status === 'expired'
    )
  }, [statuses])

  const refresh = useCallback(async () => {
    if (!studyId) {
      setData(null)
      setError(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const params = new URLSearchParams({ studyId })
      normalizedStatuses.forEach((status) => params.append('status', status))

      const response = await fetch(`/api/lab-kit-recommendations?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load lab kit recommendations.')
      }

      const payload = (await response.json()) as LabKitRecommendationList
      setData(payload)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load lab kit recommendations.')
      setError(error)
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [studyId, normalizedStatuses])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mutate = useCallback(
    async (payload: { id: string; action: 'accept' | 'dismiss'; reason?: string | null; metadata?: Json }) => {
      if (!studyId) {
        throw new Error('Select a study to manage recommendations.')
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const requestBody: Record<string, unknown> = {
        studyId,
        recommendationId: payload.id,
        action: payload.action
      }

      if (payload.reason) {
        requestBody.reason = payload.reason
      }
      if (payload.metadata !== undefined) {
        requestBody.metadata = payload.metadata
      }

      const response = await fetch('/api/lab-kit-recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to update recommendation.')
      }

      const updated = body as LabKitRecommendationItem

      // Refresh to keep counts accurate (simpler than manually updating derived totals)
      await refresh()

      return updated
    },
    [refresh, studyId]
  )

  const accept = useCallback(
    async (id: string, metadata?: Json) => {
      return mutate({ id, action: 'accept', metadata })
    },
    [mutate]
  )

  const dismiss = useCallback(
    async (id: string, reason: string, metadata?: Json) => {
      return mutate({ id, action: 'dismiss', reason, metadata })
    },
    [mutate]
  )

  return {
    data,
    isLoading,
    error,
    refresh,
    accept,
    dismiss
  }
}
