import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// GET /api/shipments/all - List all shipments across all accessible studies
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const supabase = createSupabaseAdmin()

    // Get all studies the user has access to
    const { data: memberships, error: membershipsErr } = await supabase
      .from('study_members')
      .select('study_id')
      .eq('user_id', user.id)
    
    if (membershipsErr) {
      logger.error('Failed to fetch user study memberships', membershipsErr as any)
      return NextResponse.json({ error: 'Failed to fetch accessible studies' }, { status: 500 })
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ shipments: [] })
    }

    const studyIds = memberships.map(m => (m as any).study_id)

    // 1) Shipments linked via lab_kits for accessible studies
    const { data: data1, error: err1 } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, airway_bill_number, carrier, shipped_date, tracking_status,
        accession_number,
        lab_kit_id,
        lab_kits:lab_kits!inner(id, study_id, studies!inner(protocol_number, study_title))
      `)
      .in('lab_kits.study_id', studyIds)
      .order('created_at', { ascending: false })
    if (err1) {
      logger.error('Shipments list error (join lab_kits)', err1 as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }

    // 2) Accession-only shipments linked via subject_visit_id to accessible studies
    const { data: data2, error: err2 } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, airway_bill_number, carrier, shipped_date, tracking_status,
        accession_number,
        lab_kit_id,
        subject_visits:subject_visits!inner(id, study_id, studies!inner(protocol_number, study_title))
      `)
      .is('lab_kit_id', null)
      .not('accession_number', 'is', null)
      .in('subject_visits.study_id', studyIds)
      .order('created_at', { ascending: false })
    if (err2) {
      logger.error('Shipments list error (join subject_visits)', err2 as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }

    // 3) Accession-only shipments whose accession matches a lab kit in accessible studies
    const { data: accRows } = await supabase
      .from('lab_kits')
      .select('accession_number, studies!inner(protocol_number, study_title)')
      .in('study_id', studyIds)
    let data3: any[] = []
    const accList = (accRows || []).map((r: any) => r.accession_number).filter(Boolean)
    if (accList.length > 0) {
      const { data: d3, error: err3 } = await supabase
        .from('lab_kit_shipments')
        .select('id, airway_bill_number, carrier, shipped_date, tracking_status, accession_number, lab_kit_id')
        .is('lab_kit_id', null)
        .in('accession_number', accList)
      if (err3) {
        logger.error('Shipments list error (accession-only match)', err3 as any)
      } else {
        // Add study info to these records by matching accession number
        const accToStudy = new Map()
        for (const r of accRows || []) {
          accToStudy.set((r as any).accession_number, (r as any).studies)
        }
        data3 = (d3 || []).map((row: any) => ({
          ...row,
          studies: accToStudy.get(row.accession_number) || { protocol_number: 'Unknown', study_title: 'Unknown' }
        }))
      }
    }

    // Merge and dedupe by id, adding study information
    const seen = new Map<string, any>()
    for (const row of [...(data1 || []), ...(data2 || []), ...data3]) {
      const id = (row as any).id as string
      if (!seen.has(id)) {
        let studyInfo = { protocol_number: 'Unknown', study_title: 'Unknown' }
        
        if ((row as any).lab_kits?.studies) {
          studyInfo = (row as any).lab_kits.studies
        } else if ((row as any).subject_visits?.studies) {
          studyInfo = (row as any).subject_visits.studies
        } else if ((row as any).studies) {
          studyInfo = (row as any).studies
        }
        
        seen.set(id, { ...row, study_info: studyInfo })
      }
    }

    const shipments = Array.from(seen.values()).map((row: any) => ({
      id: row.id as string,
      airway_bill_number: row.airway_bill_number as string,
      carrier: row.carrier as string,
      shipped_date: row.shipped_date as string | null,
      tracking_status: row.tracking_status as string | null,
      accession_number: row.accession_number as string | null,
      study_protocol: row.study_info.protocol_number,
      study_title: row.study_info.study_title
    }))

    return NextResponse.json({ shipments })
  } catch (e) {
    logger.error('All shipments GET error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}