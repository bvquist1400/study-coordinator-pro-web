import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

const LIFECYCLE_STAGES = ['start_up', 'active', 'follow_up', 'close_out'] as const
const RECRUITMENT_STATUSES = ['enrolling', 'paused', 'closed_to_accrual', 'on_hold'] as const

type LifecycleStage = typeof LIFECYCLE_STAGES[number]
type RecruitmentStatus = typeof RECRUITMENT_STATUSES[number]

interface VisitWeightRow {
  id: string
  visit_type: string
  weight: number
}

interface StudySettingsRow {
  id: string
  protocol_number: string
  study_title: string
  lifecycle: LifecycleStage | null
  recruitment: RecruitmentStatus | null
  status: string | null
  protocol_score: number | null
  screening_multiplier: number | null
  query_multiplier: number | null
  meeting_admin_points: number | null
  rubric_trial_type: string | null
  rubric_phase: string | null
  rubric_sponsor_type: string | null
  rubric_visit_volume: string | null
  rubric_procedural_intensity: string | null
  rubric_notes: string | null
  site_id: string | null
  user_id: string
}

interface StudySettingsResponse {
  study: {
    id: string
    protocolNumber: string
    studyTitle: string
    lifecycle: LifecycleStage
    recruitment: RecruitmentStatus
    status: string | null
    protocolScore: number
    screeningMultiplier: number
    queryMultiplier: number
    meetingAdminPoints: number
    rubric: {
      trialType: string | null
      phase: string | null
      sponsorType: string | null
      visitVolume: string | null
      proceduralIntensity: string | null
      notes: string | null
    }
  }
  visitWeights: Array<{
    id: string
    visitType: string
    weight: number
  }>
}

async function authorize(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 }) }
  }

  const token = authHeader.split(' ')[1]
  let supabase
  try {
    supabase = createSupabaseAdmin(token)
  } catch (error) {
    logger.error('Supabase admin client misconfigured for CWE settings', error as any)
    return { error: NextResponse.json({ error: 'Supabase admin configuration missing' }, { status: 500 }) }
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }

  return { supabase, user }
}

async function verifyStudyAccess(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  studyId: string,
  userId: string
) {
  const { data: study, error } = await supabase
    .from('studies')
    .select('*')
    .eq('id', studyId)
    .single()

  if (error || !study) {
    return { error: NextResponse.json({ error: 'Study not found' }, { status: 404 }) }
  }

  const row = study as StudySettingsRow

  if (row.user_id !== userId) {
    if (row.site_id) {
      const { data: membership, error: membershipError } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', row.site_id)
        .eq('user_id', userId)
        .single()

      if (membershipError || !membership) {
        return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
      }
    } else {
      return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
    }
  }

  return { study: row }
}

function toResponse(
  study: StudySettingsRow,
  weights: VisitWeightRow[]
): StudySettingsResponse {
  const meetingPoints = Object.prototype.hasOwnProperty.call(study, 'meeting_admin_points')
    ? Number((study as any).meeting_admin_points ?? 0)
    : 0
  return {
    study: {
      id: study.id,
      protocolNumber: study.protocol_number,
      studyTitle: study.study_title,
      lifecycle: (study.lifecycle ?? 'active') as LifecycleStage,
      recruitment: RECRUITMENT_STATUSES.includes((study.recruitment ?? 'enrolling') as RecruitmentStatus)
        ? (study.recruitment as RecruitmentStatus)
        : 'enrolling',
      status: study.status,
      protocolScore: Number(study.protocol_score ?? 0),
      screeningMultiplier: Number(study.screening_multiplier ?? 1),
      queryMultiplier: Number(study.query_multiplier ?? 1),
      meetingAdminPoints: meetingPoints,
      rubric: {
        trialType: (study as any).rubric_trial_type ?? null,
        phase: (study as any).rubric_phase ?? null,
        sponsorType: (study as any).rubric_sponsor_type ?? null,
        visitVolume: (study as any).rubric_visit_volume ?? null,
        proceduralIntensity: (study as any).rubric_procedural_intensity ?? null,
        notes: (study as any).rubric_notes ?? null
      }
    },
    visitWeights: weights.map((row) => ({
      id: row.id,
      visitType: row.visit_type,
      weight: Number(row.weight ?? 1)
    }))
  }
}

async function loadVisitWeights(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  studyId: string
) {
  const { data: weights, error } = await supabase
    .from('visit_weights')
    .select('id, visit_type, weight')
    .eq('study_id', studyId)
    .order('visit_type', { ascending: true })

  if (error || !weights) {
    const code = (error as { code?: string } | null)?.code
    if (code === '42P01') {
      // visit_weights table does not exist yet (migration not applied)
      return { weights: [] }
    }
    return { error: NextResponse.json({ error: 'Failed to load visit weights' }, { status: 500 }) }
  }

  return { weights: weights as VisitWeightRow[] }
}

export async function GET(request: NextRequest, { params }: { params: { studyId: string } }) {
  try {
    const auth = await authorize(request)
    if ('error' in auth) return auth.error

    const { supabase, user } = auth
    const access = await verifyStudyAccess(supabase, params.studyId, user.id)
    if ('error' in access) return access.error

    const weightResult = await loadVisitWeights(supabase, params.studyId)
    if ('error' in weightResult) return weightResult.error

    return NextResponse.json(
      toResponse(access.study, weightResult.weights)
    )
  } catch (error) {
    logger.error('Error loading CWE study settings', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { studyId: string } }) {
  try {
    const auth = await authorize(request)
    if ('error' in auth) return auth.error

    const { supabase, user } = auth
    const access = await verifyStudyAccess(supabase, params.studyId, user.id)
    if ('error' in access) return access.error
    const studyRow = access.study as Record<string, unknown>
    const supportsMeeting = Object.prototype.hasOwnProperty.call(studyRow, 'meeting_admin_points')
    const supportsRubric = {
      trialType: Object.prototype.hasOwnProperty.call(studyRow, 'rubric_trial_type'),
      phase: Object.prototype.hasOwnProperty.call(studyRow, 'rubric_phase'),
      sponsor: Object.prototype.hasOwnProperty.call(studyRow, 'rubric_sponsor_type'),
      visitVolume: Object.prototype.hasOwnProperty.call(studyRow, 'rubric_visit_volume'),
      procedural: Object.prototype.hasOwnProperty.call(studyRow, 'rubric_procedural_intensity'),
      notes: Object.prototype.hasOwnProperty.call(studyRow, 'rubric_notes')
    }

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      lifecycle,
      protocolScore,
      screeningMultiplier,
      queryMultiplier,
      meetingAdminPoints,
      rubricTrialType,
      rubricPhase,
      rubricSponsorType,
      rubricVisitVolume,
      rubricProceduralIntensity,
      rubricNotes,
      visitWeights
    } = payload as {
      lifecycle?: LifecycleStage
      protocolScore?: number
      screeningMultiplier?: number
      queryMultiplier?: number
      meetingAdminPoints?: number
      rubricTrialType?: string | null
      rubricPhase?: string | null
      rubricSponsorType?: string | null
      rubricVisitVolume?: string | null
      rubricProceduralIntensity?: string | null
      rubricNotes?: string | null
      visitWeights?: Array<{ id?: string; visitType: string; weight: number }>
    }

    const updates: Record<string, unknown> = {}

    if (lifecycle) {
      if (!LIFECYCLE_STAGES.includes(lifecycle)) {
        return NextResponse.json({ error: 'Invalid lifecycle stage' }, { status: 400 })
      }
      updates.lifecycle = lifecycle
    }

    if (typeof protocolScore === 'number' && Number.isFinite(protocolScore)) {
      updates.protocol_score = protocolScore
    }

    if (typeof screeningMultiplier === 'number' && Number.isFinite(screeningMultiplier)) {
      updates.screening_multiplier = screeningMultiplier
    }

    if (typeof queryMultiplier === 'number' && Number.isFinite(queryMultiplier)) {
      updates.query_multiplier = queryMultiplier
    }

    if (supportsMeeting && typeof meetingAdminPoints === 'number' && Number.isFinite(meetingAdminPoints)) {
      updates.meeting_admin_points = meetingAdminPoints
    }

    if (supportsRubric.trialType && typeof rubricTrialType !== 'undefined') {
      updates.rubric_trial_type = rubricTrialType
    }
    if (supportsRubric.phase && typeof rubricPhase !== 'undefined') {
      updates.rubric_phase = rubricPhase
    }
    if (supportsRubric.sponsor && typeof rubricSponsorType !== 'undefined') {
      updates.rubric_sponsor_type = rubricSponsorType
    }
    if (supportsRubric.visitVolume && typeof rubricVisitVolume !== 'undefined') {
      updates.rubric_visit_volume = rubricVisitVolume
    }
    if (supportsRubric.procedural && typeof rubricProceduralIntensity !== 'undefined') {
      updates.rubric_procedural_intensity = rubricProceduralIntensity
    }
    if (supportsRubric.notes && typeof rubricNotes !== 'undefined') {
      updates.rubric_notes = rubricNotes
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('studies')
        .update(updates)
        .eq('id', params.studyId)

      if (updateError) {
        const message = (updateError as { message?: string }).message ?? ''
        const missingColumn = message.includes('column') && message.includes('does not exist')

        if (missingColumn) {
          const fallbackUpdates = { ...updates }
          delete (fallbackUpdates as any).meeting_admin_points
          delete (fallbackUpdates as any).rubric_trial_type
          delete (fallbackUpdates as any).rubric_phase
          delete (fallbackUpdates as any).rubric_sponsor_type
          delete (fallbackUpdates as any).rubric_visit_volume
          delete (fallbackUpdates as any).rubric_procedural_intensity
          delete (fallbackUpdates as any).rubric_notes

          if (Object.keys(fallbackUpdates).length > 0) {
            const { error: fallbackError } = await supabase
              .from('studies')
              .update(fallbackUpdates)
              .eq('id', params.studyId)

            if (fallbackError) {
              logger.error('Failed updating study CWE settings (fallback)', fallbackError)
              return NextResponse.json({ error: 'Failed to update study settings' }, { status: 500 })
            }
          }
        } else {
          logger.error('Failed updating study CWE settings', updateError)
          return NextResponse.json({ error: 'Failed to update study settings' }, { status: 500 })
        }
      }
    }

    if (Array.isArray(visitWeights) && visitWeights.length > 0) {
      const upsertRows = visitWeights
        .filter((row) => typeof row.visitType === 'string')
        .map((row) => ({
          id: row.id,
          study_id: params.studyId,
          visit_type: row.visitType,
          weight: Number(row.weight ?? 1) || 1
        }))

      if (upsertRows.length > 0) {
        const { error: upsertError } = await supabase
          .from('visit_weights')
          .upsert(upsertRows, { onConflict: 'study_id,visit_type' })

        if (upsertError) {
          const code = (upsertError as { code?: string } | null)?.code
          if (code === '42P01') {
            // visit_weights table not available; skip silently
          } else {
            logger.error('Failed upserting visit weights', upsertError)
            return NextResponse.json({ error: 'Failed to update visit weights' }, { status: 500 })
          }
        }
      }

    }

    const refreshedAccess = await verifyStudyAccess(supabase, params.studyId, user.id)
    if ('error' in refreshedAccess) return refreshedAccess.error

    const refreshedWeights = await loadVisitWeights(supabase, params.studyId)
    if ('error' in refreshedWeights) return refreshedWeights.error

    return NextResponse.json(
      toResponse(refreshedAccess.study, refreshedWeights.weights)
    )
  } catch (error) {
    logger.error('Error updating CWE study settings', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
