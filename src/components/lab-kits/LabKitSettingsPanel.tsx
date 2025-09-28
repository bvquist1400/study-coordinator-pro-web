'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Json } from '@/types/database'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'

interface ProfileSummary {
  id: string
  fullName: string | null
  email: string | null
}

interface LabKitSettingsDefaults {
  id: string | null
  minOnHand: number
  bufferDays: number
  leadTimeDays: number
  autoOrderEnabled: boolean
  notes: string | null
  metadata: Json
  updatedAt: string | null
  updatedBy: ProfileSummary | null
  inventoryBufferDays: number
  inventoryBufferKits: number
}

interface LabKitSettingsOverride {
  id: string
  kitTypeId: string
  kitTypeName: string | null
  minOnHand: number
  bufferDays: number
  leadTimeDays: number
  autoOrderEnabled: boolean
  notes: string | null
  metadata: Json
  updatedAt: string
  updatedBy: ProfileSummary | null
}

interface LabKitSettingsSnapshot {
  studyId: string
  defaults: LabKitSettingsDefaults
  overrides: LabKitSettingsOverride[]
  updatedAt: string
  etag: string
}

interface StudyKitType {
  id: string
  name: string | null
  description: string | null
  is_active: boolean | null
}

interface LabKitSettingsPanelProps {
  studyId: string
  onSettingsUpdated?: () => void
}

interface DefaultsFormState {
  minOnHand: string
  bufferDays: string
  leadTimeDays: string
  autoOrderEnabled: boolean
  notes: string
  inventoryBufferDays: string
  inventoryBufferKits: string
}

interface OverrideFormState {
  id: string
  kitTypeId: string
  kitTypeName: string | null
  minOnHand: string
  bufferDays: string
  leadTimeDays: string
  autoOrderEnabled: boolean
  notes: string
  updatedAt: string
  updatedBy: ProfileSummary | null
  isDirty: boolean
  isSaving: boolean
  error: string | null
}

interface NewOverrideFormState {
  kitTypeId: string
  minOnHand: string
  bufferDays: string
  leadTimeDays: string
  autoOrderEnabled: boolean
  notes: string
  isSaving: boolean
  error: string | null
}

interface KitTypeFormState {
  id: string
  name: string
  description: string
  isActive: boolean
  mode: 'view' | 'edit'
  isSaving: boolean
  error: string | null
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Never'
  try {
    return formatDistanceToNowStrict(parseISO(value), { addSuffix: true })
  } catch {
    return value
  }
}

function parseInteger(value: string, fallback = 0, { min = 0, max }: { min?: number; max?: number } = {}) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  let next = parsed
  if (typeof min === 'number') next = Math.max(next, min)
  if (typeof max === 'number') next = Math.min(next, max)
  return next
}

function sanitizeNotes(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function InfoTooltip({ title, description, example, useCase }: { title?: string; description: string; example: string; useCase: string }) {
  return (
    <span className="relative inline-flex items-center group">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-blue-400 text-[10px] font-semibold text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        aria-label={title ? `${title} help` : 'Field help'}
      >
        i
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-64 -translate-x-1/2 translate-y-2 rounded-md bg-gray-900 px-4 py-3 text-xs text-gray-100 shadow-lg group-hover:block group-focus-within:block">
        {title && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-200">{title}</div>}
        <div className="space-y-1">
          <p><span className="font-semibold text-blue-200">Description:</span> {description}</p>
          <p><span className="font-semibold text-blue-200">Example:</span> {example}</p>
          <p><span className="font-semibold text-blue-200">Use Case:</span> {useCase}</p>
        </div>
      </span>
    </span>
  )
}

export default function LabKitSettingsPanel({ studyId, onSettingsUpdated }: LabKitSettingsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<LabKitSettingsSnapshot | null>(null)
  const [kitTypes, setKitTypes] = useState<StudyKitType[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [recomputing, setRecomputing] = useState(false)

  const [defaultsForm, setDefaultsForm] = useState<DefaultsFormState>(() => ({
    minOnHand: '0',
    bufferDays: '0',
    leadTimeDays: '0',
    autoOrderEnabled: false,
    notes: '',
    inventoryBufferDays: '0',
    inventoryBufferKits: '0'
  }))
  const [defaultsDirty, setDefaultsDirty] = useState(false)
  const [defaultsSaving, setDefaultsSaving] = useState(false)

  const [overrideForms, setOverrideForms] = useState<OverrideFormState[]>([])

  const [newOverrideOpen, setNewOverrideOpen] = useState(false)
  const [newOverrideForm, setNewOverrideForm] = useState<NewOverrideFormState>({
    kitTypeId: '',
    minOnHand: '0',
    bufferDays: '0',
    leadTimeDays: '0',
    autoOrderEnabled: false,
    notes: '',
    isSaving: false,
    error: null
  })

  const [kitTypeForms, setKitTypeForms] = useState<KitTypeFormState[]>([])
  const [newKitTypeOpen, setNewKitTypeOpen] = useState(false)
  const [newKitTypeForm, setNewKitTypeForm] = useState<{ name: string; description: string; isActive: boolean; isSaving: boolean; error: string | null }>({
    name: '',
    description: '',
    isActive: true,
    isSaving: false,
    error: null
  })

  const loadSettings = useCallback(async () => {
    if (!studyId || studyId === 'all') {
      setSnapshot(null)
      setKitTypes([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const query = new URLSearchParams({ studyId })
      const [settingsResponse, kitTypesResponse] = await Promise.all([
        fetch(`/api/lab-kit-settings?${query.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/study-kit-types?study_id=${studyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      if (!settingsResponse.ok) {
        const payload = await settingsResponse.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load lab kit settings.')
      }

      if (!kitTypesResponse.ok) {
        const payload = await kitTypesResponse.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to load kit types.')
      }

      const settingsPayload = await settingsResponse.json()
      const kitTypesPayload = await kitTypesResponse.json()

      setSnapshot(settingsPayload as LabKitSettingsSnapshot)
      setKitTypes(Array.isArray(kitTypesPayload?.kitTypes) ? kitTypesPayload.kitTypes : [])
      setNotice(null)
    } catch (err) {
      setSnapshot(null)
      setKitTypes([])
      setError(err instanceof Error ? err.message : 'Failed to load lab kit settings.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [studyId])

  const submitPatch = useCallback(async (
    payload: Record<string, unknown>,
    successMessage: string
  ) => {
    if (!snapshot) {
      throw new Error('Settings are not loaded yet.')
    }

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      throw new Error('Authentication required. Please sign in again.')
    }

    const response = await fetch(`/api/lab-kit-settings?studyId=${snapshot.studyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(snapshot.etag ? { 'If-Match': snapshot.etag } : {})
      },
      body: JSON.stringify(payload)
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 412) {
        throw new Error(body?.error || 'Settings are out of date. Refresh and try again.')
      }
      throw new Error(body?.error || 'Failed to update lab kit settings.')
    }

    const updatedSnapshot = body as LabKitSettingsSnapshot
    setSnapshot(updatedSnapshot)
    setNotice({ type: 'success', message: successMessage })
    onSettingsUpdated?.()
    return updatedSnapshot
  }, [snapshot, onSettingsUpdated])

  const handleRecomputeRecommendations = useCallback(async () => {
    if (!studyId || studyId === 'all') {
      return
    }

    try {
      setRecomputing(true)
      setNotice(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const response = await fetch('/api/lab-kit-recommendations/recompute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ studyId })
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to recompute recommendations.')
      }

      const created = typeof payload?.created === 'number' ? payload.created : 0
      const updated = typeof payload?.updated === 'number' ? payload.updated : 0
      const expired = typeof payload?.expired === 'number' ? payload.expired : 0

      setNotice({
        type: 'success',
        message: `Recommendations refreshed (${created} created, ${updated} updated, ${expired} expired).`
      })
      onSettingsUpdated?.()
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to recompute recommendations.'
      })
    } finally {
      setRecomputing(false)
    }
  }, [studyId, onSettingsUpdated])

  const refreshKitTypes = useCallback(async () => {
    if (!studyId || studyId === 'all') {
      setKitTypes([])
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      throw new Error('Authentication required. Please sign in again.')
    }
    const response = await fetch(`/api/study-kit-types?study_id=${studyId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || 'Failed to load kit types.')
    }
    const payload = await response.json()
    setKitTypes(Array.isArray(payload?.kitTypes) ? payload.kitTypes : [])
  }, [studyId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (!snapshot) return

    setDefaultsForm({
      minOnHand: String(snapshot.defaults.minOnHand ?? 0),
      bufferDays: String(snapshot.defaults.bufferDays ?? 0),
      leadTimeDays: String(snapshot.defaults.leadTimeDays ?? 0),
      autoOrderEnabled: snapshot.defaults.autoOrderEnabled ?? false,
      notes: snapshot.defaults.notes ?? '',
      inventoryBufferDays: String(snapshot.defaults.inventoryBufferDays ?? 0),
      inventoryBufferKits: String(snapshot.defaults.inventoryBufferKits ?? 0)
    })
    setDefaultsDirty(false)
    setDefaultsSaving(false)

    setOverrideForms(
      snapshot.overrides.map((override) => ({
        id: override.id,
        kitTypeId: override.kitTypeId,
        kitTypeName: override.kitTypeName,
        minOnHand: String(override.minOnHand ?? 0),
        bufferDays: String(override.bufferDays ?? 0),
        leadTimeDays: String(override.leadTimeDays ?? 0),
        autoOrderEnabled: override.autoOrderEnabled ?? false,
        notes: override.notes ?? '',
        updatedAt: override.updatedAt,
        updatedBy: override.updatedBy ?? null,
        isDirty: false,
        isSaving: false,
        error: null
      }))
    )
  }, [snapshot])

  useEffect(() => {
    setKitTypeForms(
      kitTypes.map((kitType) => ({
        id: kitType.id,
        name: kitType.name ?? '',
        description: kitType.description ?? '',
        isActive: kitType.is_active ?? true,
        mode: 'view',
        isSaving: false,
        error: null
      }))
    )
  }, [kitTypes])

  useEffect(() => {
    if (!newOverrideOpen) {
      setNewOverrideForm({
        kitTypeId: '',
        minOnHand: '0',
        bufferDays: '0',
        leadTimeDays: '0',
        autoOrderEnabled: false,
        notes: '',
        isSaving: false,
        error: null
      })
    }
  }, [newOverrideOpen])

  const availableKitTypes = useMemo(() => {
    if (!kitTypes || !snapshot) return [] as StudyKitType[]
    const used = new Set(snapshot.overrides.map((override) => override.kitTypeId))
    return kitTypes.filter((kitType) => !used.has(kitType.id))
  }, [kitTypes, snapshot])

  const handleDefaultsChange = (field: keyof DefaultsFormState, value: string | boolean) => {
    setDefaultsForm((prev) => ({
      ...prev,
      [field]: value
    }))
    setDefaultsDirty(true)
  }

  const handleOverrideFieldChange = (id: string, field: keyof OverrideFormState, value: string | boolean) => {
    setOverrideForms((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        return {
          ...row,
          [field]: value,
          isDirty: true,
          error: null
        }
      })
    )
  }

  const handleSaveDefaults = async () => {
    try {
      setDefaultsSaving(true)
      setNotice(null)
      await submitPatch(
        {
          defaults: {
            minOnHand: parseInteger(defaultsForm.minOnHand),
            bufferDays: parseInteger(defaultsForm.bufferDays),
            leadTimeDays: parseInteger(defaultsForm.leadTimeDays),
            autoOrderEnabled: defaultsForm.autoOrderEnabled,
            notes: sanitizeNotes(defaultsForm.notes),
            inventoryBufferDays: parseInteger(defaultsForm.inventoryBufferDays),
            inventoryBufferKits: parseInteger(defaultsForm.inventoryBufferKits)
          }
        },
        'Study defaults updated.'
      )
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update defaults.' })
    } finally {
      setDefaultsSaving(false)
      setDefaultsDirty(false)
    }
  }

  const handleResetDefaults = () => {
    if (!snapshot) return
    setDefaultsForm({
      minOnHand: String(snapshot.defaults.minOnHand ?? 0),
      bufferDays: String(snapshot.defaults.bufferDays ?? 0),
      leadTimeDays: String(snapshot.defaults.leadTimeDays ?? 0),
      autoOrderEnabled: snapshot.defaults.autoOrderEnabled ?? false,
      notes: snapshot.defaults.notes ?? '',
      inventoryBufferDays: String(snapshot.defaults.inventoryBufferDays ?? 0),
      inventoryBufferKits: String(snapshot.defaults.inventoryBufferKits ?? 0)
    })
    setDefaultsDirty(false)
  }

  const handleSaveOverride = async (row: OverrideFormState) => {
    try {
      setOverrideForms((prev) => prev.map((item) => item.id === row.id ? { ...item, isSaving: true, error: null } : item))
      setNotice(null)
      await submitPatch(
        {
          overrides: [
            {
              id: row.id,
              kitTypeId: row.kitTypeId,
              minOnHand: parseInteger(row.minOnHand),
              bufferDays: parseInteger(row.bufferDays),
              leadTimeDays: parseInteger(row.leadTimeDays),
              autoOrderEnabled: row.autoOrderEnabled,
              notes: sanitizeNotes(row.notes)
            }
          ]
        },
        'Override updated.'
      )
    } catch (err) {
      setOverrideForms((prev) => prev.map((item) => item.id === row.id ? { ...item, error: err instanceof Error ? err.message : 'Failed to update override.' } : item))
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update override.' })
    } finally {
      setOverrideForms((prev) => prev.map((item) => item.id === row.id ? { ...item, isSaving: false, isDirty: false } : item))
    }
  }

  const handleDeleteOverride = async (row: OverrideFormState) => {
    if (!window.confirm(`Remove override for ${row.kitTypeName || 'this kit type'}?`)) {
      return
    }
    try {
      setOverrideForms((prev) => prev.map((item) => item.id === row.id ? { ...item, isSaving: true, error: null } : item))
      setNotice(null)
      await submitPatch(
        {
          deleteOverrideIds: [row.id]
        },
        'Override removed.'
      )
    } catch (err) {
      setOverrideForms((prev) => prev.map((item) => item.id === row.id ? { ...item, error: err instanceof Error ? err.message : 'Failed to delete override.' } : item))
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete override.' })
    } finally {
      setOverrideForms((prev) => prev.map((item) => item.id === row.id ? { ...item, isSaving: false } : item))
    }
  }

  const handleCreateOverride = async () => {
    if (!newOverrideForm.kitTypeId) {
      setNewOverrideForm((prev) => ({ ...prev, error: 'Select a kit type.' }))
      return
    }
    try {
      setNewOverrideForm((prev) => ({ ...prev, isSaving: true, error: null }))
      setNotice(null)
      await submitPatch(
        {
          overrides: [
            {
              kitTypeId: newOverrideForm.kitTypeId,
              minOnHand: parseInteger(newOverrideForm.minOnHand),
              bufferDays: parseInteger(newOverrideForm.bufferDays),
              leadTimeDays: parseInteger(newOverrideForm.leadTimeDays),
              autoOrderEnabled: newOverrideForm.autoOrderEnabled,
              notes: sanitizeNotes(newOverrideForm.notes)
            }
          ]
        },
        'Override created.'
      )
      setNewOverrideOpen(false)
    } catch (err) {
      setNewOverrideForm((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to create override.' }))
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create override.' })
    } finally {
      setNewOverrideForm((prev) => ({ ...prev, isSaving: false }))
    }
  }

  const handleCancelNewOverride = () => {
    setNewOverrideOpen(false)
  }

  const handleKitTypeFieldChange = (id: string, field: keyof Pick<KitTypeFormState, 'name' | 'description' | 'isActive'>, value: string | boolean) => {
    setKitTypeForms((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value, error: null } : row))
    )
  }

  const handleEditKitType = (id: string) => {
    setKitTypeForms((prev) =>
      prev.map((row) => (row.id === id ? { ...row, mode: 'edit', error: null } : row))
    )
  }

  const handleCancelKitType = (id: string) => {
    const original = kitTypes.find((kitType) => kitType.id === id)
    if (!original) return
    setKitTypeForms((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              name: original.name ?? '',
              description: original.description ?? '',
              isActive: original.is_active ?? true,
              mode: 'view',
              isSaving: false,
              error: null
            }
          : row
      )
    )
  }

  const handleSaveKitType = async (row: KitTypeFormState) => {
    if (!studyId || studyId === 'all') return
    if (!row.name.trim()) {
      setKitTypeForms((prev) => prev.map((item) => (item.id === row.id ? { ...item, error: 'Name is required.' } : item)))
      return
    }
    try {
      setKitTypeForms((prev) => prev.map((item) => (item.id === row.id ? { ...item, isSaving: true, error: null } : item)))
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }
      const response = await fetch('/api/study-kit-types', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: row.id,
          study_id: studyId,
          name: row.name.trim(),
          description: sanitizeNotes(row.description) ?? null,
          is_active: row.isActive
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update kit type.')
      }
      await refreshKitTypes()
      setNotice({ type: 'success', message: 'Kit type updated.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update kit type.'
      setKitTypeForms((prev) => prev.map((item) => (item.id === row.id ? { ...item, error: message } : item)))
      setNotice({ type: 'error', message })
    } finally {
      setKitTypeForms((prev) => prev.map((item) => (item.id === row.id ? { ...item, isSaving: false, mode: 'view' } : item)))
    }
  }

  const handleDeleteKitType = async (row: KitTypeFormState) => {
    if (!studyId || studyId === 'all') return
    if (!window.confirm(`Delete kit type "${row.name || 'Unnamed kit'}"?`)) {
      return
    }
    try {
      setKitTypeForms((prev) => prev.map((item) => (item.id === row.id ? { ...item, isSaving: true, error: null } : item)))
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }
      const response = await fetch(`/api/study-kit-types?id=${row.id}&study_id=${studyId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete kit type.')
      }
      await refreshKitTypes()
      setNotice({ type: 'success', message: 'Kit type deleted.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete kit type.'
      setKitTypeForms((prev) => prev.map((item) => (item.id === row.id ? { ...item, error: message, isSaving: false } : item)))
      setNotice({ type: 'error', message })
    }
  }

  const handleCreateKitType = async () => {
    if (!studyId || studyId === 'all') return
    if (!newKitTypeForm.name.trim()) {
      setNewKitTypeForm((prev) => ({ ...prev, error: 'Name is required.' }))
      return
    }
    try {
      setNewKitTypeForm((prev) => ({ ...prev, isSaving: true, error: null }))
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }
      const response = await fetch('/api/study-kit-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          study_id: studyId,
          name: newKitTypeForm.name.trim(),
          description: sanitizeNotes(newKitTypeForm.description) ?? null,
          is_active: newKitTypeForm.isActive
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create kit type.')
      }
      await refreshKitTypes()
      setNotice({ type: 'success', message: 'Kit type created.' })
      setNewKitTypeForm({ name: '', description: '', isActive: true, isSaving: false, error: null })
      setNewKitTypeOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create kit type.'
      setNewKitTypeForm((prev) => ({ ...prev, error: message }))
      setNotice({ type: 'error', message })
    } finally {
      setNewKitTypeForm((prev) => ({ ...prev, isSaving: false }))
    }
  }

  const handleCancelNewKitType = () => {
    if (newKitTypeForm.isSaving) return
    setNewKitTypeForm({ name: '', description: '', isActive: true, isSaving: false, error: null })
    setNewKitTypeOpen(false)
  }

  if (!studyId || studyId === 'all') {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center text-gray-400">
        Select a specific study to configure lab kit settings.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center text-gray-400">
        Loading lab kit settings...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-10 space-y-4">
        <div className="text-red-300 font-semibold">{error}</div>
        <button
          onClick={() => {
            setRefreshing(true)
            loadSettings()
          }}
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {refreshing ? 'Refreshing…' : 'Retry'}
        </button>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center text-gray-400">
        No lab kit settings found for this study.
      </div>
    )
  }

  const availableOverrides = overrideForms.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Lab Kit Settings</h2>
          <p className="text-sm text-gray-400">Tune predictive ordering buffers and automate lead-time planning.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRecomputeRecommendations}
            className="inline-flex items-center gap-2 rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
            disabled={recomputing}
          >
            {recomputing ? 'Recomputing…' : 'Recompute Recommendations'}
          </button>
          <button
            onClick={() => {
              setRefreshing(true)
              loadSettings()
            }}
            className="inline-flex items-center gap-2 rounded border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            notice.type === 'success'
              ? 'border-green-500/40 bg-green-500/10 text-green-100'
              : 'border-red-500/40 bg-red-500/10 text-red-100'
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Study Defaults</h3>
            <p className="text-sm text-gray-400">Set the baseline safety stock, timing buffers, and automation behaviour used across all kits before overrides apply.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Last updated {formatRelativeTime(snapshot.defaults.updatedAt)}</span>
            <button
              onClick={handleResetDefaults}
              className="rounded border border-gray-600 px-3 py-1 text-xs font-semibold text-gray-300 hover:border-gray-400"
              disabled={!defaultsDirty || defaultsSaving}
            >
              Reset
            </button>
            <button
              onClick={handleSaveDefaults}
              disabled={!defaultsDirty || defaultsSaving}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {defaultsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              Minimum On-Hand Kits
              <InfoTooltip
                title="Minimum On-Hand"
                description="Safety stock target to keep available after scheduled visits are fulfilled."
                example="Increase from 2 to 5 so coordinators never dip below five kits even after busy weeks."
                useCase="Helpful when vendors have erratic shipping or when a study requires immediate replacements."
              />
            </span>
            <input
              type="number"
              min={0}
              value={defaultsForm.minOnHand}
              onChange={(event) => handleDefaultsChange('minOnHand', event.target.value)}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              Buffer Days
              <InfoTooltip
                title="Buffer Days"
                description="Adds extra days to the visit window when calculating demand, absorbing reschedules."
                example="Bumping 3 → 7 pads the forecast by an extra four days of kits."
                useCase="Use when a site routinely shifts visits to later dates and you want advance warning."
              />
            </span>
            <input
              type="number"
              min={0}
              value={defaultsForm.bufferDays}
              onChange={(event) => handleDefaultsChange('bufferDays', event.target.value)}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              Lead Time (days)
              <InfoTooltip
                title="Lead Time"
                description="Average vendor turnaround. Drives the “order-by” date inside recommendations."
                example="Set to 10 so alerts trigger ten days before you would run out." 
                useCase="Match the supplier SLA so coordinators know exactly when to place orders."
              />
            </span>
            <input
              type="number"
              min={0}
              value={defaultsForm.leadTimeDays}
              onChange={(event) => handleDefaultsChange('leadTimeDays', event.target.value)}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-3 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={defaultsForm.autoOrderEnabled}
              onChange={(event) => handleDefaultsChange('autoOrderEnabled', event.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
            />
            <span className="flex items-center gap-2">
              Auto-order enabled by default
              <InfoTooltip
                title="Auto-Order Default"
                description="Signals automation that kits matching this default can be queued automatically."
                example="Enable for vendor-consigned kits so nightly jobs can pre-stage orders."
                useCase="Ideal when procurement wants hands-off ordering for low-risk kits."
              />
            </span>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              Inventory Buffer Days
              <InfoTooltip
                title="Inventory Buffer Days"
                description="Extends the forecast horizon by a fixed number of days."
                example="Setting 0 → 5 adds five days of demand before a deficit occurs."
                useCase="When you want more lead time during major holidays or courier slow-downs."
              />
            </span>
            <input
              type="number"
              min={0}
              value={defaultsForm.inventoryBufferDays}
              onChange={(event) => handleDefaultsChange('inventoryBufferDays', event.target.value)}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              Inventory Buffer Kits
              <InfoTooltip
                title="Inventory Buffer Kits"
                description="Adds a static number of spare kits to every forecast calculation."
                example="Set to 3 so the system always plans to keep three extras on hand."
                useCase="Ideal when a study requires emergency backup kits for subject safety."
              />
            </span>
            <input
              type="number"
              min={0}
              value={defaultsForm.inventoryBufferKits}
              onChange={(event) => handleDefaultsChange('inventoryBufferKits', event.target.value)}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
            Notes
            <InfoTooltip
              title="Notes"
              description="Free-form guidance for teammates adjusting settings later."
              example="Add vendor contact info or instructions to ship with dry ice."
              useCase="Keeps operational context in one place for audits and handoffs."
            />
          </span>
          <textarea
            rows={3}
            value={defaultsForm.notes}
            onChange={(event) => handleDefaultsChange('notes', event.target.value)}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            placeholder="Operational notes, vendor lead times, or buffer rationale"
          />
        </label>
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Kit Overrides</h3>
            <p className="text-sm text-gray-400">Fine tune targets for specific kit types to reflect vendor SLAs or site nuances.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{availableOverrides === 1 ? '1 override configured' : `${availableOverrides} overrides configured`}</span>
            <button
              onClick={() => setNewOverrideOpen(true)}
              disabled={availableKitTypes.length === 0 || newOverrideOpen}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              Add Override
            </button>
          </div>
        </div>

        {overrideForms.length === 0 ? (
          <div className="rounded border border-dashed border-gray-700 bg-gray-900/30 p-8 text-center text-gray-400 text-sm">
            No kit-specific overrides yet. Configure kit types in the Schedule of Events and add overrides to tailor forecasting.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 text-sm">
              <thead className="bg-gray-900/60 text-gray-300">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold">Kit Type</th>
                  <th className="px-4 py-2 font-semibold">Min On-Hand</th>
                  <th className="px-4 py-2 font-semibold">Buffer Days</th>
                  <th className="px-4 py-2 font-semibold">Lead Time</th>
                  <th className="px-4 py-2 font-semibold">Auto-Order</th>
                  <th className="px-4 py-2 font-semibold">Notes</th>
                  <th className="px-4 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {overrideForms.map((row) => (
                  <tr key={row.id} className="align-top text-gray-200">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{row.kitTypeName || 'Unnamed kit type'}</div>
                      {!row.kitTypeName && (
                        <div className="text-xs text-gray-500">{row.kitTypeId}</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">Last updated {formatRelativeTime(row.updatedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        value={row.minOnHand}
                        onChange={(event) => handleOverrideFieldChange(row.id, 'minOnHand', event.target.value)}
                        className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        value={row.bufferDays}
                        onChange={(event) => handleOverrideFieldChange(row.id, 'bufferDays', event.target.value)}
                        className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        value={row.leadTimeDays}
                        onChange={(event) => handleOverrideFieldChange(row.id, 'leadTimeDays', event.target.value)}
                        className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.autoOrderEnabled}
                          onChange={(event) => handleOverrideFieldChange(row.id, 'autoOrderEnabled', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-400">Enable</span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        rows={2}
                        value={row.notes}
                        onChange={(event) => handleOverrideFieldChange(row.id, 'notes', event.target.value)}
                        className="w-full min-w-[180px] rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white focus:border-blue-500 focus:outline-none"
                        placeholder="Optional notes"
                      />
                      <p className="mt-1 text-xs text-gray-500">Describe unique handling, expiry, or ordering instructions for this kit.</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2 text-xs">
                        <button
                          onClick={() => handleSaveOverride(row)}
                          disabled={!row.isDirty || row.isSaving}
                          className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                        >
                          {row.isSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => handleDeleteOverride(row)}
                          disabled={row.isSaving}
                          className="rounded border border-red-500/50 px-3 py-1 font-semibold text-red-200 hover:border-red-400 hover:text-red-100 disabled:opacity-40"
                        >
                          Delete
                        </button>
                        {row.error && (
                          <div className="text-red-300">{row.error}</div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {newOverrideOpen && (
          <div className="rounded border border-gray-700 bg-gray-900/40 p-4 text-sm text-gray-200 space-y-3">
            <div className="font-semibold text-gray-100">New Override</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-gray-300">Kit Type</span>
                <select
                  value={newOverrideForm.kitTypeId}
                  onChange={(event) => setNewOverrideForm((prev) => ({ ...prev, kitTypeId: event.target.value, error: null }))}
                  className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select kit type…</option>
                  {availableKitTypes.map((kitType) => (
                    <option key={kitType.id} value={kitType.id}>
                      {kitType.name || 'Unnamed kit'} {kitType.is_active === false ? '(inactive)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-gray-300">
                  Min On-Hand
                  <InfoTooltip
                    title="Override Min On-Hand"
                    description="Replaces the study-wide safety stock for this specific kit."
                    example="Increase 1 → 4 when a fragile kit needs more cushion."
                    useCase="Helps adjust for kits with higher breakage or slow refurb cycles."
                  />
                </span>
                <input
                  type="number"
                  min={0}
                  value={newOverrideForm.minOnHand}
                  onChange={(event) => setNewOverrideForm((prev) => ({ ...prev, minOnHand: event.target.value }))}
                  className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-gray-300">
                  Buffer Days
                  <InfoTooltip
                    title="Override Buffer Days"
                    description="Adds or removes scheduling slack for this kit alone."
                    example="Set to 7 when the vendor is routinely late so forecasts warn earlier."
                    useCase="Useful when only one kit type is supply constrained."
                  />
                </span>
                <input
                  type="number"
                  min={0}
                  value={newOverrideForm.bufferDays}
                  onChange={(event) => setNewOverrideForm((prev) => ({ ...prev, bufferDays: event.target.value }))}
                  className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-gray-300">
                  Lead Time (days)
                  <InfoTooltip
                    title="Override Lead Time"
                    description="Kit-specific turnaround used when the vendor SLA differs from the default."
                    example="Set to 14 for cold-chain shipments that need two weeks to prep."
                    useCase="Ensures recommendations respect kit-specific shipping realities."
                  />
                </span>
                <input
                  type="number"
                  min={0}
                  value={newOverrideForm.leadTimeDays}
                  onChange={(event) => setNewOverrideForm((prev) => ({ ...prev, leadTimeDays: event.target.value }))}
                  className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={newOverrideForm.autoOrderEnabled}
                  onChange={(event) => setNewOverrideForm((prev) => ({ ...prev, autoOrderEnabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                />
                <span className="flex items-center gap-2">
                  Auto-Order Enabled
                  <InfoTooltip
                    title="Override Auto-Order"
                    description="Flag this kit for automation even if the study default is off."
                    example="Enable for blood draw kits vendor-managed separately."
                    useCase="Use when only specific kits should bypass manual approval."
                  />
                </span>
              </label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-gray-300">
                Notes
                <InfoTooltip
                  title="Override Notes"
                  description="Document the reasoning behind this kit-specific change."
                  example="Vendor limits allocation to five kits per month; keep buffer at 5."
                  useCase="Provides auditors and teammates clarity on special handling."
                />
              </span>
              <textarea
                rows={2}
                value={newOverrideForm.notes}
                onChange={(event) => setNewOverrideForm((prev) => ({ ...prev, notes: event.target.value }))}
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="Optional override notes"
              />
            </label>
            {newOverrideForm.error && (
              <div className="text-red-300">{newOverrideForm.error}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateOverride}
                disabled={newOverrideForm.isSaving}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {newOverrideForm.isSaving ? 'Saving…' : 'Save override'}
              </button>
              <button
                onClick={handleCancelNewOverride}
                disabled={newOverrideForm.isSaving}
                className="rounded border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Kit Catalog</h3>
            <p className="text-sm text-gray-400">Create, update, or retire kit definitions. Overrides and ordering workflows reference this list.</p>
          </div>
          <button
            onClick={() => setNewKitTypeOpen(true)}
            disabled={newKitTypeOpen}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            New Kit Type
          </button>
        </div>

        {kitTypeForms.length === 0 && !newKitTypeOpen ? (
          <div className="rounded border border-dashed border-gray-700 bg-gray-900/30 p-8 text-center text-gray-400 text-sm">
            No kit types defined yet. Add at least one so visits, overrides, and orders can reference the correct kit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 text-sm">
              <thead className="bg-gray-900/60 text-gray-300">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Description</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {kitTypeForms.map((row) => (
                  <tr key={row.id} className="align-top text-gray-200">
                    <td className="px-4 py-3">
                      {row.mode === 'edit' ? (
                        <label className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(event) => handleKitTypeFieldChange(row.id, 'name', event.target.value)}
                            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                          />
                          <span className="text-xs text-gray-500">Shown throughout the app. Use a study-friendly name.</span>
                        </label>
                      ) : (
                        <div>
                          <div className="font-semibold text-white">{row.name || 'Unnamed kit'}</div>
                          <div className="text-xs text-gray-500">ID: {row.id}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.mode === 'edit' ? (
                        <textarea
                          rows={2}
                          value={row.description}
                          onChange={(event) => handleKitTypeFieldChange(row.id, 'description', event.target.value)}
                          className="w-full min-w-[200px] rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                          placeholder="Optional summary, contents, or handling notes"
                        />
                      ) : (
                        <div className="text-gray-300 whitespace-pre-wrap">{row.description || <span className="text-gray-500">—</span>}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.mode === 'edit' ? (
                        <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(event) => handleKitTypeFieldChange(row.id, 'isActive', event.target.checked)}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                          />
                          Active (available for overrides and orders)
                        </label>
                      ) : (
                        <span className={row.isActive ? 'text-green-300 text-sm' : 'text-yellow-400 text-sm'}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2 text-xs">
                        {row.mode === 'edit' ? (
                          <>
                            <button
                              onClick={() => handleSaveKitType(row)}
                              disabled={row.isSaving}
                              className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                            >
                              {row.isSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => handleCancelKitType(row.id)}
                              disabled={row.isSaving}
                              className="rounded border border-gray-600 px-3 py-1 font-semibold text-gray-200 hover:border-gray-400"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditKitType(row.id)}
                              className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteKitType(row)}
                              className="rounded border border-red-500/50 px-3 py-1 font-semibold text-red-200 hover:border-red-400 hover:text-red-100"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {row.error && <div className="text-red-300">{row.error}</div>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {newKitTypeOpen && (
          <div className="rounded border border-gray-700 bg-gray-900/40 p-4 text-sm text-gray-200 space-y-3">
            <div className="font-semibold text-gray-100">New Kit Type</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-gray-300">Name</span>
                <input
                  type="text"
                  value={newKitTypeForm.name}
                  onChange={(event) => setNewKitTypeForm((prev) => ({ ...prev, name: event.target.value, error: null }))}
                  className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. CBC Panel Kit"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={newKitTypeForm.isActive}
                  onChange={(event) => setNewKitTypeForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                />
                Active (available for overrides and orders)
              </label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-gray-300">Description</span>
              <textarea
                rows={2}
                value={newKitTypeForm.description}
                onChange={(event) => setNewKitTypeForm((prev) => ({ ...prev, description: event.target.value }))}
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="Optional notes—contents, storage requirements, vendor details"
              />
            </label>
            {newKitTypeForm.error && <div className="text-red-300 text-sm">{newKitTypeForm.error}</div>}
            <div className="flex gap-2">
              <button
                onClick={handleCreateKitType}
                disabled={newKitTypeForm.isSaving}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {newKitTypeForm.isSaving ? 'Saving…' : 'Save kit type'}
              </button>
              <button
                onClick={handleCancelNewKitType}
                disabled={newKitTypeForm.isSaving}
                className="rounded border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
