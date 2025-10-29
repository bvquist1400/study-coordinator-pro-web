import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { fetchShipmentsForStudies } from '@/lib/lab-kits/fetch-shipments'

// GET /api/shipments/all - List all shipments across accessible studies
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const supabase = createSupabaseAdmin()

    // Determine accessible studies via site membership
    let studyIds: string[] = []
    const { data: siteMembers } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)
    const siteIds = ((siteMembers || []) as Array<{ site_id: string | null }>).map(r => r.site_id).filter((v): v is string => !!v)
    if (siteIds.length > 0) {
      const { data: siteStudies } = await supabase
        .from('studies')
        .select('id')
        .in('site_id', siteIds)
      studyIds = ((siteStudies || []) as Array<{ id: string }>).map(r => r.id)
    }

    if (studyIds.length === 0) return NextResponse.json({ shipments: [] })

    try {
      const shipments = await fetchShipmentsForStudies(supabase, studyIds)
      return NextResponse.json({ shipments })
    } catch (error) {
      logger.error('shipments/all: failed to build shipments', error as any)
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
    }
  } catch (e) {
    logger.error('shipments/all: unexpected error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
