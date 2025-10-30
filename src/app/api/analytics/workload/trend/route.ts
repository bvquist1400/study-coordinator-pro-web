import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import {
  computeWorkloads,
  type StudyMeta
} from '@/lib/workload/computeWorkloads'

interface TrendPoint {
  weekStart: string
  actual: number
  forecast: number
}

const roundTwo = (value: number) => Math.round(value * 100) / 100

const getMondayISO = (date: Date) => {
  const clone = new Date(date)
  const day = clone.getDay()
  const diff = clone.getDate() - day + (day === 0 ? -6 : 1)
  clone.setDate(diff)
  clone.setHours(0, 0, 0, 0)
  return clone.toISOString().slice(0, 10)
}

const shiftMonday = (iso: string, weeks: number) => {
  const base = new Date(`${iso}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + weeks * 7)
  return base.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  let supabase

  try {
    supabase = createSupabaseAdmin(token)
  } catch (error) {
    logger.error('Supabase admin client misconfigured for workload trend', error as any)
    return NextResponse.json({ points: [] as TrendPoint[], warning: 'Supabase admin configuration missing' })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from('site_members')
    .select('site_id')
    .eq('user_id', user.id)

  if (membershipsError) {
    logger.error('Error fetching site memberships for workload trend', membershipsError)
    return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
  }

  const siteIds = (memberships ?? [])
    .map((row: any) => row.site_id)
    .filter((id: string | null): id is string => !!id)

  const baseQuery = supabase
    .from('studies')
    .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, created_at, meeting_admin_points')
    .order('created_at', { ascending: false })

  const filteredQuery = siteIds.length > 0
    ? baseQuery.in('site_id', siteIds)
    : baseQuery.eq('user_id', user.id)

  let { data: studies, error: studiesError } = await filteredQuery

  if (studiesError?.code === '42703') {
    const fallbackQuery = supabase
      .from('studies')
      .select('id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, created_at')
      .order('created_at', { ascending: false })

    const retryQuery = siteIds.length > 0
      ? fallbackQuery.in('site_id', siteIds)
      : fallbackQuery.eq('user_id', user.id)

    const retry = await retryQuery
    studies = retry.data as any
    studiesError = retry.error
  }

  if (studiesError) {
    logger.error('Error fetching studies for workload trend', studiesError)
    return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
  }

  if (!studies || studies.length === 0) {
    return NextResponse.json({ points: [] as TrendPoint[] })
  }

  const studyRows = studies as StudyMeta[]
  const studyIds = studyRows.map((study) => study.id)

  const { data: coordinatorRows, error: coordinatorError } = await supabase
    .from('study_coordinators' as any)
    .select('coordinator_id')
    .in('study_id', studyIds)

  if (coordinatorError && coordinatorError.code !== '42P01') {
    logger.error('Error loading coordinator assignments for trend', coordinatorError, { studyIds })
    return NextResponse.json({ error: 'Failed to load coordinator assignments' }, { status: 500 })
  }

  const coordinatorIds = new Set<string>()
  for (const row of coordinatorRows ?? []) {
    const coordinatorId = (row as any)?.coordinator_id as string | null
    if (coordinatorId) {
      coordinatorIds.add(coordinatorId)
    }
  }
  coordinatorIds.add(user.id)

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 56) // last eight weeks
  const sinceISO = since.toISOString().slice(0, 10)

  let metricsData: Array<Record<string, any>> | null = null
  let metricsError = null

  const metricsQuery = supabase
    .from('coordinator_metrics' as any)
    .select('coordinator_id, week_start, meeting_hours, screening_hours, query_hours, admin_hours')
    .gte('week_start', sinceISO)

  if (coordinatorIds.size > 0) {
    metricsQuery.in('coordinator_id', Array.from(coordinatorIds))
  }

  const metricsResponse = await metricsQuery
  metricsData = metricsResponse.data as Array<Record<string, any>> | null
  metricsError = metricsResponse.error

  if (metricsError?.code === '42703') {
    const legacy = await supabase
      .from('coordinator_metrics' as any)
      .select('coordinator_id, week_start, screening_hours, query_hours, admin_hours')
      .gte('week_start', sinceISO)

    metricsData = legacy.data as Array<Record<string, any>> | null
    metricsError = legacy.error
  }

  if (metricsError) {
    if (metricsError.code && metricsError.code !== '42P01') {
      logger.warn('Failed to load coordinator metrics for trend', metricsError as any)
    }
    metricsData = []
  }

  const totalsByWeek = new Map<string, number>()
  for (const row of metricsData ?? []) {
    const week = (row.week_start ?? row.weekStart) as string | null
    if (!week) continue
    const meeting = Number(row.meeting_hours ?? row.admin_hours ?? 0)
    const screening = Number(row.screening_hours ?? 0)
    const query = Number(row.query_hours ?? 0)
    const total = meeting + screening + query
    if (!Number.isFinite(total)) continue
    totalsByWeek.set(week, roundTwo((totalsByWeek.get(week) ?? 0) + total))
  }

  let workloads: Awaited<ReturnType<typeof computeWorkloads>> = []
  try {
    workloads = await computeWorkloads({ supabase, studyRows })
  } catch (error) {
    logger.error('Failed to compute workloads for trend forecast', error as any)
    return NextResponse.json({ error: 'Failed to compute workload forecast' }, { status: 500 })
  }

  const totalForecast = workloads.reduce((sum, entry) => sum + entry.forecast.weighted, 0)
  const weeklyForecast = roundTwo(totalForecast / 4)

  const currentMondayISO = getMondayISO(new Date())
  const points: TrendPoint[] = []

  for (let offset = 4; offset >= 1; offset -= 1) {
    const weekISO = shiftMonday(currentMondayISO, -offset)
    points.push({
      weekStart: weekISO,
      actual: roundTwo(totalsByWeek.get(weekISO) ?? 0),
      forecast: 0
    })
  }

  for (let offset = 0; offset < 4; offset += 1) {
    const weekISO = shiftMonday(currentMondayISO, offset)
    points.push({
      weekStart: weekISO,
      actual: 0,
      forecast: weeklyForecast
    })
  }

  return NextResponse.json({ points })
}
