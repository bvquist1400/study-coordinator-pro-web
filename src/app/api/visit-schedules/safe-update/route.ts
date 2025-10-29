import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'

// Safe SOE update that preserves existing visit links
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: status || 401 })
    
    const { study_id, schedules } = await request.json()
    
    if (!study_id || !schedules || !Array.isArray(schedules)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    // Verify user has access to this study
    const { data: study } = await supabase
      .from('studies')
      .select('id, site_id, user_id')
      .eq('id', study_id)
      .single()

    if (!study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    // Check permissions
    const studyData = study as any
    if (studyData.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', studyData.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    } else if (studyData.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Use the safe replacement function
    const { data: result, error } = await (supabase as any)
      .rpc('replace_study_visit_schedules', {
        p_study_id: study_id,
        p_new_schedules: schedules
      } as any)

    if (error) {
      logger.error('Error updating SOE', error as any)
      return NextResponse.json({ error: 'Failed to update SOE' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: result,
      updated_schedules: schedules.length 
    })

  } catch (error) {
    logger.error('SOE update error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
import logger from '@/lib/logger'
