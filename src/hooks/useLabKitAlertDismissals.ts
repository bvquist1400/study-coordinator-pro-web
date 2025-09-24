'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface DismissalRecord {
  id: string
  alertHash: string
  dismissedAt: string
  expiresAt: string
  metadata: Record<string, unknown>
}

export function useLabKitAlertDismissals(studyId: string | null) {
  const [dismissals, setDismissals] = useState<DismissalRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!studyId) {
        setDismissals([])
        setIsLoading(false)
        setError(null)
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

        const response = await fetch(`/api/lab-kits/alerts/dismissals?studyId=${studyId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body?.error || 'Failed to load lab kit alert dismissals')
        }

        const payload = await response.json()
        if (!cancelled) {
          setDismissals(payload.dismissals ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setDismissals([])
          setError(err instanceof Error ? err : new Error('Failed to load lab kit alert dismissals'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => { cancelled = true }
  }, [studyId, refreshToken])

  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1)
  }, [])

  const dismissedHashes = useMemo(() => new Set(dismissals.map((item) => item.alertHash)), [dismissals])

  const dismiss = useCallback(async (alertHash: string, options?: { ttlDays?: number; metadata?: Record<string, unknown> }) => {
    if (!studyId || !alertHash) return

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/lab-kits/alerts/dismissals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        studyId,
        alertHash,
        ttlDays: options?.ttlDays,
        metadata: options?.metadata
      })
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.error || 'Failed to dismiss alert group')
    }

    const result = await response.json().catch(() => ({ dismissal: null }))

    setDismissals((current) => {
      if (!result?.dismissal) return current
      const next = [...current]
      const existingIndex = next.findIndex((item) => item.alertHash === alertHash)
      if (existingIndex >= 0) {
        next[existingIndex] = result.dismissal
      } else {
        next.unshift(result.dismissal)
      }
      return next
    })
  }, [studyId])

  const restore = useCallback(async (alertHashes?: string[]) => {
    if (!studyId) return

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    if (!token) {
      throw new Error('Authentication required')
    }

    const response = await fetch('/api/lab-kits/alerts/dismissals', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        studyId,
        alertHashes: Array.isArray(alertHashes) && alertHashes.length > 0 ? alertHashes : undefined
      })
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.error || 'Failed to restore dismissed alerts')
    }

    refresh()
  }, [studyId, refresh])

  return {
    dismissals,
    dismissedHashes,
    isLoading,
    error,
    dismiss,
    restore,
    refresh
  }
}

export type UseLabKitAlertDismissalsReturn = ReturnType<typeof useLabKitAlertDismissals>
