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

