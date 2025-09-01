'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSite } from '@/components/site/SiteProvider'
import { supabase } from '@/lib/supabase/client'

export default function NoSitesBanner() {
  const { sites, currentSiteId, setCurrentSiteId, refreshSites } = useSite()
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [siteName, setSiteName] = useState('My Research Site')
  const [legacyCount, setLegacyCount] = useState<number | null>(null)
  const [message, setMessage] = useState<string>('')

  // Load legacy study count (owned by user with site_id null)
  const loadLegacyCount = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const resp = await fetch('/api/studies', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!resp.ok) return
      const { studies } = await resp.json()
      const count = (studies || []).filter((s: { site_id: string | null }) => s.site_id === null).length
      setLegacyCount(count)
    } catch {}
  }, [])

  useEffect(() => {
    loadLegacyCount()
  }, [loadLegacyCount, sites])

  const showCreate = sites.length === 0
  const showAssign = !showCreate && (legacyCount || 0) > 0 && currentSiteId

  const createSite = async () => {
    setMessage('')
    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const resp = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: siteName.trim() || 'My Site' })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create site')
      }
      const { site } = await resp.json()
      await refreshSites()
      if (site?.id) setCurrentSiteId(site.id)
      setMessage('Site created successfully')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to create site')
    } finally {
      setCreating(false)
    }
  }

  const assignLegacy = async () => {
    if (!currentSiteId) return
    setMessage('')
    setAssigning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const resp = await fetch('/api/sites/assign-legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ site_id: currentSiteId })
      })
      const out = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(out.error || 'Failed to assign studies')
      setMessage(`Assigned ${out.assigned || 0} legacy studies to selected site`)
      await loadLegacyCount()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to assign studies')
    } finally {
      setAssigning(false)
    }
  }

  if (!showCreate && !showAssign) return null

  return (
    <div className="mb-4 p-4 border border-yellow-700/40 bg-yellow-900/20 rounded-lg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-yellow-200 text-sm">
          {showCreate ? (
            <>
              <div className="font-medium">No sites found for your account.</div>
              <div>Create your first site to enable site-scoped access.</div>
            </>
          ) : (
            <>
              <div className="font-medium">Legacy studies detected</div>
              <div>{legacyCount} studies are not assigned to a site. Assign them to the selected site for full access control.</div>
            </>
          )}
          {message && <div className="mt-2 text-yellow-300">{message}</div>}
        </div>

        <div className="flex items-center gap-2">
          {showCreate && (
            <>
              <input
                className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-100 text-sm"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Site name"
                disabled={creating}
              />
              <button
                onClick={createSite}
                disabled={creating}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Site'}
              </button>
            </>
          )}
          {showAssign && (
            <button
              onClick={assignLegacy}
              disabled={assigning}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Assign my studies to this site'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

