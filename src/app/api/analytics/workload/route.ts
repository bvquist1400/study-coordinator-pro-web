import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

interface StudyMeta {
  id: string
  protocol_number: string
  study_title: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  site_id: string | null
  user_id: string
  created_at: string
}

interface WorkloadResponse {
  studyId: string
  protocolNumber: string
  studyTitle: string
  lifecycle: string | null
  recruitment: string | null
  status: string | null
  lifecycleWeight: number
  recruitmentWeight: number
  screeningMultiplier: number
  queryMultiplier: number
  meetingAdminPoints: number
  protocolScore: number
  now: {
    raw: number
    weighted: number
  }
  actuals: {
    raw: number
    weighted: number
  }
  forecast: {
    raw: number
    weighted: number
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]

  try {
    let supabase
    try {
      supabase = createSupabaseAdmin(token)
    } catch (error) {
      logger.error('Supabase admin client misconfigured for workload analytics', error as any)
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[], warning: 'Supabase admin configuration missing' })
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Resolve accessible studies (site membership or direct ownership)
    const { data: memberships, error: membershipsError } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (membershipsError) {
      logger.error('Error fetching site memberships for workload analytics', membershipsError)
      return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
    }

    const siteIds = (memberships || [])
      .map((row) => row.site_id)
      .filter((id): id is string => !!id)

    let studiesQuery = supabase
      .from('studies')
      .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, created_at, meeting_admin_points')
      .order('created_at', { ascending: false })

    if (siteIds.length > 0) {
      studiesQuery = studiesQuery.in('site_id', siteIds)
    } else {
      studiesQuery = studiesQuery.eq('user_id', user.id)
    }

    let { data: studies, error: studiesError } = await studiesQuery

    if (studiesError?.code === '42703') {
      studiesQuery = supabase
        .from('studies')
        .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, created_at')
        .order('created_at', { ascending: false })

      if (siteIds.length > 0) {
        studiesQuery = studiesQuery.in('site_id', siteIds)
      } else {
        studiesQuery = studiesQuery.eq('user_id', user.id)
      }

      const retry = await studiesQuery
      studies = retry.data
      studiesError = retry.error
    }

    if (studiesError) {
      logger.error('Error fetching studies for workload analytics', studiesError)
      return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
    }

    if (!studies || studies.length === 0) {
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[] })
    }

    const studyRows = studies as StudyMeta[]
    const studyIds = studyRows.map((study) => study.id)

    const [{ data: weightRows, error: weightsError }, { data: nowRows, error: nowError }, { data: actualRows, error: actualError }, { data: forecastRows, error: forecastError }] =
      await Promise.all([
        supabase
          .from('cwe_weights' as any)
          .select('study_id, lifecycle_w, recruitment_w, ps, sm, qm')
          .in('study_id', studyIds),
        supabase
          .from('cwe_now' as any)
          .select('study_id, raw_now')
          .in('study_id', studyIds),
        supabase
          .from('cwe_actuals' as any)
          .select('study_id, raw_actuals')
          .in('study_id', studyIds),
        supabase
          .from('cwe_forecast_4w' as any)
          .select('study_id, raw_forecast')
          .in('study_id', studyIds)
      ])

    const missingCweObjects = (err: any) => {
      const code = err?.code
      return code === '42P01'
    }

    if (weightsError && missingCweObjects(weightsError)) {
      // workload views not available yet; return empty payload gracefully
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[] })
    }

    if (weightsError || nowError || actualError || forecastError) {
      logger.error('Error loading CWE workload metrics', {
        weightsError,
        nowError,
        actualError,
        forecastError
      })
      return NextResponse.json({ error: 'Failed to load workload metrics' }, { status: 500 })
    }

    const weightsMap = new Map<string, any>((weightRows || []).map((row: any) => [row.study_id, row]))
    const nowMap = nowError && missingCweObjects(nowError)
      ? new Map<string, number>()
      : new Map<string, number>((nowRows || []).map((row: any) => [row.study_id, Number(row.raw_now) || 0]))
    const actualMap = actualError && missingCweObjects(actualError)
      ? new Map<string, number>()
      : new Map<string, number>((actualRows || []).map((row: any) => [row.study_id, Number(row.raw_actuals) || 0]))
    const forecastMap = forecastError && missingCweObjects(forecastError)
      ? new Map<string, number>()
      : new Map<string, number>((forecastRows || []).map((row: any) => [row.study_id, Number(row.raw_forecast) || 0]))

    const workloads: WorkloadResponse[] = studyRows.map((study) => {
      const weights = weightsMap.get(study.id) ?? {}
      const lifecycleWeight = Number(weights.lifecycle_w ?? 1)
      const recruitmentWeight = Number(weights.recruitment_w ?? 1)
      const screeningMultiplier = Number(weights.sm ?? 1)
      const queryMultiplier = Number(weights.qm ?? 1)
    const meetingAdminPoints = Number(
      (study as any)?.meeting_admin_points ?? 0
    )
      const protocolScore = Number(weights.ps ?? 0)

    const factor = lifecycleWeight * recruitmentWeight * screeningMultiplier * queryMultiplier

    const rawNow = nowMap.get(study.id) ?? 0
    const rawActuals = actualMap.get(study.id) ?? 0
    const rawForecast = forecastMap.get(study.id) ?? 0

      const roundTwo = (value: number) => Math.round(value * 100) / 100
      const weighted = (raw: number) => roundTwo(raw * factor)

      return {
        studyId: study.id,
        protocolNumber: study.protocol_number,
        studyTitle: study.study_title,
        lifecycle: study.lifecycle,
        recruitment: study.recruitment ?? study.status,
        status: study.status,
        lifecycleWeight,
        recruitmentWeight,
        screeningMultiplier,
        queryMultiplier,
        meetingAdminPoints,
        protocolScore,
        now: {
          raw: roundTwo(rawNow),
          weighted: weighted(rawNow)
        },
        actuals: {
          raw: roundTwo(rawActuals),
          weighted: weighted(rawActuals)
        },
      forecast: {
        raw: roundTwo(rawForecast),
        weighted: weighted(rawForecast)
      }
    }
  })

    return NextResponse.json({ workloads })
  } catch (error) {
    logger.error('Unexpected error in workload analytics API', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
