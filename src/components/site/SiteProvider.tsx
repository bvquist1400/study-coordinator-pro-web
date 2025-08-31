'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Site {
  id: string
  name: string
}

interface SiteContextValue {
  sites: Site[]
  currentSiteId: string | null
  setCurrentSiteId: (id: string | null) => void
  refreshSites: () => Promise<void>
}

const SiteContext = createContext<SiteContextValue | null>(null)

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [sites, setSites] = useState<Site[]>([])
  const [currentSiteId, setCurrentSiteIdState] = useState<string | null>(null)

  useEffect(() => {
    // Load persisted site
    const saved = typeof window !== 'undefined' ? localStorage.getItem('scp-current-site') : null
    if (saved) setCurrentSiteIdState(saved)
    // Load memberships
    refreshSites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCurrentSiteId = (id: string | null) => {
    setCurrentSiteIdState(id)
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('scp-current-site', id)
      else localStorage.removeItem('scp-current-site')
    }
  }

  const refreshSites = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      // Prefer server API to avoid client-side RLS limitations
      try {
        const resp = await fetch('/api/sites', { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (resp.ok) {
          const { sites } = await resp.json()
          const list = (sites || []).map((s: any) => ({ id: s.id, name: s.name })) as Site[]
          setSites(list)
          if (!currentSiteId && list.length > 0) setCurrentSiteId(list[0].id)
          return
        }
      } catch (apiErr) {
        console.warn('Sites API unavailable, falling back to direct DB:', apiErr)
      }

      // Fallback: memberships -> sites
      const { data: memberships, error: memErr } = await supabase
        .from('site_members')
        .select('site_id')
        .eq('user_id', session.user.id)

      if (memErr) {
        console.error('Failed to load site memberships:', memErr)
        return
      }

      const siteIds = (memberships || []).map((m: any) => m.site_id).filter(Boolean)
      if (siteIds.length === 0) {
        setSites([])
        setCurrentSiteId(null)
        return
      }

      const { data: sitesData, error: sitesErr } = await supabase
        .from('sites')
        .select('id, name')
        .in('id', siteIds)

      if (sitesErr) {
        console.error('Failed to load sites:', sitesErr)
        setSites(siteIds.map((id: string) => ({ id, name: 'Site' })))
      } else {
        setSites((sitesData || []) as Site[])
      }

      const first = siteIds[0]
      if (!currentSiteId && first) setCurrentSiteId(first)
    } catch (e) {
      console.error('Error loading sites:', e)
    }
  }

  const value = useMemo(() => ({ sites, currentSiteId, setCurrentSiteId, refreshSites }), [sites, currentSiteId])

  return (
    <SiteContext.Provider value={value}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used within SiteProvider')
  return ctx
}
