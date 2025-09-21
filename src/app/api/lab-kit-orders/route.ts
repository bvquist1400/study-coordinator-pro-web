import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { LabKitOrderInsert } from '@/types/database'

const MAX_NOTES_LENGTH = 1000

const sanitizeText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const parsePositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const parseDateISO = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return trimmed.slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const body = await request.json().catch(() => ({}))
    const studyId: string | undefined = sanitizeText(body?.studyId) || undefined
    const kitTypeId: string | undefined = sanitizeText(body?.kitTypeId) || undefined
    const vendor = sanitizeText(body?.vendor)
    const notesRaw = sanitizeText(body?.notes)
    const expectedArrival = parseDateISO(body?.expectedArrival)
    const quantity = parsePositiveInt(body?.quantity)

    if (!studyId) {
      return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
    }
    if (!kitTypeId) {
      return NextResponse.json({ error: 'kitTypeId is required' }, { status: 400 })
    }
    if (!quantity) {
      return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 })
    }

    const notes = notesRaw?.slice(0, MAX_NOTES_LENGTH) ?? null

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()

    const { data: kitTypeRow, error: kitTypeError } = await supabase
      .from('study_kit_types')
      .select('id, study_id')
      .eq('id', kitTypeId)
      .maybeSingle()

    if (kitTypeError) {
      logger.error('lab-kit-orders:create failed to load kit type', kitTypeError, { kitTypeId, studyId, userId: user.id })
      return NextResponse.json({ error: 'Failed to verify kit type' }, { status: 500 })
    }

    if (!kitTypeRow || (kitTypeRow as any).study_id !== studyId) {
      return NextResponse.json({ error: 'Kit type does not belong to study' }, { status: 400 })
    }

    const insertPayload: LabKitOrderInsert = {
      study_id: studyId,
      kit_type_id: kitTypeId,
      quantity,
      vendor,
      expected_arrival: expectedArrival,
      status: 'pending' as const,
      notes,
      created_by: user.id,
      received_date: null
    }

    const { data: orderRow, error: insertError } = await (supabase as any)
      .from('lab_kit_orders')
      .insert(insertPayload)
      .select('*')
      .single()

    if (insertError) {
      logger.error('lab-kit-orders:create insert failed', insertError, { studyId, kitTypeId, userId: user.id })
      return NextResponse.json({ error: 'Failed to create lab kit order' }, { status: 500 })
    }

    return NextResponse.json({ order: orderRow }, { status: 201 })
  } catch (error) {
    logger.error('lab-kit-orders:create unexpected error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
