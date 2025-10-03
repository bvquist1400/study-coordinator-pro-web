import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

const DEFAULT_SNOOZE_DAYS = 7

interface DismissBody {
  study_id?: string
  alert_id?: string
  conditions?: Record<string, unknown>
  snooze_days?: number
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const payload = (await request.json().catch(() => null)) as DismissBody | null
    if (!payload) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const { study_id: studyId, alert_id: alertId, conditions, snooze_days: snoozeDaysRaw } = payload
    if (!studyId || !alertId || !conditions) {
      return NextResponse.json({ error: 'study_id, alert_id, and conditions are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const now = new Date()
    const snoozeDays = Number.isFinite(snoozeDaysRaw) && (snoozeDaysRaw ?? 0) > 0
      ? Math.min(30, Math.max(1, snoozeDaysRaw as number))
      : DEFAULT_SNOOZE_DAYS
    const snoozeUntil = new Date(now)
    snoozeUntil.setUTCDate(snoozeUntil.getUTCDate() + snoozeDays)

    const supabase = createSupabaseAdmin()

    const { error: upsertError } = await (supabase as any)
      .from('lab_kit_alert_dismissals')
      .upsert({
        user_id: user.id,
        study_id: studyId,
        alert_id: alertId,
        dismissed_at: now.toISOString(),
        snooze_until: snoozeUntil.toISOString(),
        conditions,
        auto_restore_rule: null,
        manually_restored: false,
        restored_at: null,
        updated_at: now.toISOString()
      }, { onConflict: 'user_id,study_id,alert_id' })

    if (upsertError) {
      logger.error('lab-kit-alerts/dismiss POST failed', upsertError, { studyId, alertId, userId: user.id })
      return NextResponse.json({ error: 'Failed to dismiss alert' }, { status: 500 })
    }

    return NextResponse.json({
      dismissal: {
        alertId,
        studyId,
        snoozeUntil: snoozeUntil.toISOString()
      }
    })
  } catch (error) {
    logger.error('lab-kit-alerts/dismiss POST unexpected', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    }

    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('study_id')
    const alertId = searchParams.get('alert_id')

    if (!studyId || !alertId) {
      return NextResponse.json({ error: 'study_id and alert_id parameters are required' }, { status: 400 })
    }

    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) {
      return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
    }

    const supabase = createSupabaseAdmin()
    const nowIso = new Date().toISOString()

    const { error: updateError } = await (supabase as any)
      .from('lab_kit_alert_dismissals')
      .update({
        manually_restored: true,
        restored_at: nowIso,
        auto_restore_rule: null,
        updated_at: nowIso
      })
      .eq('user_id', user.id)
      .eq('study_id', studyId)
      .eq('alert_id', alertId)
      .is('restored_at', null)

    if (updateError) {
      logger.error('lab-kit-alerts/dismiss DELETE failed', updateError, { studyId, alertId, userId: user.id })
      return NextResponse.json({ error: 'Failed to restore alert' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('lab-kit-alerts/dismiss DELETE unexpected', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
