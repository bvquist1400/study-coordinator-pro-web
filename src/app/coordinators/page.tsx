'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'

interface CoordinatorRecord {
  id: string
  name: string
  email: string | null
  organization: string | null
  assignments: Array<{ id: string; studyTitle: string; protocolNumber: string; role: string | null; joinedAt: string }>
}

export default function CoordinatorsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coordinators, setCoordinators] = useState<CoordinatorRecord[]>([])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        if (!token) {
          throw new Error('You must be signed in to view coordinators')
        }

        const response = await fetch('/api/coordinators', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!response.ok) {
          throw new Error('Failed to load coordinators')
        }
        const payload = await response.json()
        if (!mounted) return
        setCoordinators(payload.coordinators ?? [])
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load coordinators')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Coordinator Directory</h1>
          <p className="text-gray-300">
            Review active coordinators, their contact details, and the studies they currently support.
          </p>
        </div>

        {loading ? (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse">
            <div className="h-4 w-40 bg-gray-700 rounded mb-3" />
            <div className="h-3 w-full bg-gray-700 rounded" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-red-300">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {coordinators.map((coordinator) => (
              <div key={coordinator.id} className="bg-gray-900/60 border border-gray-700 rounded-lg p-5 space-y-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{coordinator.name}</h2>
                  <p className="text-sm text-gray-400">{coordinator.email ?? 'No email on file'}</p>
                  {coordinator.organization && (
                    <p className="text-xs text-gray-500">{coordinator.organization}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Assigned studies</p>
                  {coordinator.assignments.length === 0 ? (
                    <p className="text-sm text-gray-500">No linked studies yet.</p>
                  ) : (
                    <ul className="text-sm text-gray-200 space-y-1">
                      {coordinator.assignments.map((assignment) => (
                        <li key={assignment.id}>
                          {assignment.studyTitle} · {assignment.protocolNumber}
                          {assignment.role ? ` — ${assignment.role}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
