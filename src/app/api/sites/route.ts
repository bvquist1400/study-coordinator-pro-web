import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

// GET /api/sites - List sites for current user (via membership)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('site_members')
      .select('site_id, role, sites:site_id ( id, name, created_at, updated_at )')
      .eq('user_id', user.id)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 })
    }

    type MemberRow = {
      site_id: string
      role: 'owner' | 'coordinator' | 'pi' | 'monitor'
      sites?: { id: string; name: string; created_at: string; updated_at: string } | null
    }
    const rows = (data || []) as MemberRow[]
    const sites = rows.map(row => ({
      id: row.sites?.id || row.site_id,
      name: row.sites?.name || 'Site',
      role: row.role,
      created_at: row.sites?.created_at || null,
      updated_at: row.sites?.updated_at || null
    }))

    return NextResponse.json({ sites })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/sites - Create a site and add current user as owner
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { name } = await request.json()
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Site name is required' }, { status: 400 })
    }

    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .insert({ name: name.trim() } as unknown as never)
      .select()
      .single()

    if (siteErr || !site) {
      console.error('Create site error:', siteErr)
      return NextResponse.json({ error: 'Failed to create site' }, { status: 500 })
    }

    const { error: memberErr } = await supabase
      .from('site_members')
      .insert({ site_id: site.id, user_id: user.id, role: 'owner' } as unknown as never)

    if (memberErr) {
      console.error('Add owner membership error:', memberErr)
      return NextResponse.json({ error: 'Site created, but failed to add owner membership' }, { status: 500 })
    }

    return NextResponse.json({ site }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
