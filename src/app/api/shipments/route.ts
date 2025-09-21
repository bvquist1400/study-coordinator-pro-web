import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { fetchShipmentsForStudies } from '@/lib/lab-kits/fetch-shipments'

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

    try {
      const shipments = await fetchShipmentsForStudies(supabase, [studyId])
      return NextResponse.json({ shipments })
    } catch (error) {
      logger.error('Shipments list error', error as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }
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
    const { labKitIds, accessionNumbers, airwayBillNumber, carrier = 'fedex', shippedDate, studyId } = body || {}

    if ((!Array.isArray(labKitIds) || labKitIds.length === 0) && (!Array.isArray(accessionNumbers) || accessionNumbers.length === 0)) {
      return NextResponse.json({ error: 'Provide labKitIds or accessionNumbers' }, { status: 400 })
    }
    if (!airwayBillNumber || !String(airwayBillNumber).trim()) {
      return NextResponse.json({ error: 'airwayBillNumber is required' }, { status: 400 })
    }
    // studyId is optional for cross-study shipments

    // Verify access to study (skip for cross-study shipments)
    if (studyId) {
      const membership = await verifyStudyMembership(studyId, user.id)
      if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()

    const kitIds = Array.isArray(labKitIds) ? labKitIds : []
    const accNums = Array.isArray(accessionNumbers) ? accessionNumbers.map((s: string) => String(s).trim()).filter(Boolean) : []

    // Ensure lab kits by ID are eligible (and belong to study if specified)
    let kitsQuery = supabase
      .from('lab_kits')
      .select('id, study_id, status, accession_number')
      .in('id', kitIds.length > 0 ? kitIds : ['00000000-0000-0000-0000-000000000000'])
    
    if (studyId) {
      kitsQuery = kitsQuery.eq('study_id', studyId)
    }
    
    const { data: kits, error: kitsErr } = await kitsQuery
    if (kitsErr) {
      logger.error('Verify kits error', kitsErr as any)
      return NextResponse.json({ error: 'Failed to verify lab kits' }, { status: 500 })
    }
    if (kitIds.length > 0) {
      if (!kits || kits.length !== kitIds.length) {
        return NextResponse.json({ error: studyId ? 'Some lab kits not found in this study' : 'Some lab kits not found' }, { status: 400 })
      }
      const invalid = kits.filter((k: any) => k.status !== 'pending_shipment')
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'Only pending_shipment lab kits can be shipped' }, { status: 400 })
      }
      
      // For cross-study shipments, verify user has access to all involved studies
      if (!studyId) {
        const involvedStudyIds = [...new Set(kits.map((k: any) => k.study_id))]
        for (const sid of involvedStudyIds) {
          const membership = await verifyStudyMembership(sid, user.id)
          if (!membership.success) {
            return NextResponse.json({ error: `Access denied to study involved in this shipment` }, { status: 403 })
          }
        }
      }
    }

    // Prepare lookup by accession number for visit linking and for accNums
    const kitsByAcc = new Map<string, any>((kits || []).map((k: any) => [k.accession_number, k]))
    let accLookup: any[] = []
    if (accNums.length > 0) {
      const { data: foundByAcc, error: accErr } = await supabase
        .from('lab_kits')
        .select('id, study_id, status, accession_number')
        .in('accession_number', accNums)
      if (accErr) {
        logger.error('Lookup kits by accession error', accErr as any)
        return NextResponse.json({ error: 'Failed to verify lab kits by accession' }, { status: 500 })
      }
      accLookup = foundByAcc || []
      for (const k of accLookup) kitsByAcc.set(k.accession_number as string, k)

      // Ensure all provided accession numbers map to known lab kits for backward-compatible schema
      const missing = accNums.filter(acc => !kitsByAcc.has(acc))
      if (missing.length > 0) {
        return NextResponse.json({ error: `Unknown accession numbers: ${missing.join(', ')}` }, { status: 400 })
      }
    }

    // Insert shipments
    const rowsFromIds = kitIds.map((id: string) => ({
      lab_kit_id: id,
      accession_number: null,
      airway_bill_number: String(airwayBillNumber).trim(),
      carrier,
      shipped_date: shippedDate || null,
      tracking_status: 'shipped'
    }))
    const rowsFromAcc = accNums.map((acc: string) => {
      const k = kitsByAcc.get(acc)
      return {
        lab_kit_id: (k?.id as string),
        accession_number: acc,
        airway_bill_number: String(airwayBillNumber).trim(),
        carrier,
        shipped_date: shippedDate || null,
        tracking_status: 'shipped'
      }
    })
    const rows = [...rowsFromIds, ...rowsFromAcc]
    const { data: inserted, error: insErr } = await supabase
      .from('lab_kit_shipments')
      // @ts-expect-error dynamic insert array
      .insert(rows)
      .select('id, lab_kit_id, accession_number, airway_bill_number, carrier, shipped_date, tracking_status')
    if (insErr) {
      logger.error('Insert shipments error', insErr as any)
      return NextResponse.json({ error: 'Failed to create shipments', detail: (insErr as any).message || String(insErr) }, { status: 500 })
    }

    // Update lab kits to shipped for ID-based entries
    if (kitIds.length > 0) {
      const { error: updErr } = await supabase
        .from('lab_kits')
        // @ts-expect-error update object
        .update({ status: 'shipped' })
        .in('id', kitIds)
      if (updErr) {
        logger.error('Update lab kits to shipped error', updErr as any)
      }
    }

    // Link to visits by accession number and set visit shipped date
    const shipDateToSet = shippedDate || new Date().toISOString().slice(0,10)
    for (const s of inserted || []) {
      const acc = (s as any).accession_number || (kitsByAcc as any).get((s as any).lab_kit_id)?.accession_number
      if (!acc) continue
      const { data: visit } = await supabase
        .from('subject_visits')
        .select('id')
        .eq('accession_number', acc)
        .order('visit_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const visitId = (visit as any)?.id
      if (visitId) {
        await (supabase as any)
          .from('lab_kit_shipments')
          .update({ subject_visit_id: visitId } as any)
          .eq('id', (s as any).id)
        await (supabase as any)
          .from('subject_visits')
          .update({ lab_kit_shipped_date: shipDateToSet } as any)
          .eq('id', visitId)
      }
    }

    return NextResponse.json({ shipments: inserted || [] }, { status: 201 })
  } catch (e) {
    logger.error('Shipments POST error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
