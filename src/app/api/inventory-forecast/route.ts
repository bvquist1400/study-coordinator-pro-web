import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { ForecastServiceError, loadInventoryForecast } from '@/lib/lab-kits/forecast-service'

const DEFAULT_WINDOW_DAYS = 30

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const daysParam = Number.parseInt(searchParams.get('days') || `${DEFAULT_WINDOW_DAYS}`, 10)
    const daysAhead = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 180) : DEFAULT_WINDOW_DAYS

    if (!studyId) {
      return NextResponse.json({ error: 'study_id parameter is required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const { forecast, summary } = await loadInventoryForecast(supabase, studyId, daysAhead)

    return NextResponse.json({ forecast, summary })
  } catch (error) {
    if (error instanceof ForecastServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    logger.error('inventory-forecast: unexpected error', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
