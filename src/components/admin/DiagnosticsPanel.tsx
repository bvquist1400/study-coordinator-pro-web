'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useSite } from '@/components/site/SiteProvider'

type EnvInfo = {
  ok: boolean
  isAdmin: boolean
  supabaseUrlSet: boolean
  supabaseAnonSet: boolean
  serviceRoleSet: boolean
  projectRef: string | null
}

export default function DiagnosticsPanel() {
  const { currentSiteId, sites } = useSite()
  const [visible, setVisible] = useState(false)
  const [env, setEnv] = useState<EnvInfo | null>(null)
  const [studiesCount, setStudiesCount] = useState<{ total: number; legacy: number }>({ total: 0, legacy: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return

        // Check env + admin flag
        const envResp = await fetch('/api/diagnostics/env', { headers: { Authorization: `Bearer ${token}` } })
        if (envResp.ok) {
          const e = await envResp.json()
          setEnv(e as EnvInfo)
          setVisible((e as EnvInfo).isAdmin)
        } else {
          setVisible(false)
          setError('Diagnostics not available')
          return
        }

        // Studies count (member studies + legacy)
        const studiesResp = await fetch('/api/studies', { headers: { Authorization: `Bearer ${token}` } })
        if (studiesResp.ok) {
          const { studies } = await studiesResp.json()
          const total = (studies || []).length
          const legacy = (studies || []).filter((s: any) => s.site_id === null).length
          setStudiesCount({ total, legacy })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load diagnostics')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (!visible) return null

  return (
    <div className="mb-4 p-4 border border-blue-700/40 bg-blue-900/20 rounded-lg text-blue-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">Admin Diagnostics</div>
          {loading ? (
            <div className="text-sm">Loading…</div>
          ) : (
            <div className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-blue-300">Sites</div>
                <div>Count: {sites.length}</div>
                <div>Current: {currentSiteId || '(none)'}</div>
              </div>
              <div>
                <div className="text-blue-300">Studies</div>
                <div>Total: {studiesCount.total}</div>
                <div>Legacy (no site): {studiesCount.legacy}</div>
              </div>
              <div>
                <div className="text-blue-300">Supabase</div>
                <div>URL set: {env?.supabaseUrlSet ? 'yes' : 'no'}</div>
                <div>Anon key set: {env?.supabaseAnonSet ? 'yes' : 'no'}</div>
                <div>Service role set: {env?.serviceRoleSet ? 'yes' : 'no'}</div>
                {env?.projectRef && <div>Project: {env.projectRef}</div>}
              </div>
            </div>
          )}
          {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
        </div>
        <button onClick={() => setVisible(false)} className="text-xs text-blue-300 hover:text-white">Hide</button>
      </div>
    </div>
  )
}

