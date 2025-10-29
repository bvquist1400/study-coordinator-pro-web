import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { fetchShipmentsForStudies } from '@/lib/lab-kits/fetch-shipments'
import { fetchEasyPostTrackingSummary, EasyPostError } from '@/lib/lab-kits/easypost'
import type { LabKitShipmentUpdate, LabKitUpdate } from '@/types/database'

interface TrackingRefreshRequest {
  shipmentId?: string
  airwayBillNumber?: string
  carrier?: string
}

const TRACKABLE_CARRIERS = new Set([
  'ups',
  'usps',
  'fedex',
  'dhl',
  'dhl_express',
  'canada_post',
  'ontrac',
  'lasership',
  'gls_us',
  'purolator'
])

function normalizeCarrier(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.toLowerCase()
  return normalized === 'other' ? null : normalized
}

type ShipmentRow = {
  id: string
  lab_kit_id: string | null
  accession_number: string | null
  subject_visit_id: string | null
  airway_bill_number: string | null
  carrier: string | null
  tracking_status: string | null
  estimated_delivery: string | null
  actual_delivery: string | null
  lab_kits: { study_id: string | null } | null
  subject_visits: { study_id: string | null } | null
  study_id?: string | null
}

async function resolveStudyIds(supabase: ReturnType<typeof createSupabaseAdmin>, shipments: any[]) {
  const studyIds = new Set<string>()
  const missingAccessions = new Set<string>()

  type LabKitStudyLookup = {
    accession_number: string | null
    study_id: string | null
  }

  for (const shipment of shipments) {
    const studyId = shipment?.lab_kits?.study_id || shipment?.subject_visits?.study_id || shipment?.study_id || null
    if (studyId) {
      studyIds.add(studyId)
    } else if (shipment?.accession_number) {
      missingAccessions.add(shipment.accession_number as string)
    }
  }

  if (missingAccessions.size > 0) {
    const { data: kits, error } = await supabase
      .from('lab_kits')
      .select('accession_number, study_id')
      .in('accession_number', Array.from(missingAccessions))
      .returns<LabKitStudyLookup[]>()

    if (error) {
      logger.error('Tracking refresh unable to resolve accession study', error as any)
      throw new Error('Failed to resolve study for shipment')
    }

    for (const kit of kits || []) {
      if (kit?.study_id) studyIds.add(kit.study_id)
    }
  }

  return Array.from(studyIds)
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const body = (await request.json().catch(() => ({}))) as TrackingRefreshRequest
    const shipmentId = body.shipmentId?.trim()
    const providedAirwayBill = body.airwayBillNumber?.trim()
    const providedCarrier = normalizeCarrier(body.carrier)

    if (!shipmentId && !providedAirwayBill) {
      return NextResponse.json({ error: 'shipmentId or airwayBillNumber is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    const baseQuery = supabase
      .from('lab_kit_shipments')
      .select(`
        id,
        lab_kit_id,
        accession_number,
        subject_visit_id,
        airway_bill_number,
        carrier,
        tracking_status,
        estimated_delivery,
        actual_delivery,
        lab_kits(study_id),
        subject_visits(study_id)
      `)

    const queryWithParams = shipmentId
      ? baseQuery.eq('id', shipmentId)
      : providedAirwayBill
        ? baseQuery.eq('airway_bill_number', providedAirwayBill)
        : baseQuery

    const { data: shipments, error } = await queryWithParams.returns<ShipmentRow[]>()
    if (error) {
      logger.error('Tracking refresh fetch shipment error', error as any)
      return NextResponse.json({ error: 'Failed to fetch shipment' }, { status: 500 })
    }

    if (!shipments || shipments.length === 0) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    const airtWayBill = providedAirwayBill ?? shipments[0]?.airway_bill_number ?? undefined
    if (!airtWayBill) {
      return NextResponse.json({ error: 'Shipment missing airway bill / tracking number' }, { status: 400 })
    }

    const carrier = providedCarrier ?? normalizeCarrier(shipments[0]?.carrier)
    if (!carrier) {
      return NextResponse.json({ error: 'Carrier is required for tracking refresh' }, { status: 400 })
    }

    if (!TRACKABLE_CARRIERS.has(carrier)) {
      return NextResponse.json({ error: `Carrier ${carrier} is not supported for automatic tracking` }, { status: 422 })
    }

    const studyIds = await resolveStudyIds(supabase, shipments)
    if (studyIds.length === 0) {
      return NextResponse.json({ error: 'Cannot determine study for shipment' }, { status: 400 })
    }

    for (const id of studyIds) {
      const membership = await verifyStudyMembership(id, user.id)
      if (!membership.success) {
        return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
      }
    }

    const summary = await fetchEasyPostTrackingSummary(carrier, airtWayBill)

    const updateData: Partial<LabKitShipmentUpdate> = {
      tracking_status: summary.status,
      ups_tracking_payload: summary.rawResponse as any,
      last_tracking_update: summary.lastEventAt ?? new Date().toISOString()
    }

    if (summary.estimatedDelivery !== null) {
      updateData.estimated_delivery = summary.estimatedDelivery
    }
    if (summary.actualDelivery !== null) {
      updateData.actual_delivery = summary.actualDelivery
    }

    const { error: updateError } = await supabase
      .from('lab_kit_shipments')
      .update(updateData)
      .eq('airway_bill_number', airtWayBill)

    if (updateError) {
      logger.error('Tracking refresh update error', updateError as any)
      return NextResponse.json({ error: 'Failed to update shipment tracking' }, { status: 500 })
    }

    if (summary.status === 'delivered') {
      const kitIds = shipments
        .map(s => s?.lab_kit_id as string | null)
        .filter((value): value is string => Boolean(value))
      const accessionNumbers = shipments
        .map(s => s?.accession_number as string | null)
        .filter((value): value is string => Boolean(value))

      const kitUpdate: Partial<LabKitUpdate> = { status: 'delivered', updated_at: new Date().toISOString() }

      if (kitIds.length > 0) {
        const { error: kitErr } = await supabase
          .from('lab_kits')
          .update(kitUpdate)
          .in('id', kitIds)
        if (kitErr) logger.warn?.('Failed to sync lab kit ids after tracking refresh', kitErr as any)
      }

      if (accessionNumbers.length > 0) {
        const { error: accErr } = await supabase
          .from('lab_kits')
          .update(kitUpdate)
          .in('accession_number', accessionNumbers)
        if (accErr) logger.warn?.('Failed to sync lab kits by accession after tracking refresh', accErr as any)
      }
    }

    const refreshed = await fetchShipmentsForStudies(supabase, studyIds)
    const updatedShipments = refreshed.filter(item => item.airway_bill_number === airtWayBill)

    return NextResponse.json({
      shipments: updatedShipments,
      tracking: summary
    })
  } catch (error) {
    if (error instanceof EasyPostError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logger.error('Tracking refresh route error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
