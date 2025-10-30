'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase/client'
import { useSite } from '@/components/site/SiteProvider'

type Role = 'owner' | 'coordinator' | 'pi' | 'monitor'

interface MemberRow {
  user_id: string
  role: Role
  created_at: string
}

interface StudyOption {
  id: string
  study_title: string
  protocol_number: string | null
}

interface StudyAssignment {
  id: string
  studyId: string
  studyTitle: string
  protocolNumber: string | null
  joinedAt?: string | null
  role?: string | null
}

interface AssignmentApiRow {
  id: string
  studyId: string
  coordinatorId: string
  role: string | null
  joinedAt?: string | null
  study?: {
    id: string
    studyTitle: string
    protocolNumber: string | null
  } | null
}

interface MemberProfile {
  fullName: string | null
  email: string | null
}

interface MemberDetails extends MemberRow {
  profile: MemberProfile | null
}

export default function MembersPage() {
  const { sites, currentSiteId, setCurrentSiteId, refreshSites } = useSite()
  const [members, setMembers] = useState<MemberDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [creatingSite, setCreatingSite] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('coordinator')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)
  const [studies, setStudies] = useState<StudyOption[]>([])
  const [loadingStudies, setLoadingStudies] = useState(false)
  const [assignments, setAssignments] = useState<Record<string, StudyAssignment[]>>({})
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentSelections, setAssignmentSelections] = useState<Record<string, string>>({})
  const [assignmentSaving, setAssignmentSaving] = useState<Record<string, boolean>>({})
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null)
  const { handleApiError, handleError } = useErrorHandler()

  const currentSite = useMemo(() => sites.find(s => s.id === currentSiteId) || null, [sites, currentSiteId])
  const coordinatorMembers = useMemo(() => members.filter(member => member.role === 'coordinator'), [members])
  const sortedStudies = useMemo(() => [...studies].sort((a, b) => a.study_title.localeCompare(b.study_title)), [studies])

  const getToken = async () => (await supabase.auth.getSession()).data.session?.access_token

  const loadMembers = useCallback(async () => {
    if (!currentSiteId) {
      setMembers([])
      return
    }
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/site-members?site_id=${currentSiteId}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load members')
      const rows: MemberDetails[] = data.members || []
      setMembers(rows)
      setAssignmentSelections({})
    } catch (e) {
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.load' } })
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentSiteId, handleError])

  const loadStudies = useCallback(async () => {
    if (!currentSiteId) {
      setStudies([])
      return
    }
    setLoadingStudies(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/studies?site_id=${currentSiteId}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load studies')
      setStudies((data.studies || []) as StudyOption[])
    } catch (e) {
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.loadStudies' } })
      setErrorMsg(err.message)
    } finally {
      setLoadingStudies(false)
    }
  }, [currentSiteId, handleError])

  const loadAssignments = useCallback(async () => {
    if (!currentSiteId) {
      setAssignments({})
      return
    }
    const siteStudyIds = new Set(studies.map(study => study.id))
    const coordinatorIds = new Set(coordinatorMembers.map(member => member.user_id))
    if (siteStudyIds.size === 0 || coordinatorIds.size === 0) {
      setAssignments({})
      return
    }
    setAssignmentsLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/study-coordinators', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load coordinator assignments')
      const rows: AssignmentApiRow[] = data.assignments || []
      const grouped: Record<string, StudyAssignment[]> = {}
      for (const row of rows) {
        if (!row.studyId || !row.coordinatorId) continue
        if (!siteStudyIds.has(row.studyId)) continue
        if (!coordinatorIds.has(row.coordinatorId)) continue
        const studyInfo = row.study
        const assignment: StudyAssignment = {
          id: row.id,
          studyId: row.studyId,
          studyTitle: studyInfo?.studyTitle || 'Untitled study',
          protocolNumber: studyInfo?.protocolNumber || null,
          joinedAt: row.joinedAt || null,
          role: row.role || null
        }
        if (!grouped[row.coordinatorId]) grouped[row.coordinatorId] = []
        grouped[row.coordinatorId].push(assignment)
      }
      Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => a.studyTitle.localeCompare(b.studyTitle))
      })
      setAssignments(grouped)
    } catch (e) {
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.loadAssignments' } })
      setErrorMsg(err.message)
    } finally {
      setAssignmentsLoading(false)
    }
  }, [coordinatorMembers, currentSiteId, handleError, studies])

  useEffect(() => {
    if (currentSiteId) {
      loadMembers()
    } else {
      setMembers([])
      setAssignments({})
      setStudies([])
      setAssignmentSelections({})
    }
  }, [currentSiteId, loadMembers])

  useEffect(() => {
    if (currentSiteId) {
      loadStudies()
    }
  }, [currentSiteId, loadStudies])

  useEffect(() => {
    if (!currentSiteId) return
    if (studies.length === 0 || coordinatorMembers.length === 0) {
      setAssignments({})
      return
    }
    loadAssignments()
  }, [coordinatorMembers, currentSiteId, loadAssignments, studies])

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
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.createSite' } })
      setErrorMsg(err.message)
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
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.invite' } })
      setErrorMsg(err.message)
    }
  }

  const assignStudyToCoordinator = async (coordinatorId: string) => {
    const studyId = assignmentSelections[coordinatorId]
    if (!studyId) return
    setAssignmentSaving(prev => ({ ...prev, [coordinatorId]: true }))
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/study-coordinators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studyId, coordinatorId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign study')
      setAssignmentSelections(prev => {
        const next = { ...prev }
        delete next[coordinatorId]
        return next
      })
      await loadAssignments()
    } catch (e) {
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.assignStudy' } })
      setErrorMsg(err.message)
    } finally {
      setAssignmentSaving(prev => ({ ...prev, [coordinatorId]: false }))
    }
  }

  const removeStudyAssignment = async (assignmentId: string) => {
    setRemovingAssignmentId(assignmentId)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/study-coordinators/${assignmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        await handleApiError(res, `/api/study-coordinators/${assignmentId}`, { action: 'delete' })
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || 'Failed to remove assignment')
      }
      await loadAssignments()
    } catch (e) {
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.removeAssignment' } })
      setErrorMsg(err.message)
    } finally {
      setRemovingAssignmentId(null)
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
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.updateRole' } })
      setErrorMsg(err.message)
    }
  }

  const removeMember = async (userId: string) => {
    if (!currentSiteId) return
    setConfirmUserId(userId)
  }

  const confirmRemove = async () => {
    if (!currentSiteId || !confirmUserId) return
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch('/api/site-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: currentSiteId, user_id: confirmUserId })
      })
      if (!res.ok) {
        await handleApiError(res, '/api/site-members', { action: 'delete' })
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || 'Failed to remove member')
      }
      await loadMembers()
      setConfirmUserId(null)
    } catch (e) {
      const err = handleError(e as Error, { showToast: true, context: { feature: 'members.remove' } })
      setErrorMsg(err.message)
    }
  }

  return (
    <>
      <DashboardLayout>
        <div className="space-y-6">
          {errorMsg && (
            <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
              <div className="flex items-start justify-between">
                <span>{errorMsg}</span>
                <button aria-label="Dismiss error" className="text-red-300 hover:text-red-200" onClick={() => setErrorMsg(null)}>×</button>
              </div>
            </div>
          )}
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
                          <th className="py-2">Member</th>
                          <th className="py-2">Role</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map(m => {
                          const fullName = m.profile?.fullName?.trim() || null
                          const email = m.profile?.email?.trim() || null
                          const heading = fullName || email || 'Member profile pending'
                          const supporting = fullName && email ? email : (!fullName && !email ? 'User details not yet set' : null)
                          return (
                            <tr key={m.user_id} className="border-b border-gray-800">
                              <td className="py-2 text-gray-200">
                                <div className="text-sm font-semibold text-white">{heading}</div>
                                {supporting && (
                                  <div className={`text-xs ${supporting === email ? 'text-gray-400' : 'text-gray-500 italic'}`}>
                                    {supporting}
                                  </div>
                                )}
                              </td>
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
                          )
                        })}
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

              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Coordinator Study Assignments</h3>
                </div>
                {loadingStudies || assignmentsLoading ? (
                  <div className="text-gray-300">Loading coordinator assignments...</div>
                ) : coordinatorMembers.length === 0 ? (
                  <p className="text-gray-400 text-sm">Add coordinators to this site to assign studies.</p>
                ) : sortedStudies.length === 0 ? (
                  <p className="text-gray-400 text-sm">There are no studies associated with this site yet.</p>
                ) : (
                  <div className="space-y-4">
                    {coordinatorMembers.map(member => {
                      const assigned = assignments[member.user_id] ?? []
                      const assignedIds = new Set(assigned.map(a => a.studyId))
                      const availableOptions = sortedStudies.filter(study => !assignedIds.has(study.id))
                      const selection = assignmentSelections[member.user_id] ?? ''
                      const isSaving = assignmentSaving[member.user_id] === true
                      const fullName = member.profile?.fullName?.trim() || null
                      const email = member.profile?.email?.trim() || null
                      const heading = fullName || email || 'Member profile pending'
                      const supporting = fullName && email ? email : (!fullName && !email ? 'User details not yet set' : null)
                      const supportingClass = supporting === email ? 'text-gray-400' : 'text-gray-500 italic'
                      return (
                        <div key={member.user_id} className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                              <p className="text-gray-100 font-medium">{heading}</p>
                              {supporting && (
                                <p className={`text-xs ${supportingClass}`}>
                                  {supporting}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 uppercase tracking-wide">
                              Coordinator · {assigned.length} {assigned.length === 1 ? 'study' : 'studies'}
                            </span>
                          </div>
                          {assigned.length > 0 ? (
                            <ul className="space-y-2">
                              {assigned.map(assignment => (
                                <li key={assignment.id} className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
                                  <div>
                                    <p className="text-gray-100 text-sm font-medium">{assignment.studyTitle}</p>
                                    {assignment.protocolNumber && (
                                      <p className="text-gray-400 text-xs">Protocol {assignment.protocolNumber}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => removeStudyAssignment(assignment.id)}
                                    disabled={removingAssignmentId === assignment.id}
                                    className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {removingAssignmentId === assignment.id ? 'Removing...' : 'Remove'}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-gray-400 text-sm italic">No studies assigned yet.</p>
                          )}
                          <div>
                            {availableOptions.length > 0 ? (
                              <div className="flex flex-col sm:flex-row gap-2">
                                <select
                                  value={selection}
                                  onChange={(e) => setAssignmentSelections(prev => ({ ...prev, [member.user_id]: e.target.value }))}
                                  className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-3 py-2 flex-1"
                                >
                                  <option value="">Select a study</option>
                                  {availableOptions.map(option => (
                                    <option key={option.id} value={option.id}>
                                      {option.study_title}{option.protocol_number ? ` · ${option.protocol_number}` : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => assignStudyToCoordinator(member.user_id)}
                                  disabled={!selection || isSaving}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSaving ? 'Assigning...' : 'Assign Study'}
                                </button>
                              </div>
                            ) : (
                              <p className="text-gray-500 text-sm italic">All site studies are already assigned to this coordinator.</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
      {confirmUserId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h2 id="confirm-title" className="text-white text-lg font-semibold mb-2">Remove member?</h2>
            <p className="text-gray-300 mb-4">This action will remove the user from this site. You can re-add them later if needed.</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-gray-700 text-gray-100 rounded"
                onClick={() => setConfirmUserId(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                onClick={confirmRemove}
                autoFocus
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
