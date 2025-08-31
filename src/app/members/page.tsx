'use client'

import { useEffect, useMemo, useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import { useSite } from '@/components/site/SiteProvider'

type Role = 'owner' | 'coordinator' | 'pi' | 'monitor'

interface MemberRow {
  user_id: string
  role: Role
  created_at: string
}

export default function MembersPage() {
  const { sites, currentSiteId, setCurrentSiteId, refreshSites } = useSite()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(false)
  const [creatingSite, setCreatingSite] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('coordinator')

  const currentSite = useMemo(() => sites.find(s => s.id === currentSiteId) || null, [sites, currentSiteId])

  useEffect(() => {
    if (currentSiteId) loadMembers()
  }, [currentSiteId])

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token

  const loadMembers = async () => {
    if (!currentSiteId) return
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/site-members?site_id=${currentSiteId}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load members')
      setMembers(data.members || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const createSite = async () => {
    if (!siteName.trim()) return
    setCreatingSite(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: siteName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create site')
      setSiteName('')
      await refreshSites()
      setCurrentSiteId(data.site.id)
    } catch (e) {
      console.error(e)
      alert((e as Error).message)
    } finally {
      setCreatingSite(false)
    }
  }

  const inviteMember = async () => {
    if (!currentSiteId || !inviteEmail.trim()) return
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/site-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: currentSiteId, email: inviteEmail.trim(), role: inviteRole })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add member')
      setInviteEmail('')
      setInviteRole('coordinator')
      await loadMembers()
    } catch (e) {
      console.error(e)
      alert((e as Error).message)
    }
  }

  const updateRole = async (userId: string, role: Role) => {
    if (!currentSiteId) return
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/site-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: currentSiteId, user_id: userId, role })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update role')
      await loadMembers()
    } catch (e) {
      console.error(e)
      alert((e as Error).message)
    }
  }

  const removeMember = async (userId: string) => {
    if (!currentSiteId) return
    if (!confirm('Remove this member?')) return
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/site-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: currentSiteId, user_id: userId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove member')
      await loadMembers()
    } catch (e) {
      console.error(e)
      alert((e as Error).message)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Members</h1>
            <p className="text-gray-300">Manage site membership and roles</p>
          </div>
          {sites.length > 0 && (
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-300">Site</label>
              <select
                value={currentSiteId || ''}
                onChange={(e) => setCurrentSiteId(e.target.value || null)}
                className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-3 py-2"
              >
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {sites.length === 0 && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-2">Create Your First Site</h3>
            <p className="text-gray-400 text-sm mb-4">Create a site to start sharing studies with your team.</p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Site name"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
              />
              <button
                onClick={createSite}
                disabled={creatingSite || !siteName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                {creatingSite ? 'Creating...' : 'Create Site'}
              </button>
            </div>
          </div>
        )}

        {currentSite && (
          <div className="space-y-4">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-3">Invite Member</h3>
              <div className="flex flex-col md:flex-row items-start md:items-center md:space-x-3 space-y-2 md:space-y-0">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 w-full"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100"
                >
                  <option value="coordinator">Coordinator</option>
                  <option value="pi">PI</option>
                  <option value="monitor">Monitor</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  onClick={inviteMember}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  Invite
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">The user must have an account; invites add existing accounts by email.</p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-3">Members of {currentSite.name}</h3>
              {loading ? (
                <div className="text-gray-300">Loading members...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-300 border-b border-gray-700">
                        <th className="py-2">User ID</th>
                        <th className="py-2">Role</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.user_id} className="border-b border-gray-800">
                          <td className="py-2 text-gray-200 font-mono">{m.user_id}</td>
                          <td className="py-2">
                            <select
                              value={m.role}
                              onChange={(e) => updateRole(m.user_id, e.target.value as Role)}
                              className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1"
                            >
                              <option value="owner">Owner</option>
                              <option value="coordinator">Coordinator</option>
                              <option value="pi">PI</option>
                              <option value="monitor">Monitor</option>
                            </select>
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => removeMember(m.user_id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {members.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-4 text-gray-400">No members yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

