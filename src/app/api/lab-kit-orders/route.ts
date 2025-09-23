import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { LabKitOrderInsert } from '@/types/database'

const ALLOWED_STATUSES = new Set(['pending', 'received', 'cancelled'])

const MAX_NOTES_LENGTH = 1000

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyIdParam = searchParams.get('studyId') || searchParams.get('study_id')
    const statusFilter = searchParams.get('status')
    const searchTerm = searchParams.get('search')?.trim() || ''

    if (!studyIdParam) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    if (statusFilter && !ALLOWED_STATUSES.has(statusFilter)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }
    const supabase = createSupabaseAdmin()

    let accessibleStudyIds: string[] = []

    if (studyIdParam === 'all') {
      const [{ data: siteRows, error: siteError }, { data: ownedRows, error: ownedError }] = await Promise.all([
        supabase
          .from('site_members')
          .select('site_id')
          .eq('user_id', user.id),
        supabase
          .from('studies')
          .select('id, site_id')
          .eq('user_id', user.id)
      ])

      if (siteError) {
        logger.error('lab-kit-orders:list failed to load site memberships', siteError, { userId: user.id })
        return NextResponse.json({ error: 'Failed to load lab kit orders' }, { status: 500 })
      }
      if (ownedError) {
        logger.error('lab-kit-orders:list failed to load owned studies', ownedError, { userId: user.id })
        return NextResponse.json({ error: 'Failed to load lab kit orders' }, { status: 500 })
      }

      const siteIds = Array.from(new Set((siteRows || []).map((row: any) => (row?.site_id ?? '').toString()).filter(Boolean)))
      const accessibleSet = new Set<string>((ownedRows || []).map((row: any) => row?.id).filter(Boolean))

      if (siteIds.length > 0) {
        const { data: siteStudies, error: siteStudiesError } = await supabase
          .from('studies')
          .select('id')
          .in('site_id', siteIds)

        if (siteStudiesError) {
          logger.error('lab-kit-orders:list failed to load studies for sites', siteStudiesError, { siteIds, userId: user.id })
          return NextResponse.json({ error: 'Failed to load lab kit orders' }, { status: 500 })
        }

        for (const row of siteStudies || []) {
          const id = (row as any)?.id
          if (typeof id === 'string') {
            accessibleSet.add(id)
          }
        }
      }

      accessibleStudyIds = Array.from(accessibleSet)

      if (accessibleStudyIds.length === 0) {
        return NextResponse.json({ orders: [] })
      }
    } else {
      const membership = await verifyStudyMembership(studyIdParam, user.id)
      if (!membership.success) {
        return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
      }
      accessibleStudyIds = [studyIdParam]
    }

    let query = (supabase
      .from('lab_kit_orders')
      .select('id, study_id, kit_type_id, quantity, vendor, expected_arrival, status, notes, created_by, created_at, updated_at, received_date')
      .in('study_id', accessibleStudyIds)
      .order('created_at', { ascending: false })) as any

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    if (searchTerm) {
      // Match vendor or notes text
      query = (query as any).or(
        [
          `vendor.ilike.%${searchTerm}%`,
          `notes.ilike.%${searchTerm}%`
        ].join(',')
      )
    }

    const { data: orderRows, error: ordersError } = await query
    if (ordersError) {
      logger.error('lab-kit-orders:list failed to load orders', ordersError, { studyId: studyIdParam, userId: user.id })
      return NextResponse.json({ error: 'Failed to load lab kit orders' }, { status: 500 })
    }

    const orders = (orderRows as any[]) || []
    if (orders.length === 0) {
      return NextResponse.json({ orders: [] })
    }

    const kitTypeMap = new Map<string, { id: string; name: string | null }>()
    const { data: kitTypes, error: kitTypeError } = await supabase
      .from('study_kit_types')
      .select('id, name')
      .in('study_id', accessibleStudyIds)

    if (kitTypeError) {
      logger.warn('lab-kit-orders:list failed to load kit type metadata', { studyId: studyIdParam, error: kitTypeError })
    } else {
      for (const row of kitTypes || []) {
        kitTypeMap.set((row as any).id as string, { id: (row as any).id as string, name: (row as any).name ?? null })
      }
    }

    const studyMetaMap = new Map<string, { protocol_number: string | null; study_title: string | null }>()
    const { data: studyMetaRows, error: studyMetaError } = await supabase
      .from('studies')
      .select('id, protocol_number, study_title')
      .in('id', accessibleStudyIds)

    if (studyMetaError) {
      logger.warn('lab-kit-orders:list failed to load study metadata', { studyId: studyIdParam, error: studyMetaError })
    } else {
      for (const row of studyMetaRows || []) {
        const id = (row as any)?.id
        if (typeof id === 'string') {
          studyMetaMap.set(id, {
            protocol_number: (row as any)?.protocol_number ?? null,
            study_title: (row as any)?.study_title ?? null
          })
        }
      }
    }

    const creatorIds = Array.from(
      new Set(
        orders
          .map((row) => {
            const creator = row?.created_by
            return typeof creator === 'string' && creator.trim() ? creator : null
          })
          .filter(Boolean) as string[]
      )
    )

    const profileMap = new Map<string, { id: string; full_name: string | null; email: string | null }>()

    if (creatorIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', creatorIds)

      if (profileError) {
        logger.warn('lab-kit-orders:list failed to load creator profiles', { studyId: studyIdParam, error: profileError })
      } else {
        for (const profile of profiles || []) {
          const id = (profile as any)?.id
          if (typeof id === 'string') {
            profileMap.set(id, {
              id,
              full_name: (profile as any)?.full_name ?? null,
              email: (profile as any)?.email ?? null
            })
          }
        }
      }
    }

    const enriched = orders.map((order: any) => ({
      ...order,
      kit_type_name: order.kit_type_id ? kitTypeMap.get(order.kit_type_id)?.name ?? null : null,
      created_by_profile: order.created_by ? profileMap.get(order.created_by) ?? null : null,
      study_protocol_number: studyMetaMap.get(order.study_id)?.protocol_number ?? null,
      study_title: studyMetaMap.get(order.study_id)?.study_title ?? null
    }))

    return NextResponse.json({ orders: enriched })
  } catch (error) {
    logger.error('lab-kit-orders:list unexpected error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
