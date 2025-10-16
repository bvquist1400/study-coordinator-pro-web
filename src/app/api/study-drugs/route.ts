import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    if (!studyId) return NextResponse.json({ error: 'studyId is required' }, { status: 400 })

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }
    const token = authHeader.split(' ')[1]
    const supabase = createSupabaseAdmin()

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    // Verify access to the study: user is owner of study or member of the study's site
    const { data: study } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', studyId)
      .maybeSingle()
    if (!study) return NextResponse.json({ error: 'Study not found' }, { status: 404 })

    if ((study as any).user_id !== user.id) {
      const { data: membership } = await supabase
        .from('site_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('site_id', (study as any).site_id)
        .maybeSingle()
      if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('study_drugs')
      .select('id, code, name, dosing_frequency, dose_per_day')
      .eq('study_id', studyId)
      .order('code', { ascending: true })

    if (error) return NextResponse.json({ error: 'Failed to load study drugs' }, { status: 500 })

    return NextResponse.json({ drugs: data || [] })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
