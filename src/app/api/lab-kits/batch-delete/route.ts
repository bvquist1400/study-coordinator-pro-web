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
      logger.error('lab-kits:batch-delete failed to load kits', kitsError as any, { kitIds, userId: user.id })
      return NextResponse.json({ error: 'Failed to load lab kits' }, { status: 500 })
    }

    const kits = (kitsRaw || []) as LabKitWithStudy[]
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
        logger.error('lab-kits:batch-delete failed to load site memberships', membershipError as any, {
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

    const allowed: string[] = []
    const denied: string[] = []
    const locked: string[] = []

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

      if (kit.status === 'used' || kit.status === 'shipped' || kit.status === 'destroyed') {
        locked.push(kit.id)
        continue
      }

      allowed.push(kit.id)
    }

    if (allowed.length > 0) {
      const { error: deleteError } = await (supabase as any)
        .from('lab_kits')
        .delete()
        .in('id', allowed)

      if (deleteError) {
        logger.error('lab-kits:batch-delete failed to delete kits', deleteError as any, { kitIds: allowed, userId: user.id })
        return NextResponse.json({ error: 'Failed to delete lab kits' }, { status: 500 })
      }
    }

    return NextResponse.json({
      deleted: allowed,
      denied,
      locked,
      missing
    })
  } catch (error) {
    logger.error('lab-kits:batch-delete unexpected error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
