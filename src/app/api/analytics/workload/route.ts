import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import {
  computeWorkloads,
  type StudyMeta,
  type WorkloadResponse,
  type WorkloadBreakdown
} from '@/lib/workload/computeWorkloads'
import {
  loadWorkloadSnapshots,
  computeAndStoreWorkloadSnapshots
} from '@/lib/workload/snapshots'
import {
  groupBreakdownRows,
  type CoordinatorMetricsBreakdownRow
} from '@/lib/workload/breakdown'

const BREAKDOWN_LOOKBACK_WEEKS = 12

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const searchParams = new URL(request.url).searchParams
  const skipCache = searchParams.get('force') === 'true'
  const includeBreakdown = searchParams.get('includeBreakdown') === 'true'

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

    const memberRows = (memberships || []) as Array<{ site_id: string | null }>

    const siteIds = memberRows
      .map((row) => row.site_id)
      .filter((id): id is string => !!id)

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
      logger.error('Error fetching studies for workload analytics', studiesError)
      return NextResponse.json({ error: 'Failed to fetch studies' }, { status: 500 })
    }

    if (!studies || studies.length === 0) {
      return NextResponse.json({ workloads: [] satisfies WorkloadResponse[] })
    }

    const studyRows = studies as StudyMeta[]
    const studyIds = studyRows.map((study) => study.id)

    let workloads: WorkloadResponse[] = []
    let cacheHits = 0
    let recomputed = 0

    if (!skipCache) {
      const { snapshots, staleStudies } = await loadWorkloadSnapshots(supabase, studyIds)

      const freshWorkloads: WorkloadResponse[] = []
      const staleIds = new Set(staleStudies)

      for (const study of studyRows) {
        const snapshot = snapshots.get(study.id)
        if (snapshot && !staleIds.has(study.id)) {
          freshWorkloads.push(snapshot.payload as WorkloadResponse)
        }
      }

      workloads = freshWorkloads
      cacheHits = freshWorkloads.length

      const staleStudyRows = studyRows.filter((study) => staleIds.has(study.id))

      if (staleStudyRows.length > 0) {
        const recomputedWorkloads = await computeAndStoreWorkloadSnapshots({
          supabase,
          studyRows: staleStudyRows
        })
        recomputed = recomputedWorkloads.length
        workloads = workloads.concat(recomputedWorkloads)
      }
    } else {
      const recomputedWorkloads = await computeAndStoreWorkloadSnapshots({
        supabase,
        studyRows
      })
      recomputed = recomputedWorkloads.length
      workloads = recomputedWorkloads
    }

    if (workloads.length === 0) {
      const fallback = await computeWorkloads({ supabase, studyRows })
      workloads = fallback
    }

    const orderedWorkloads = studyRows
      .map((study) => workloads.find((entry) => entry.studyId === study.id))
      .filter((entry): entry is WorkloadResponse => !!entry)

    let responseWorkloads: WorkloadResponse[] = orderedWorkloads

    if (includeBreakdown && orderedWorkloads.length > 0) {
      const since = new Date()
      since.setUTCDate(since.getUTCDate() - (BREAKDOWN_LOOKBACK_WEEKS * 7))
      since.setUTCHours(0, 0, 0, 0)
      const sinceISO = since.toISOString().slice(0, 10)

      const breakdownQuery = supabase
        .from('v_coordinator_metrics_breakdown_weekly' as any)
        .select('study_id, coordinator_id, week_start, meeting_hours, screening_hours, query_hours, total_hours, note_entries, last_updated_at')
        .in('study_id', studyIds)
        .gte('week_start', sinceISO)
        .order('week_start', { ascending: true })

      const { data: breakdownRows, error: breakdownError } = await breakdownQuery

      let groupedBreakdown: Map<string, WorkloadBreakdown> | null = null

      if (breakdownError) {
        if (breakdownError.code && breakdownError.code !== '42P01') {
          logger.warn('Failed to load breakdown view for workload analytics', {
            error: breakdownError,
            studyIds
          })
        }
      } else if (Array.isArray(breakdownRows)) {
        const sanitizedRows: CoordinatorMetricsBreakdownRow[] = breakdownRows.map((row: any) => ({
          study_id: row?.study_id ?? null,
          coordinator_id: row?.coordinator_id ?? null,
          week_start: row?.week_start ?? null,
          meeting_hours: row?.meeting_hours ?? null,
          screening_hours: row?.screening_hours ?? null,
          query_hours: row?.query_hours ?? null,
          total_hours: row?.total_hours ?? null,
          note_entries: row?.note_entries ?? null,
          last_updated_at: row?.last_updated_at ?? null
        }))
        groupedBreakdown = groupBreakdownRows(sanitizedRows)
      }

      responseWorkloads = orderedWorkloads.map((entry) => {
        const weeks = groupedBreakdown?.get(entry.studyId)?.weeks ?? []
        return {
          ...entry,
          breakdown: { weeks }
        }
      })
    }

    return NextResponse.json({
      workloads: responseWorkloads,
      meta: {
        studies: studyRows.length,
        cacheHits,
        recomputed,
        skippedCache: skipCache
      }
    })
  } catch (error) {
    logger.error('Unexpected error in workload analytics API', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
