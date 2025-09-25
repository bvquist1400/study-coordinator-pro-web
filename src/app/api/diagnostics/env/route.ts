import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

// GET /api/diagnostics/env
// Admin-only helper: returns presence of critical env vars and admin flag. Never returns secret values.
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })

    const supabase = createSupabaseAdmin()

    // Determine admin: user_profiles.role === 'admin' OR email is in ADMIN_EMAILS
    let isAdmin = false
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, email')
        .eq('id', user.id)
        .maybeSingle()
      const role = (profile as { role?: string } | null)?.role
      const email = ((profile as { email?: string } | null)?.email) || user.email || ''
      if (role === 'admin') isAdmin = true
      if (!isAdmin) {
        const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        if (email && admins.includes(email.toLowerCase())) isAdmin = true
      }
    } catch {
      // ignore
    }

    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabaseUrlSet = !!process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonSet = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleSet = !!process.env.SUPABASE_SERVICE_ROLE_KEY

    // derive project ref safely for display
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const ref = url.includes('.supabase.co') ? url.split('//')[1]?.split('.')[0] : undefined

    return NextResponse.json({
      ok: true,
      isAdmin,
      supabaseUrlSet,
      supabaseAnonSet,
      serviceRoleSet,
      projectRef: ref || null,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('diagnostics-env: unexpected failure', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
