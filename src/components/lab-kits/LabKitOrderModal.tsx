'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '@/lib/supabase/client'

interface LabKitOrderModalProps {
  studyId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: (message?: string) => Promise<void> | void
  orderId?: string
  defaultKitTypeId?: string | null
  defaultKitTypeName?: string | null
  defaultQuantity?: number
  defaultVendor?: string
  defaultExpectedArrival?: string
  defaultNotes?: string
  allowKitTypeChange?: boolean
  deficitSummary?: {
    original: number
    outstanding: number
    pending: number
  } | null
}

interface KitTypeOption {
  id: string
  name: string
  isActive: boolean
}

const MAX_NOTES_LENGTH = 500

export default function LabKitOrderModal({
  studyId,
  isOpen,
  onClose,
  onSuccess,
  defaultKitTypeId,
  defaultKitTypeName,
  defaultQuantity,
  defaultVendor,
  defaultExpectedArrival,
  defaultNotes,
  orderId,
  allowKitTypeChange = false,
  deficitSummary = null
}: LabKitOrderModalProps) {
  const [kitTypes, setKitTypes] = useState<KitTypeOption[]>([])
  const [kitTypeId, setKitTypeId] = useState<string | ''>(defaultKitTypeId || '')
  const [quantityInput, setQuantityInput] = useState<string>(() => {
    const preset = defaultQuantity && defaultQuantity > 0 ? defaultQuantity : 1
    return String(preset)
  })
  const [vendor, setVendor] = useState<string>(defaultVendor || '')
  const [expectedArrival, setExpectedArrival] = useState<string>(defaultExpectedArrival || '')
  const [notes, setNotes] = useState<string>(defaultNotes || '')
  const [loadingOptions, setLoadingOptions] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const isLockedKitType = !allowKitTypeChange && !!defaultKitTypeId
  const isEditing = Boolean(orderId)

  const handleClose = useCallback(() => {
    if (submitting) return
    onClose()
  }, [onClose, submitting])

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSubmitting(false)
    // Reset to defaults when modal opens
    setKitTypeId(defaultKitTypeId || '')
    setQuantityInput(String(defaultQuantity && defaultQuantity > 0 ? defaultQuantity : 1))
    setVendor(defaultVendor || '')
    setExpectedArrival(defaultExpectedArrival || '')
    setNotes(defaultNotes || '')
  }, [isOpen, defaultKitTypeId, defaultQuantity, defaultVendor, defaultExpectedArrival, defaultNotes])

  useEffect(() => {
    if (!isOpen || !allowKitTypeChange) return
    let cancelled = false

    async function loadKitTypes() {
      try {
        setLoadingOptions(true)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          setError('Authentication required. Please sign in again.')
          return
        }
        const response = await fetch(`/api/study-kit-types?study_id=${studyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load kit types')
        }

        if (cancelled) return
        const payload = await response.json()
        const options = Array.isArray(payload?.kitTypes)
          ? payload.kitTypes.map((kt: any) => ({
              id: kt.id,
              name: kt.name || 'Unnamed kit type',
              isActive: kt.is_active !== false
            }))
          : []
        setKitTypes(options)
        if (!defaultKitTypeId && options.length > 0) {
          setKitTypeId(options[0].id)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load kit types.')
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false)
        }
      }
    }

    loadKitTypes()

    return () => {
      cancelled = true
    }
  }, [isOpen, allowKitTypeChange, studyId, defaultKitTypeId])

  const kitTypeLabel = useMemo(() => {
    if (defaultKitTypeName) return defaultKitTypeName
    if (!kitTypeId) return ''
    const option = kitTypes.find(kt => kt.id === kitTypeId)
    return option ? option.name : ''
  }, [defaultKitTypeName, kitTypeId, kitTypes])

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const parsedQuantity = Number.parseInt(quantityInput, 10)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Quantity must be a positive integer.')
      return
    }

    const resolvedKitTypeId = isLockedKitType ? defaultKitTypeId : kitTypeId
    if (!resolvedKitTypeId) {
      setError('Select a kit type before ordering.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const payload = {
        studyId,
        kitTypeId: resolvedKitTypeId,
        quantity: parsedQuantity,
        vendor: vendor.trim() || null,
        expectedArrival: expectedArrival || null,
        notes: notes.trim() ? notes.trim().slice(0, MAX_NOTES_LENGTH) : null
      }

      const endpoint = isEditing ? `/api/lab-kit-orders/${orderId}` : '/api/lab-kit-orders'
      const method = isEditing ? 'PATCH' : 'POST'

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || (isEditing ? 'Failed to update lab kit order' : 'Failed to create lab kit order'))
      }

      const successMessage = isEditing
        ? 'Order updated.'
        : `Order placed for ${parsedQuantity} kit${parsedQuantity === 1 ? '' : 's'}.`

      await onSuccess?.(successMessage)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEditing ? 'Failed to update lab kit order.' : 'Failed to create lab kit order.'))
    } finally {
      setSubmitting(false)
    }
  }, [submitting, quantityInput, isLockedKitType, defaultKitTypeId, kitTypeId, vendor, expectedArrival, notes, studyId, onSuccess, handleClose, isEditing, orderId])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-700 px-5 py-4">
          <div>
            <h4 className="text-lg font-semibold text-white">{isEditing ? 'Edit kit order' : 'Order kits'}</h4>
            <p className="text-xs text-gray-400">{kitTypeLabel || 'Select kit type'}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white text-sm">Close</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {deficitSummary && (
            <div className="rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs text-gray-300">
              <div>Original deficit: {deficitSummary.original}</div>
              <div>Outstanding now: {deficitSummary.outstanding}</div>
              <div>Pending orders: {deficitSummary.pending}</div>
            </div>
          )}

          {allowKitTypeChange ? (
            <label className="block text-sm text-gray-200">
              Kit type
              <select
                value={kitTypeId}
                onChange={event => setKitTypeId(event.target.value)}
                disabled={loadingOptions}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {kitTypes.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}{option.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="text-sm text-gray-200">
              <div className="text-xs text-gray-400 mb-1">Kit type</div>
              <div>{kitTypeLabel || '—'}</div>
            </div>
          )}

          <label className="block text-sm text-gray-200">
            Quantity
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={quantityInput}
              onChange={event => setQuantityInput(event.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm text-gray-200">
            Vendor (optional)
            <input
              type="text"
              value={vendor}
              onChange={event => setVendor(event.target.value)}
              placeholder="e.g. Central Lab"
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm text-gray-200">
            Expected arrival (optional)
            <input
              type="date"
              value={expectedArrival}
              onChange={event => setExpectedArrival(event.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm text-gray-200">
            Notes (optional)
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              maxLength={MAX_NOTES_LENGTH}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          {error && <div className="text-sm text-red-400">{error}</div>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-gray-300 hover:text-white"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (allowKitTypeChange && loadingOptions)}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            >
              {submitting ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
