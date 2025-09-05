import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import type { StudyUpdate } from '@/types/database'

async function requireOwner(supabase: ReturnType<typeof createSupabaseAdmin>, siteId: string, userId: string) {
  const { data: member } = await supabase
    .from('site_members')
    .select('role')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .maybeSingle()
  const role = (member as { role?: 'owner' | 'coordinator' | 'pi' | 'monitor' } | null)?.role
  return role === 'owner'
}

// POST /api/sites/assign-legacy  { site_id }
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    const supabase = createSupabaseAdmin()

    const { site_id } = await request.json()
    if (!site_id) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })

    // Require owner on site
    const isOwner = await requireOwner(supabase, site_id, user.id)
    if (!isOwner) return NextResponse.json({ error: 'Only owners can assign studies to this site' }, { status: 403 })

    // Assign all legacy studies owned by this user (site_id IS NULL) to provided site
    const { data: updated, error } = await (supabase as any)
      .from('studies')
      .update({ site_id, updated_at: new Date().toISOString() } as StudyUpdate)
      .is('site_id', null)
      .eq('user_id', user.id)
      .select('id')

    if (error) {
      logger.error('Assign legacy error', error as any)
      return NextResponse.json({ error: 'Failed to assign legacy studies' }, { status: 500 })
    }

    return NextResponse.json({ success: true, assigned: updated?.length || 0 })
  } catch (error) {
    logger.error('API error in assign-legacy POST', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
