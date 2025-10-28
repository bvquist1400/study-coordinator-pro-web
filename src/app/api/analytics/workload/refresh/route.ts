import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'
import { computeAndStoreWorkloadSnapshots } from '@/lib/workload/snapshots'
import type { StudyMeta } from '@/lib/workload/computeWorkloads'

interface RefreshPayload {
  studyId?: string | null
  studyIds?: string[]
  ttlMinutes?: number
  lookbackDays?: number
}

export async function POST(request: NextRequest) {
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
      logger.error('Supabase admin client misconfigured for workload refresh', error as any)
      return NextResponse.json({ error: 'Supabase admin configuration missing' }, { status: 500 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const payload = (await request.json().catch(() => ({}))) as RefreshPayload
    const explicitStudyIds = Array.from(
      new Set(
        [
          payload.studyId,
          ...(Array.isArray(payload.studyIds) ? payload.studyIds : [])
        ].filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    )

    // Resolve accessible site memberships
    const { data: membershipRows, error: membershipError } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', user.id)

    if (membershipError) {
      logger.error('Failed to resolve memberships for workload refresh', membershipError)
      return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
    }

    const siteIds = (membershipRows ?? [])
      .map((row: any) => row.site_id as string | null)
      .filter((id): id is string => !!id)

    const baseSelect = 'id, protocol_number, study_title, lifecycle, recruitment, status, site_id, user_id, meeting_admin_points'

    let studyRows: StudyMeta[] = []

    if (explicitStudyIds.length > 0) {
      const { data: rows, error } = await supabase
        .from('studies')
        .select(baseSelect)
        .in('id', explicitStudyIds)

      if (error) {
        logger.error('Failed to load requested studies for workload refresh', error)
        return NextResponse.json({ error: 'Failed to load requested studies' }, { status: 500 })
      }

      for (const row of rows ?? []) {
        const record = row as StudyMeta & { user_id: string | null }
        if (record.site_id) {
          if (!siteIds.includes(record.site_id) && record.user_id !== user.id) {
            logger.warn('User attempted to refresh study without membership', {
              userId: user.id,
              studyId: record.id
            })
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
          }
        } else if (record.user_id !== user.id) {
          logger.warn('User attempted to refresh unowned study', {
            userId: user.id,
            studyId: record.id
          })
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        studyRows.push(record)
      }
    } else {
      const studyMap = new Map<string, StudyMeta>()

      const queries = [
        supabase
          .from('studies')
          .select(baseSelect)
          .eq('user_id', user.id)
      ]

      if (siteIds.length > 0) {
        queries.push(
          supabase
            .from('studies')
            .select(baseSelect)
            .in('site_id', siteIds)
        )
      }

      const results = await Promise.all(queries)

      for (const result of results) {
        if (result.error) {
          logger.error('Failed to load accessible studies for workload refresh', result.error)
          return NextResponse.json({ error: 'Failed to load studies' }, { status: 500 })
        }

        for (const row of result.data ?? []) {
          const record = row as StudyMeta
          studyMap.set(record.id, record)
        }
      }

      studyRows = Array.from(studyMap.values())
    }

    if (studyRows.length === 0) {
      return NextResponse.json({ workloads: [], count: 0 })
    }

    const workloads = await computeAndStoreWorkloadSnapshots({
      supabase,
      studyRows,
      ttlMinutes: payload.ttlMinutes,
      lookbackDays: payload.lookbackDays
    })

    return NextResponse.json({
      workloads,
      count: workloads.length,
      studies: workloads.map((entry) => entry.studyId)
    })
  } catch (error) {
    logger.error('Unexpected error refreshing workload snapshots', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
