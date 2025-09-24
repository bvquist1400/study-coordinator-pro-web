import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin, verifyStudyMembership } from '@/lib/api/auth'
import type { LabKitAlertDismissalInsert } from '@/types/database'
import logger from '@/lib/logger'

const DEFAULT_TTL_DAYS = 30
const MAX_TTL_DAYS = 90

function coerceMetadata(value: unknown) {
  if (value === null || value === undefined) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  return { value }
}

function computeExpiry(days?: number) {
  const safeDays = typeof days === 'number' && Number.isFinite(days) ? Math.min(Math.max(days, 1), MAX_TTL_DAYS) : DEFAULT_TTL_DAYS
  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + safeDays)
  return expires.toISOString()
}

export async function GET(request: NextRequest) {
  const { user, error, status } = await authenticateUser(request)
  if (error || !user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: status || 401 })
  }

  const { searchParams } = new URL(request.url)
  const studyId = searchParams.get('studyId')

  if (!studyId) {
    return NextResponse.json({ error: 'studyId parameter is required' }, { status: 400 })
  }

  const membership = await verifyStudyMembership(studyId, user.id)
  if (!membership.success) {
    return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
  }

  try {
    const supabase = createSupabaseAdmin()
    const { data, error: dbError } = await supabase
      .from('lab_kit_alert_dismissals')
      .select('id, alert_hash, dismissed_at, expires_at, metadata')
      .eq('user_id', user.id)
      .eq('study_id', studyId)
      .gt('expires_at', new Date().toISOString())
      .order('dismissed_at', { ascending: false })

    if (dbError) {
      logger.error('lab-kit-alert-dismissals:get', dbError, { studyId, userId: user.id })
      return NextResponse.json({ error: 'Failed to load dismissals' }, { status: 500 })
    }

    return NextResponse.json({
      dismissals: (data ?? []).map((row: any) => ({
        id: row.id as string,
        alertHash: row.alert_hash as string,
        dismissedAt: row.dismissed_at as string,
        expiresAt: row.expires_at as string,
        metadata: (row.metadata as Record<string, unknown> | null) ?? {}
      }))
    })
  } catch (err) {
    logger.error('lab-kit-alert-dismissals:get:unexpected', err, { studyId, userId: user.id })
    return NextResponse.json({ error: 'Unexpected error loading dismissals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { user, error, status } = await authenticateUser(request)
  if (error || !user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: status || 401 })
  }

  let payload: any = null
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const studyId = typeof payload?.studyId === 'string' ? payload.studyId.trim() : ''
  const alertHash = typeof payload?.alertHash === 'string' ? payload.alertHash.trim() : ''
  const ttlDays = typeof payload?.ttlDays === 'number' ? payload.ttlDays : undefined
  const metadata = coerceMetadata(payload?.metadata)

  if (!studyId) {
    return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
  }

  if (!alertHash) {
    return NextResponse.json({ error: 'alertHash is required' }, { status: 400 })
  }

  const membership = await verifyStudyMembership(studyId, user.id)
  if (!membership.success) {
    return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
  }

  try {
    const supabase = createSupabaseAdmin()
    const insert: LabKitAlertDismissalInsert = {
      user_id: user.id,
      study_id: studyId,
      alert_hash: alertHash,
      expires_at: computeExpiry(ttlDays),
      metadata
    }

    const { data, error: upsertError } = await supabase
      .from('lab_kit_alert_dismissals')
      .upsert(insert, { onConflict: 'user_id,study_id,alert_hash' })
      .select('id, alert_hash, dismissed_at, expires_at, metadata')
      .single()

    if (upsertError) {
      logger.error('lab-kit-alert-dismissals:post', upsertError, { studyId, alertHash, userId: user.id })
      return NextResponse.json({ error: 'Failed to persist dismissal' }, { status: 500 })
    }

    return NextResponse.json({
      dismissal: {
        id: data?.id as string,
        alertHash: data?.alert_hash as string,
        dismissedAt: data?.dismissed_at as string,
        expiresAt: data?.expires_at as string,
        metadata: (data?.metadata as Record<string, unknown> | null) ?? {}
      }
    })
  } catch (err) {
    logger.error('lab-kit-alert-dismissals:post:unexpected', err, { studyId, alertHash, userId: user.id })
    return NextResponse.json({ error: 'Unexpected error saving dismissal' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { user, error, status } = await authenticateUser(request)
  if (error || !user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: status || 401 })
  }

  let payload: any = {}
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  const studyId = typeof payload?.studyId === 'string' ? payload.studyId.trim() : ''
  const hashes = Array.isArray(payload?.alertHashes)
    ? Array.from(new Set(payload.alertHashes.filter((value: unknown) => typeof value === 'string' && value.trim().length > 0)))
    : []

  if (!studyId) {
    return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
  }

  const membership = await verifyStudyMembership(studyId, user.id)
  if (!membership.success) {
    return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
  }

  try {
    const supabase = createSupabaseAdmin()
    let query = supabase
      .from('lab_kit_alert_dismissals')
      .delete()
      .eq('user_id', user.id)
      .eq('study_id', studyId)

    if (hashes.length > 0) {
      query = query.in('alert_hash', hashes)
    }

    const { error: deleteError } = await query

    if (deleteError) {
      logger.error('lab-kit-alert-dismissals:delete', deleteError, { studyId, hashes, userId: user.id })
      return NextResponse.json({ error: 'Failed to clear dismissals' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('lab-kit-alert-dismissals:delete:unexpected', err, { studyId, hashes, userId: user.id })
    return NextResponse.json({ error: 'Unexpected error clearing dismissals' }, { status: 500 })
  }
}
