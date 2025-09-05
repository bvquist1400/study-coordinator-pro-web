import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import type { Database } from '@/types/database'

async function requireUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid authorization header', status: 401 as const }
  }
  const token = authHeader.split(' ')[1]
  const supabase = createSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { error: 'Invalid token', status: 401 as const }
  return { supabase, user }
}

type SiteMemberRole = 'owner' | 'coordinator' | 'pi' | 'monitor'
async function requireOwner(supabase: ReturnType<typeof createSupabaseAdmin>, siteId: string, userId: string) {
  const { data: member } = await supabase
    .from('site_members')
    .select('role')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .maybeSingle()
  const memberRow = member as { role?: SiteMemberRole } | null
  if (!memberRow || memberRow.role !== 'owner') return false
  return true
}

// GET /api/site-members?site_id=xxx
export async function GET(request: NextRequest) {
  try {
    const userRes = await requireUser(request)
    if ('error' in userRes) return NextResponse.json({ error: userRes.error }, { status: userRes.status })
    const { supabase, user } = userRes

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('site_id')
    if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })

    // Verify membership (any role can view members)
    const { data: membership } = await supabase
      .from('site_members')
      .select('user_id')
      .eq('site_id', siteId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data, error } = await supabase
      .from('site_members')
      .select('user_id, role, created_at')
      .eq('site_id', siteId)
    if (error) {
      console.error('List members error:', error)
      return NextResponse.json({ error: 'Failed to list site members' }, { status: 500 })
    }

    return NextResponse.json({ members: data || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/site-members - Add member by user_id or email
// Body: { site_id, user_id? , email?, role }
export async function POST(request: NextRequest) {
  try {
    const userRes = await requireUser(request)
    if ('error' in userRes) return NextResponse.json({ error: userRes.error }, { status: userRes.status })
    const { supabase, user } = userRes

    const body = await request.json()
    const { site_id, user_id, email, role } = body || {}
    if (!site_id || !role || (!user_id && !email)) {
      return NextResponse.json({ error: 'site_id and role and (user_id or email) are required' }, { status: 400 })
    }

    // Require owner to add
    const isOwner = await requireOwner(supabase, site_id, user.id)
    if (!isOwner) return NextResponse.json({ error: 'Only owners can add members' }, { status: 403 })

    // Resolve user by email if needed
    let targetUserId = user_id as string | undefined
    if (!targetUserId && email) {
      const { data: profile, error: emailErr } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (emailErr || !profile) {
        return NextResponse.json({ error: 'User not found by email. Ensure the user has signed up.' }, { status: 404 })
      }
      targetUserId = (profile as { id: string }).id
    }

    // Insert membership
    type SiteMemberInsert = Database['public']['Tables']['site_members']['Insert']
    const { error } = await supabase
      .from('site_members')
      .insert({ site_id, user_id: targetUserId!, role } as SiteMemberInsert)

    if (error) {
      const errCode = (error as { code?: string }).code
      if (errCode === '23505') {
        return NextResponse.json({ error: 'User is already a member of this site' }, { status: 409 })
      }
      console.error('Add member error:', error)
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/site-members - Update role
// Body: { site_id, user_id, role }
export async function PUT(request: NextRequest) {
  try {
    const userRes = await requireUser(request)
    if ('error' in userRes) return NextResponse.json({ error: userRes.error }, { status: userRes.status })
    const { supabase, user } = userRes

    const { site_id, user_id, role } = await request.json()
    if (!site_id || !user_id || !role) {
      return NextResponse.json({ error: 'site_id, user_id and role are required' }, { status: 400 })
    }

    const isOwner = await requireOwner(supabase, site_id, user.id)
    if (!isOwner) return NextResponse.json({ error: 'Only owners can update roles' }, { status: 403 })

    type SiteMemberUpdate = Database['public']['Tables']['site_members']['Update']
    const { error } = await supabase
      .from('site_members')
      .update({ role } as SiteMemberUpdate)
      .eq('site_id', site_id)
      .eq('user_id', user_id)

    if (error) {
      console.error('Update role error:', error)
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/site-members - Remove member
// Body: { site_id, user_id }
export async function DELETE(request: NextRequest) {
  try {
    const userRes = await requireUser(request)
    if ('error' in userRes) return NextResponse.json({ error: userRes.error }, { status: userRes.status })
    const { supabase, user } = userRes

    const { site_id, user_id } = await request.json()
    if (!site_id || !user_id) {
      return NextResponse.json({ error: 'site_id and user_id are required' }, { status: 400 })
    }

    const isOwner = await requireOwner(supabase, site_id, user.id)
    if (!isOwner) return NextResponse.json({ error: 'Only owners can remove members' }, { status: 403 })

    const { error } = await supabase
      .from('site_members')
      .delete()
      .eq('site_id', site_id)
      .eq('user_id', user_id)

    if (error) {
      console.error('Remove member error:', error)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
