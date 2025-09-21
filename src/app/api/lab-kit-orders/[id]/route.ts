import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { LabKitOrderUpdate } from '@/types/database'

const MAX_NOTES_LENGTH = 1000
const STATUS_SET = new Set(['pending', 'received', 'cancelled'])

const sanitizeText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const parseDateISO = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return trimmed.slice(0, 10)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await context.params
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  }

  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const supabase = createSupabaseAdmin()

    const { data: existingRow, error: fetchError } = await supabase
      .from('lab_kit_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()

    if (fetchError) {
      logger.error('lab-kit-orders:update failed to load order', fetchError, { orderId, userId: user.id })
      return NextResponse.json({ error: 'Failed to load lab kit order' }, { status: 500 })
    }

    if (!existingRow) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const studyId = (existingRow as any).study_id as string
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const body = await request.json().catch(() => ({}))
    const statusRaw = sanitizeText(body?.status)
    const vendor = sanitizeText(body?.vendor)
    const notesRaw = sanitizeText(body?.notes)

    const expectedArrivalInput = body?.expectedArrival
    const expectedArrival = parseDateISO(expectedArrivalInput)
    if (typeof expectedArrivalInput === 'string' && expectedArrivalInput.trim() && expectedArrival === null) {
      return NextResponse.json({ error: 'expectedArrival must be an ISO date (YYYY-MM-DD)' }, { status: 400 })
    }

    const receivedDateInbound = body?.receivedDate
    const receivedDateInput = parseDateISO(receivedDateInbound)
    if (typeof receivedDateInbound === 'string' && receivedDateInbound.trim() && receivedDateInput === null) {
      return NextResponse.json({ error: 'receivedDate must be an ISO date (YYYY-MM-DD)' }, { status: 400 })
    }

    const update: Partial<LabKitOrderUpdate> = {}

    if (statusRaw) {
      if (!STATUS_SET.has(statusRaw)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      update.status = statusRaw as LabKitOrderUpdate['status']
      if (statusRaw === 'received') {
        update.received_date = receivedDateInput ?? new Date().toISOString().slice(0, 10)
      } else {
        update.received_date = null
      }
    }

    if (typeof vendor === 'string') {
      update.vendor = vendor
    }

    if (typeof notesRaw === 'string') {
      update.notes = notesRaw.slice(0, MAX_NOTES_LENGTH)
    }

    if (body?.notes === null) {
      update.notes = null
    }

    if (expectedArrival !== null) {
      update.expected_arrival = expectedArrival
    } else if (body?.expectedArrival === null) {
      update.expected_arrival = null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const { data: updatedRow, error: updateError } = await (supabase as any)
      .from('lab_kit_orders')
      .update(update)
      .eq('id', orderId)
      .select('*')
      .single()

    if (updateError) {
      logger.error('lab-kit-orders:update failed to update', updateError, { orderId, userId: user.id })
      return NextResponse.json({ error: 'Failed to update lab kit order' }, { status: 500 })
    }

    return NextResponse.json({ order: updatedRow })
  } catch (error) {
    logger.error('lab-kit-orders:update unexpected error', error as any, { orderId })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
