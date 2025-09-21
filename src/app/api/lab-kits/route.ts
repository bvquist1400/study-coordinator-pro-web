import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import type { LabKitInsert } from '@/types/database'

// GET /api/lab-kits?studyId=xxx&status=xxx&summary=true - Get lab kits
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    const statusParam = searchParams.get('status')
    // 'summary' parameter is accepted but not used in this endpoint
    
    if (!studyId) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    // Resolve accessible studies
    let studyIds: string[] = []
    if (studyId === 'all') {
      // Gather studies the user can access (owner or site member)
      const { data: siteRows } = await supabase
        .from('site_members')
        .select('site_id')
        .eq('user_id', user.id)
      const siteIds = (siteRows || []).map((r: any) => r.site_id)

      const { data: studiesRows } = await supabase
        .from('studies')
        .select('id, user_id, site_id')
        .or([
          `user_id.eq.${user.id}`,
          siteIds.length > 0 ? `site_id.in.(${siteIds.join(',')})` : ''
        ].filter(Boolean).join(','))

      studyIds = (studiesRows || []).map((s: any) => s.id)
      if (studyIds.length === 0) return NextResponse.json({ labKits: [] })
    } else {
      const membership = await verifyStudyMembership(studyId, user.id)
      if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
      studyIds = [studyId]
    }

    // Auto-expire kits whose expiration_date has passed
    try {
      const today = new Date()
      today.setUTCHours(0,0,0,0)
      const todayISO = today.toISOString().slice(0,10)
      await supabase
        .from('lab_kits')
        // @ts-expect-error string[] for in filter
        .update({ status: 'expired' })
        .lt('expiration_date', todayISO)
        .in('status', ['available','assigned','used','pending_shipment'])
        .in('study_id', studyIds)
    } catch {}

    // Build query with optional join to visit_schedules
    let query = supabase
      .from('lab_kits')
      .select(`
        *,
        visit_schedules(visit_name, visit_number),
        studies(protocol_number, study_title)
      `)
      .in('study_id', studyIds)
      .order('created_at', { ascending: false })

    // Filter by status if provided
    if (statusParam) {
      query = query.eq('status', statusParam)
    }

    const { data: labKits, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch lab kits' }, { status: 500 })
    }

    const kits = labKits || []
    if (kits.length === 0) {
      return NextResponse.json({ labKits: [] })
    }

    const kitIds = Array.from(new Set(kits.map((kit: any) => kit.id).filter(Boolean)))
    const accessionNumbers = Array.from(new Set(kits.map((kit: any) => kit.accession_number).filter(Boolean)))
    const kitTypeIds = Array.from(new Set(kits.map((kit: any) => kit.kit_type_id as string | null).filter(Boolean)))

    const kitTypeInfoById = new Map<string, { id: string; name: string | null; description: string | null; is_active: boolean | null }>()
    if (kitTypeIds.length > 0) {
      const { data: kitTypeRows, error: kitTypeErr } = await supabase
        .from('study_kit_types')
        .select('id, name, description, is_active')
        .in('id', kitTypeIds)

      if (kitTypeErr) {
        console.error('Failed to fetch kit type metadata for lab kits:', kitTypeErr)
      } else {
        for (const row of kitTypeRows || []) {
          kitTypeInfoById.set((row as any).id as string, {
            id: (row as any).id as string,
            name: (row as any).name ?? null,
            description: (row as any).description ?? null,
            is_active: (row as any).is_active ?? null
          })
        }
      }
    }

    // Preload subject assignments by accession number
    const subjectAssignments = new Map<string, any>()
    if (accessionNumbers.length > 0) {
      const { data: subjectRows, error: subjectErr } = await supabase
        .from('subject_visits')
        .select('id, accession_number, visit_name, visit_date, created_at, subject_id, subjects(id, subject_number)')
        .in('accession_number', accessionNumbers)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (subjectErr) {
        console.error('Failed to enrich lab kits with subject assignments:', subjectErr)
      } else {
        for (const row of subjectRows || []) {
          const acc = (row as any).accession_number as string | null
          if (!acc) continue
          if (!subjectAssignments.has(acc)) {
            subjectAssignments.set(acc, {
              visit_id: (row as any).id,
              visit_date: (row as any).visit_date,
              visit_name: (row as any).visit_name ?? null,
              subject_id: (row as any).subject_id,
              subject_number: (row as any).subjects?.subject_number || null
            })
          }
        }
      }
    }

    // Preload latest shipment info per kit/accession
    const shipmentByKitId = new Map<string, any>()
    if (kitIds.length > 0) {
      const { data: shipmentRows, error: shipmentErr } = await supabase
        .from('lab_kit_shipments')
        .select('id, lab_kit_id, accession_number, airway_bill_number, tracking_status, shipped_date, actual_delivery, created_at')
        .in('lab_kit_id', kitIds)
        .order('created_at', { ascending: false })

      if (shipmentErr) {
        console.error('Failed to load shipments for lab kits:', shipmentErr)
      } else {
        for (const row of shipmentRows || []) {
          const kitId = (row as any).lab_kit_id as string | null
          if (!kitId) continue
          if (!shipmentByKitId.has(kitId)) {
            shipmentByKitId.set(kitId, {
              id: (row as any).id,
              airway_bill_number: (row as any).airway_bill_number,
              carrier: (row as any).carrier,
              tracking_status: (row as any).tracking_status,
              shipped_date: (row as any).shipped_date,
              estimated_delivery: (row as any).estimated_delivery,
              actual_delivery: (row as any).actual_delivery,
              accession_number: (row as any).accession_number || null
            })
          }
        }
      }
    }

    const shipmentByAccession = new Map<string, any>()
    if (accessionNumbers.length > 0) {
      const { data: shipmentAccRows, error: shipmentAccErr } = await supabase
        .from('lab_kit_shipments')
        .select('id, lab_kit_id, accession_number, airway_bill_number, tracking_status, shipped_date, actual_delivery, created_at')
        .is('lab_kit_id', null)
        .in('accession_number', accessionNumbers)
        .order('created_at', { ascending: false })

      if (shipmentAccErr) {
        console.error('Failed to load accession-only shipments for lab kits:', shipmentAccErr)
      } else {
        for (const row of shipmentAccRows || []) {
          const acc = (row as any).accession_number as string | null
          if (!acc || shipmentByAccession.has(acc)) continue
          shipmentByAccession.set(acc, {
            id: (row as any).id,
            airway_bill_number: (row as any).airway_bill_number,
            carrier: (row as any).carrier,
            tracking_status: (row as any).tracking_status,
            shipped_date: (row as any).shipped_date,
            estimated_delivery: (row as any).estimated_delivery,
            actual_delivery: (row as any).actual_delivery,
            accession_number: acc
          })
        }
      }
    }

    const enrichedLabKits = kits.map((kit: any) => {
      const acc = kit.accession_number as string | null
      const subjectInfo = acc ? subjectAssignments.get(acc) || null : null
      const shipmentInfo = shipmentByKitId.get(kit.id) || (acc ? shipmentByAccession.get(acc) : null) || null
      const kitTypeId = (kit as any).kit_type_id as string | null | undefined
      const kitTypeInfo = kitTypeId ? kitTypeInfoById.get(kitTypeId) || null : null

      return {
        ...kit,
        kit_type_label: kitTypeInfo?.name || kit.kit_type || null,
        kit_type_info: kitTypeInfo,
        subject_assignment: subjectInfo,
        latest_shipment: shipmentInfo
      }
    })

    return NextResponse.json({ labKits: enrichedLabKits })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/lab-kits - Create new lab kit
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const kitData = await request.json()

    const { study_id, kit_type_id } = kitData

    if (!study_id || !kitData.accession_number || !kit_type_id) {
      return NextResponse.json({
        error: 'Missing required fields: study_id, accession_number, kit_type_id'
      }, { status: 400 })
    }

    const membership = await verifyStudyMembership(study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const { data: kitTypeRecord, error: kitTypeError } = await supabase
      .from('study_kit_types')
      .select('id, study_id, name, description, is_active')
      .eq('id', kit_type_id)
      .maybeSingle()

    if (kitTypeError || !kitTypeRecord || (kitTypeRecord as any).study_id !== study_id) {
      return NextResponse.json({ error: 'Kit type not found for this study' }, { status: 400 })
    }

    // Check for global duplicate accession number
    const accessionNumber = kitData.accession_number.trim()

    const { data: existingKit } = await supabase
      .from('lab_kits')
      .select('id')
      .eq('accession_number', accessionNumber)
      .maybeSingle()

    if (existingKit) {
      return NextResponse.json({ 
        error: 'A lab kit with this accession number already exists in this study' 
      }, { status: 409 })
    }

    // Insert lab kit
    const insertPayload: LabKitInsert = {
      study_id,
      visit_schedule_id: kitData.visit_schedule_id || null,
      accession_number: accessionNumber,
      kit_type: ((kitTypeRecord as any).name as string | null) || null,
      kit_type_id,
      lot_number: kitData.lot_number || null,
      status: kitData.status || 'available',
      expiration_date: kitData.expiration_date || null,
      received_date: kitData.received_date || null,
      notes: kitData.notes || null
    }

    const { data: labKit, error } = await (supabase as any)
      .from('lab_kits')
      .insert(insertPayload)
      .select(`*, study_kit_types(id, name, description, is_active), visit_schedules(visit_name, visit_number)`) 
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create lab kit' }, { status: 500 })
    }

    return NextResponse.json({ labKit }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
