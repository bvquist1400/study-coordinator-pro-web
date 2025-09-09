import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// GET /api/lab-kits/pending-shipments - Get all kits pending shipment across all accessible studies
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    console.log('Authenticated user:', user.id)
    const supabase = createSupabaseAdmin()

    // Get all studies the user has access to via site membership
    const { data: siteMemberships, error: siteMembershipsErr } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)
    
    if (siteMembershipsErr) {
      logger.error('Failed to fetch user site memberships', siteMembershipsErr as any)
      console.error('Site memberships query error:', siteMembershipsErr)
      return NextResponse.json({ error: 'Failed to fetch accessible sites', details: siteMembershipsErr.message }, { status: 500 })
    }

    let studyIds: string[] = []
    
    if (!siteMemberships || siteMemberships.length === 0) {
      // Fall back to legacy ownership check - get studies owned by user
      const { data: ownedStudies, error: ownedStudiesErr } = await supabase
        .from('studies')
        .select('id')
        .eq('user_id', user.id)
      
      if (ownedStudiesErr) {
        logger.error('Failed to fetch owned studies', ownedStudiesErr as any)
        return NextResponse.json({ error: 'Failed to fetch accessible studies' }, { status: 500 })
      }
      
      if (!ownedStudies || ownedStudies.length === 0) {
        return NextResponse.json({ pendingKits: [] })
      }
      
      studyIds = ownedStudies.map(s => s.id)
      console.log('User owns studies:', studyIds)
    } else {
      // Get studies from accessible sites
      const siteIds = siteMemberships.map(m => (m as any).site_id)
      const { data: siteStudies, error: siteStudiesErr } = await supabase
        .from('studies')
        .select('id')
        .in('site_id', siteIds)
      
      if (siteStudiesErr) {
        logger.error('Failed to fetch studies from sites', siteStudiesErr as any)
        return NextResponse.json({ error: 'Failed to fetch site studies' }, { status: 500 })
      }
      
      if (!siteStudies || siteStudies.length === 0) {
        return NextResponse.json({ pendingKits: [] })
      }
      
      studyIds = siteStudies.map(s => s.id)
      console.log('User has access to studies via sites:', studyIds)
    }

    // Auto-expire kits whose expiration_date has passed
    try {
      const today = new Date()
      today.setUTCHours(0,0,0,0)
      const todayISO = today.toISOString().slice(0,10)
      await supabase
        .from('lab_kits')
        .update({ status: 'expired' } as any)
        .lt('expiration_date', todayISO)
        .in('status', ['available','assigned','used','pending_shipment'])
        .in('study_id', studyIds)
    } catch (e) {
      logger.error('Auto-expire kits error', e as any)
    }

    // Get all pending shipment kits from accessible studies
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
      logger.error('Failed to fetch pending shipment kits', kitsErr as any)
      console.error('Kits query error:', kitsErr)
      return NextResponse.json({ error: 'Failed to fetch pending kits' }, { status: 500 })
    }

    console.log('Raw pending kits from DB:', pendingKits?.length || 0, pendingKits)

    // Get subject and visit info by looking up subject_visits by accession_number
    const enrichedKits = []
    for (const kit of pendingKits || []) {
      let subjectInfo = null
      let visitInfo = null

      // Find the subject visit that used this accession number
      const { data: subjectVisit } = await supabase
        .from('subject_visits')
        .select(`
          id,
          visit_name,
          visit_date,
          subject_id,
          subjects(subject_number)
        `)
        .eq('accession_number', kit.accession_number)
        .single()

      if (subjectVisit) {
        visitInfo = {
          id: subjectVisit.id,
          visit_name: subjectVisit.visit_name,
          visit_date: subjectVisit.visit_date
        }
        subjectInfo = {
          id: subjectVisit.subject_id,
          subject_number: (subjectVisit as any).subjects?.subject_number
        }
      }

      enrichedKits.push({
        id: kit.id,
        accession_number: kit.accession_number,
        kit_type: kit.kit_type,
        status: kit.status,
        expiration_date: kit.expiration_date,
        study_id: kit.study_id,
        study_protocol: kit.studies?.protocol_number || 'Unknown',
        study_title: kit.studies?.study_title || 'Unknown Study',
        subject_id: subjectInfo?.id || null,
        subject_number: subjectInfo?.subject_number || null,
        visit_id: visitInfo?.id || null,
        visit_name: visitInfo?.visit_name || null,
        visit_date: visitInfo?.visit_date || null
      })
    }

    return NextResponse.json({ pendingKits: enrichedKits })
  } catch (e) {
    logger.error('Pending shipments GET error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}