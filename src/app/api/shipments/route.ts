import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// GET /api/shipments?studyId=xxx - List shipments for a study (read-only)
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    if (!studyId) return NextResponse.json({ error: 'studyId is required' }, { status: 400 })

    // Verify access to study
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const supabase = createSupabaseAdmin()
    // Join shipments to lab_kits to filter by study
    const { data, error } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, airway_bill_number, carrier, shipped_date, tracking_status,
        lab_kits:lab_kits!inner(id, study_id)
      `)
      .eq('lab_kits.study_id', studyId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Shipments list error', error as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }

    // Map minimal payload
    const shipments = (data || []).map((row: any) => ({
      id: row.id as string,
      airway_bill_number: row.airway_bill_number as string,
      carrier: row.carrier as string,
      shipped_date: row.shipped_date as string | null,
      tracking_status: row.tracking_status as string | null
    }))

    return NextResponse.json({ shipments })
  } catch (e) {
    logger.error('Shipments GET error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/shipments - Create shipments for internal lab kits (minimal)
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const body = await request.json()
    const { labKitIds, airwayBillNumber, carrier = 'fedex', shippedDate, studyId } = body || {}

    if (!Array.isArray(labKitIds) || labKitIds.length === 0) {
      return NextResponse.json({ error: 'labKitIds is required' }, { status: 400 })
    }
    if (!airwayBillNumber || !String(airwayBillNumber).trim()) {
      return NextResponse.json({ error: 'airwayBillNumber is required' }, { status: 400 })
    }
    if (!studyId) {
      return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
    }

    // Verify access to study
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const supabase = createSupabaseAdmin()

    // Ensure lab kits belong to the study and are eligible (status 'used')
    const { data: kits, error: kitsErr } = await supabase
      .from('lab_kits')
      .select('id, study_id, status')
      .in('id', labKitIds)
      .eq('study_id', studyId)
    if (kitsErr) {
      logger.error('Verify kits error', kitsErr as any)
      return NextResponse.json({ error: 'Failed to verify lab kits' }, { status: 500 })
    }
    if (!kits || kits.length !== labKitIds.length) {
      return NextResponse.json({ error: 'Some lab kits not found in this study' }, { status: 400 })
    }
    const invalid = kits.filter((k: any) => k.status !== 'used')
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Only used lab kits can be shipped' }, { status: 400 })
    }

    // Insert shipments
    const rows = labKitIds.map((id: string) => ({
      lab_kit_id: id,
      airway_bill_number: String(airwayBillNumber).trim(),
      carrier,
      shipped_date: shippedDate || null,
      tracking_status: 'shipped'
    }))
    const { data: inserted, error: insErr } = await supabase
      .from('lab_kit_shipments')
      // @ts-expect-error dynamic insert array
      .insert(rows)
      .select('id, airway_bill_number, carrier, shipped_date, tracking_status')
    if (insErr) {
      logger.error('Insert shipments error', insErr as any)
      return NextResponse.json({ error: 'Failed to create shipments' }, { status: 500 })
    }

    // Update lab kits to shipped
    const { error: updErr } = await supabase
      .from('lab_kits')
      // @ts-expect-error update object
      .update({ status: 'shipped' })
      .in('id', labKitIds)
    if (updErr) {
      logger.error('Update lab kits to shipped error', updErr as any)
      // Still return success for created shipments but warn caller
    }

    return NextResponse.json({ shipments: inserted || [] }, { status: 201 })
  } catch (e) {
    logger.error('Shipments POST error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
