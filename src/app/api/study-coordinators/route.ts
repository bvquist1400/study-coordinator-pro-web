import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

export async function GET(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const studyId = searchParams.get('studyId')
    const coordinatorId = searchParams.get('coordinatorId')

    const supabase = createSupabaseAdmin()
    let query = supabase
      .from('study_coordinators')
      .select('id, study_id, coordinator_id, role, joined_at, created_at, updated_at, studies!inner(id, study_title, protocol_number)')

    if (studyId) {
      query = query.eq('study_id', studyId)
    }

    if (coordinatorId) {
      query = query.eq('coordinator_id', coordinatorId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to load study coordinators', error as any, { studyId, coordinatorId })
      return NextResponse.json({ error: 'Failed to load study coordinators' }, { status: 500 })
    }

    const assignments = (data ?? []).map((row: any) => ({
      id: row.id,
      studyId: row.study_id,
      coordinatorId: row.coordinator_id,
      role: row.role,
      joinedAt: row.joined_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      study: row.studies
        ? {
            id: row.studies.id,
            studyTitle: row.studies.study_title,
            protocolNumber: row.studies.protocol_number
          }
        : null
    }))

    return NextResponse.json({ assignments })
  } catch (error) {
    logger.error('Unexpected error loading study coordinators', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface AssignmentPayload {
  studyId?: string
  coordinatorId?: string
  role?: string | null
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const payload = (await request.json()) as AssignmentPayload | null
    const studyId = payload?.studyId
    const coordinatorId = payload?.coordinatorId

    if (!studyId || !coordinatorId) {
      return NextResponse.json({ error: 'studyId and coordinatorId are required' }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()

    const { data, error } = await supabase
      .from('study_coordinators')
      .upsert(
        {
          study_id: studyId,
          coordinator_id: coordinatorId,
          role: payload?.role ?? null
        },
        { onConflict: 'study_id,coordinator_id' }
      )
      .select('id, study_id, coordinator_id, role, joined_at, created_at, updated_at')
      .single()

    if (error) {
      logger.error('Failed to save study coordinator assignment', error as any, { studyId, coordinatorId })
      return NextResponse.json({ error: 'Failed to save study coordinator assignment' }, { status: 500 })
    }

    return NextResponse.json({ assignment: data })
  } catch (error) {
    logger.error('Unexpected error saving study coordinator assignment', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
