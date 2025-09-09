import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

type StudyMemberRow = { study_id: string }

// GET /api/shipments/all - List all shipments across accessible studies
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const supabase = createSupabaseAdmin()

    // Fall back to site membership if study_members table not present
    let studyIds: string[] = []
    try {
      const { data: memberships } = await supabase
        .from('study_members')
        .select('study_id')
        .eq('user_id', user.id)
      const rows = (memberships || []) as StudyMemberRow[]
      studyIds = rows.map(r => r.study_id)
    } catch (_e) {
      // study_members missing; derive from sites
      const { data: siteMembers } = await supabase
        .from('site_members')
        .select('site_id')
        .eq('user_id', user.id)
      const siteIds = ((siteMembers || []) as Array<{ site_id: string | null }>).map(r => r.site_id).filter((v): v is string => !!v)
      const { data: siteStudies } = await supabase
        .from('studies')
        .select('id')
        .in('site_id', siteIds)
      studyIds = ((siteStudies || []) as Array<{ id: string }>).map(r => r.id)
    }

    if (studyIds.length === 0) return NextResponse.json({ shipments: [] })

    // Shipments joined via lab_kits
    const { data: data1, error: err1 } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, airway_bill_number, carrier, shipped_date, tracking_status,
        accession_number, lab_kit_id,
        lab_kits:lab_kits!inner(id, study_id, studies!inner(protocol_number, study_title))
      `)
      .in('lab_kits.study_id', studyIds)
      .order('created_at', { ascending: false })
    if (err1) {
      logger.error('shipments/all: join lab_kits failed', err1 as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }

    // Shipments joined via subject_visits (accession-only)
    const { data: data2, error: err2 } = await supabase
      .from('lab_kit_shipments')
      .select(`
        id, airway_bill_number, carrier, shipped_date, tracking_status,
        accession_number, lab_kit_id,
        subject_visits:subject_visits!inner(id, study_id, studies!inner(protocol_number, study_title))
      `)
      .is('lab_kit_id', null)
      .not('accession_number', 'is', null)
      .in('subject_visits.study_id', studyIds)
      .order('created_at', { ascending: false })
    if (err2) {
      logger.error('shipments/all: join subject_visits failed', err2 as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }

    // Accession-only shipments matching lab_kits by accession
    const { data: accRows } = await supabase
      .from('lab_kits')
      .select('accession_number, studies!inner(protocol_number, study_title)')
      .in('study_id', studyIds)
    let data3: any[] = []
    const accList = (accRows || []).map((r: any) => r.accession_number).filter(Boolean)
    if (accList.length > 0) {
      const { data: d3 } = await supabase
        .from('lab_kit_shipments')
        .select('id, airway_bill_number, carrier, shipped_date, tracking_status, accession_number, lab_kit_id')
        .is('lab_kit_id', null)
        .in('accession_number', accList)
      const accToStudy = new Map<string, any>()
      for (const r of (accRows || [])) accToStudy.set((r as any).accession_number, (r as any).studies)
      data3 = (d3 || []).map((row: any) => ({ ...row, studies: accToStudy.get(row.accession_number) }))
    }

    // Merge and shape
    const seen = new Map<string, any>()
    for (const row of [...(data1 || []), ...(data2 || []), ...data3]) {
      const id = (row as any).id as string
      if (!seen.has(id)) {
        const studyInfo = (row as any).lab_kits?.studies || (row as any).subject_visits?.studies || (row as any).studies || { protocol_number: 'Unknown', study_title: 'Unknown' }
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
      study_protocol: row.study_info?.protocol_number || 'Unknown',
      study_title: row.study_info?.study_title || 'Unknown'
    }))

    return NextResponse.json({ shipments })
  } catch (e) {
    logger.error('shipments/all: unexpected error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

