import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

type StudyAccessRow = { id: string; site_id: string | null; user_id: string }
type LabKitWithStudy = {
  id: string
  study_id: string
  status: string
  studies: StudyAccessRow
}
type SiteMembershipRow = { site_id: string | null }

const ARCHIVE_STATUS = 'archived'
const IMMUTABLE_STATUSES = new Set(['destroyed'])

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const body = await request.json().catch(() => null)
    const kitIdsInput = Array.isArray(body?.kitIds) ? body.kitIds : []
    const normalizedIds: string[] = kitIdsInput
      .map(normalizeId)
      .filter((id: string | null): id is string => typeof id === 'string')

    if (normalizedIds.length === 0) {
      return NextResponse.json({ error: 'kitIds array is required' }, { status: 400 })
    }

    const kitIds: string[] = Array.from(new Set<string>(normalizedIds))
    const supabase = createSupabaseAdmin()

    const { data: kitsRaw, error: kitsError } = await supabase
      .from('lab_kits')
      .select('id, study_id, status, studies!inner(id, site_id, user_id)')
      .in('id', kitIds)

    if (kitsError) {
      logger.error('lab-kits:batch-archive failed to load kits', kitsError as any, { kitIds, userId: user.id })
      return NextResponse.json({ error: 'Failed to load lab kits' }, { status: 500 })
    }

    const kits = (kitsRaw || []).filter((row): row is LabKitWithStudy => {
      const candidate = row as Partial<LabKitWithStudy> | null
      const study = candidate?.studies
      return (
        !!candidate &&
        typeof candidate.id === 'string' &&
        typeof candidate.study_id === 'string' &&
        typeof candidate.status === 'string' &&
        !!study &&
        typeof study.id === 'string' &&
        typeof study.user_id === 'string' &&
        (study.site_id === null || typeof study.site_id === 'string')
      )
    })

    if (kits.length === 0) {
      return NextResponse.json({ error: 'Lab kits not found' }, { status: 404 })
    }
    const kitsById = new Map(kits.map(kit => [kit.id, kit]))
    const missing = kitIds.filter(id => !kitsById.has(id))

    const siteIds = new Set<string>()
    for (const kit of kits) {
      if (kit.studies.site_id) {
        siteIds.add(kit.studies.site_id)
      }
    }

    let allowedSiteIds = new Set<string>()
    if (siteIds.size > 0) {
      const { data: memberships, error: membershipError } = await supabase
        .from('site_members')
        .select('site_id')
        .eq('user_id', user.id)
        .in('site_id', Array.from(siteIds))

      if (membershipError) {
        logger.error('lab-kits:batch-archive failed to load site memberships', membershipError as any, {
          userId: user.id,
          siteIds: Array.from(siteIds)
        })
        return NextResponse.json({ error: 'Failed to verify study access' }, { status: 500 })
      }

      const membershipRows = (memberships || []) as SiteMembershipRow[]
      allowedSiteIds = new Set(
        membershipRows
          .map(row => row.site_id)
          .filter((siteId): siteId is string => Boolean(siteId))
      )
    }

    const updatable: string[] = []
    const denied: string[] = []
    const immutable: string[] = []
    const alreadyArchived: string[] = []

    for (const kitId of kitIds) {
      const kit = kitsById.get(kitId)
      if (!kit) continue

      const study = kit.studies
      const hasAccess = study.site_id
        ? (study.site_id ? allowedSiteIds.has(study.site_id) : false)
        : study.user_id === user.id

      if (!hasAccess) {
        denied.push(kit.id)
        continue
      }

      if (IMMUTABLE_STATUSES.has(kit.status)) {
        immutable.push(kit.id)
        continue
      }

      if (kit.status === ARCHIVE_STATUS) {
        alreadyArchived.push(kit.id)
        continue
      }

      updatable.push(kit.id)
    }

    let updated: string[] = []
    if (updatable.length > 0) {
      const { data: updatedRows, error: updateError } = await (supabase as any)
        .from('lab_kits')
        .update({ status: ARCHIVE_STATUS, updated_at: new Date().toISOString() })
        .in('id', updatable)
        .select('id')

      if (updateError) {
        logger.error('lab-kits:batch-archive failed to update kits', updateError as any, {
          kitIds: updatable,
          userId: user.id
        })
        return NextResponse.json({ error: 'Failed to archive lab kits' }, { status: 500 })
      }

      updated = ((updatedRows || []) as { id: string }[]).map(row => row.id)
    }

    return NextResponse.json({
      archived: updated,
      denied,
      immutable,
      alreadyArchived,
      missing
    })
  } catch (error) {
    logger.error('lab-kits:batch-archive unexpected error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
