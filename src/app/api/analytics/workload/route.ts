import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import {
  computeWorkloads,
  type StudyMeta,
  type WorkloadResponse
} from '@/lib/workload/computeWorkloads'
import {
  loadWorkloadSnapshots,
  computeAndStoreWorkloadSnapshots
} from '@/lib/workload/snapshots'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const searchParams = new URL(request.url).searchParams
  const skipCache = searchParams.get('force') === 'true'

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

    return NextResponse.json({
      workloads: orderedWorkloads,
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
