'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { StudyKitType } from '@/types/database'

interface KitTypeSettingsPanelProps {
  studyId: string
  canManage: boolean
}

interface BufferDraft {
  bufferDays: string
  bufferCount: string
  deliveryDays: string
  dirty: boolean
  saving: boolean
  error?: string | null
  success?: string | null
}

export default function KitTypeSettingsPanel({ studyId, canManage }: KitTypeSettingsPanelProps) {
  const [kitTypes, setKitTypes] = useState<StudyKitType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, BufferDraft>>({})

  const loadKitTypes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setKitTypes([])
        return
      }
      const resp = await fetch(`/api/study-kit-types?study_id=${studyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to load kit types')
      }
      const json = await resp.json()
      const serverKitTypes: StudyKitType[] = Array.isArray(json.kitTypes) ? json.kitTypes : []
      setKitTypes(serverKitTypes)
      setDrafts(prev => {
        const next: Record<string, BufferDraft> = {}
        serverKitTypes.forEach(type => {
          const existing = prev[type.id]
          if (existing && existing.dirty && !existing.saving) {
            next[type.id] = existing
          } else {
            next[type.id] = {
              bufferDays: type.buffer_days !== null && type.buffer_days !== undefined ? String(type.buffer_days) : '',
              bufferCount: type.buffer_count !== null && type.buffer_count !== undefined ? String(type.buffer_count) : '',
              deliveryDays: type.delivery_days !== null && type.delivery_days !== undefined ? String(type.delivery_days) : '',
              dirty: false,
              saving: false,
              error: null,
              success: null
            }
          }
        })
        return next
      })
    } catch (err) {
      console.error('Failed to load kit types', err)
      setError(err instanceof Error ? err.message : 'Failed to load kit types')
      setKitTypes([])
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => { loadKitTypes() }, [loadKitTypes])

  const activeKitTypes = useMemo(() => kitTypes.filter(type => type.is_active), [kitTypes])

  const handleDraftChange = (id: string, field: 'bufferDays' | 'bufferCount' | 'deliveryDays', value: string) => {
    setDrafts(prev => ({
      ...prev,
      [id]: {
        bufferDays: field === 'bufferDays' ? value : prev[id]?.bufferDays ?? '',
        bufferCount: field === 'bufferCount' ? value : prev[id]?.bufferCount ?? '',
        deliveryDays: field === 'deliveryDays' ? value : prev[id]?.deliveryDays ?? '',
        dirty: true,
        saving: prev[id]?.saving ?? false,
        error: null,
        success: null
      }
    }))
  }

  const validateDraft = (draft: BufferDraft) => {
    const rawDays = draft.bufferDays.trim()
    if (rawDays !== '') {
      const parsed = Number(rawDays)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120) {
        return 'Buffer days must be between 0 and 120'
      }
    }
    const rawCount = draft.bufferCount.trim()
    if (rawCount !== '') {
      const parsed = Number(rawCount)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
        return 'Minimum kits must be between 0 and 999'
      }
    }
    const rawDelivery = draft.deliveryDays.trim()
    if (rawDelivery !== '') {
      const parsed = Number(rawDelivery)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120) {
        return 'Delivery time must be between 0 and 120 days'
      }
    }
    return null
  }

  const saveDraft = async (id: string) => {
    const draft = drafts[id]
    if (!draft || draft.saving || !draft.dirty) return

    const validationError = validateDraft(draft)
    if (validationError) {
      setDrafts(prev => ({
        ...prev,
        [id]: { ...draft, error: validationError, success: null }
      }))
      return
    }

    const bufferDays = draft.bufferDays.trim() === '' ? null : Number(draft.bufferDays.trim())
    const bufferCount = draft.bufferCount.trim() === '' ? null : Number(draft.bufferCount.trim())
    const deliveryDays = draft.deliveryDays.trim() === '' ? null : Number(draft.deliveryDays.trim())

    try {
      setDrafts(prev => ({
        ...prev,
        [id]: { ...draft, saving: true, error: null, success: null }
      }))
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required')

      const resp = await fetch('/api/study-kit-types', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id,
          study_id: studyId,
          buffer_days: bufferDays,
          buffer_count: bufferCount,
          delivery_days: deliveryDays
        })
      })

      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}))
        throw new Error(json.detail || json.error || 'Failed to update kit type')
      }

      setDrafts(prev => ({
        ...prev,
        [id]: {
          bufferDays: bufferDays !== null ? String(bufferDays) : '',
          bufferCount: bufferCount !== null ? String(bufferCount) : '',
          deliveryDays: deliveryDays !== null ? String(deliveryDays) : '',
          dirty: false,
          saving: false,
          error: null,
          success: 'Saved'
        }
      }))
      setKitTypes(prev => prev.map(type => type.id === id ? { ...type, buffer_days: bufferDays, buffer_count: bufferCount, delivery_days: deliveryDays } : type))
    } catch (err) {
      setDrafts(prev => ({
        ...prev,
        [id]: { ...draft, saving: false, error: err instanceof Error ? err.message : 'Failed to update kit type' }
      }))
    }
  }

  const resetDraft = (id: string) => {
    setDrafts(prev => ({
      ...prev,
      [id]: {
        bufferDays: '',
        bufferCount: '',
        deliveryDays: '',
        dirty: true,
        saving: false,
        error: null,
        success: null
      }
    }))
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
      <div className="p-6 border-b border-gray-700 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Safety Cushion & Delivery</h3>
          <p className="text-sm text-gray-400">Adjust per-kit safety cushion, minimum stock, and delivery time. Leave blank to inherit the study defaults.</p>
        </div>
        <button
          type="button"
          onClick={loadKitTypes}
          className="px-3 py-1.5 text-sm bg-gray-700/50 border border-gray-600 text-gray-100 rounded-md hover:bg-gray-700"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-6 py-4 text-sm text-red-400 border-b border-gray-700">{error}</div>
      )}

      <div className="divide-y divide-gray-700">
        {loading ? (
          <div className="p-6 text-center text-gray-400">
            Loading kit types…
          </div>
        ) : activeKitTypes.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No active kit types yet. Use the Schedule of Events builder to add kit requirements.
          </div>
        ) : (
          activeKitTypes.map(type => {
            const draft = drafts[type.id] || { bufferDays: '', bufferCount: '', deliveryDays: '', dirty: false, saving: false }
            const validationError = draft.error ? null : validateDraft(draft)
            const bufferDaysDisplay = draft.bufferDays.trim() === '' && type.buffer_days !== null ? String(type.buffer_days) : draft.bufferDays
            const bufferCountDisplay = draft.bufferCount.trim() === '' && type.buffer_count !== null ? String(type.buffer_count) : draft.bufferCount
            const deliveryDaysDisplay = draft.deliveryDays.trim() === '' && type.delivery_days !== null ? String(type.delivery_days) : draft.deliveryDays
            return (
              <div key={type.id} className="p-6 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{type.name}</div>
                    {type.description && <div className="text-xs text-gray-400">{type.description}</div>}
                    {!type.is_active && <div className="text-xs text-yellow-400 mt-1">Inactive</div>}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Safety Cushion (days)</label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={bufferDaysDisplay}
                        onChange={(e) => handleDraftChange(type.id, 'bufferDays', e.target.value)}
                        placeholder="Default"
                        className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!canManage}
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Minimum Kits On Hand</label>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={bufferCountDisplay}
                        onChange={(e) => handleDraftChange(type.id, 'bufferCount', e.target.value)}
                        placeholder="0"
                        className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!canManage}
                      />
                    </div>
                    <div className="w-36">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Delivery Time to Site (days)</label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={deliveryDaysDisplay}
                        onChange={(e) => handleDraftChange(type.id, 'deliveryDays', e.target.value)}
                        placeholder="Default"
                        className="w-full bg-gray-700/60 border border-gray-600 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!canManage}
                      />
                    </div>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => saveDraft(type.id)}
                          disabled={!draft.dirty || draft.saving}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {draft.saving ? 'Saving…' : draft.dirty ? 'Save' : 'Saved'}
                        </button>
                        <button
                          type="button"
                          onClick={() => resetDraft(type.id)}
                          disabled={draft.saving}
                          className="px-3 py-2 text-sm text-gray-400 hover:text-white"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {validationError && draft.dirty && !draft.saving && !draft.error && (
                  <p className="text-xs text-yellow-400">{validationError}</p>
                )}
                {draft.error && <p className="text-xs text-red-400">{draft.error}</p>}
                {draft.success && !draft.dirty && <p className="text-xs text-green-400">{draft.success}</p>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
