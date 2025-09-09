import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

type IdRow = { id: string }
type SiteMemberRow = { site_id: string | null }

// GET /api/lab-kits/pending-shipments - Get all kits pending shipment across accessible studies
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const supabase = createSupabaseAdmin()

    // Resolve accessible studies via site membership; fall back to owned studies
    const { data: siteMemberships, error: siteMembershipsErr } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (siteMembershipsErr) {
      logger.error('pending-shipments: site_members query failed', siteMembershipsErr as any)
      return NextResponse.json({ error: 'Failed to resolve accessible sites' }, { status: 500 })
    }

    let studyIds: string[] = []
    const siteRows = (siteMemberships || []) as SiteMemberRow[]

    if (siteRows.length === 0) {
      const { data: ownedStudies, error: ownedErr } = await supabase
        .from('studies')
        .select('id')
        .eq('user_id', user.id)
      if (ownedErr) {
        logger.error('pending-shipments: owned studies query failed', ownedErr as any)
        return NextResponse.json({ error: 'Failed to resolve accessible studies' }, { status: 500 })
      }
      const rows = (ownedStudies || []) as IdRow[]
      if (rows.length === 0) return NextResponse.json({ pendingKits: [] })
      studyIds = rows.map(r => r.id)
    } else {
      const siteIds = siteRows.map(r => r.site_id).filter((v): v is string => !!v)
      const { data: siteStudies, error: siteErr } = await supabase
        .from('studies')
        .select('id')
        .in('site_id', siteIds)
      if (siteErr) {
        logger.error('pending-shipments: site studies query failed', siteErr as any)
        return NextResponse.json({ error: 'Failed to fetch studies for sites' }, { status: 500 })
      }
      const rows = (siteStudies || []) as IdRow[]
      if (rows.length === 0) return NextResponse.json({ pendingKits: [] })
      studyIds = rows.map(r => r.id)
    }

    // Expire kits past expiration
    try {
      const today = new Date(); today.setUTCHours(0,0,0,0)
      const todayISO = today.toISOString().slice(0,10)
      await supabase
        .from('lab_kits')
        .update({ status: 'expired' } as any)
        .lt('expiration_date', todayISO)
        .in('status', ['available','assigned','used','pending_shipment'])
        .in('study_id', studyIds)
    } catch (e) {
      logger.warn?.('pending-shipments: auto-expire error', e as any)
    }

    // Fetch pending shipment kits
    const { data: pendingKits, error: kitsErr } = await supabase
      .from('lab_kits')
      .select(`
        id,
        accession_number,
        kit_type,
        status,
        expiration_date,
        study_id,
        studies(protocol_number, study_title)
      `)
      .eq('status', 'pending_shipment')
      .in('study_id', studyIds)
      .order('expiration_date', { ascending: true, nullsLast: true })
      .order('created_at', { ascending: false })

    if (kitsErr) {
      logger.error('pending-shipments: kits query failed', kitsErr as any)
      return NextResponse.json({ error: 'Failed to fetch pending kits' }, { status: 500 })
    }

    // Enrich with subject/visit (by accession)
    const enriched: any[] = []
    for (const kit of (pendingKits || [])) {
      const { data: subjectVisit } = await supabase
        .from('subject_visits')
        .select('id, visit_name, visit_date, subject_id, subjects(subject_number)')
        .eq('accession_number', (kit as any).accession_number)
        .maybeSingle()

      const visitInfo = subjectVisit ? {
        id: (subjectVisit as any).id,
        visit_name: (subjectVisit as any).visit_name,
        visit_date: (subjectVisit as any).visit_date
      } : null
      const subjectInfo = subjectVisit ? {
        id: (subjectVisit as any).subject_id,
        subject_number: (subjectVisit as any).subjects?.subject_number || null
      } : null

      enriched.push({
        id: (kit as any).id,
        accession_number: (kit as any).accession_number,
        kit_type: (kit as any).kit_type,
        status: (kit as any).status,
        expiration_date: (kit as any).expiration_date,
        study_id: (kit as any).study_id,
        study_protocol: (kit as any).studies?.protocol_number || 'Unknown',
        study_title: (kit as any).studies?.study_title || 'Unknown Study',
        subject_id: subjectInfo?.id || null,
        subject_number: subjectInfo?.subject_number || null,
        visit_id: visitInfo?.id || null,
        visit_name: visitInfo?.visit_name || null,
        visit_date: visitInfo?.visit_date || null
      })
    }

    return NextResponse.json({ pendingKits: enriched })
  } catch (e) {
    logger.error('pending-shipments: unexpected error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

