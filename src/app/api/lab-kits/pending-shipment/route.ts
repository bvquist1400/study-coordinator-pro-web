import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/lab-kits/pending-shipment?studyId=xxx - Get lab kits that are pending shipment
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    
    if (!studyId) {
      return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Get lab kits that are available for shipping (pending_shipment or used status)
    const { data: labKits, error } = await supabase
      .from('lab_kits')
      .select(`
        *,
        visit_schedules(visit_name, visit_number),
        lab_kit_usage (
          subject_visits (
            id,
            visit_date,
            subjects (
              subject_number
            )
          )
        )
      `)
      .eq('study_id', studyId)
      .in('status', ['pending_shipment', 'used'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch lab kits' }, { status: 500 })
    }

    return NextResponse.json({ labKits: labKits || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}