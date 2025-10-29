import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

export async function GET(request: NextRequest) {
  const auth = await authenticateUser(request)
  if (!auth.user) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: auth.status ?? 401 })
  }

  try {
    const supabase = createSupabaseAdmin()

    const { data: membershipRows, error: membershipError } = await supabase
      .from('site_members')
      .select('site_id')
      .eq('user_id', auth.user.id)

    if (membershipError) {
      logger.error('Failed to load site memberships for coordinator directory', membershipError)
      return NextResponse.json({ error: 'Failed to resolve memberships' }, { status: 500 })
    }

    const siteIds = (membershipRows ?? [])
      .map((row: any) => row.site_id)
      .filter((id: string | null): id is string => !!id)

    const { data: coordinatorMembers, error: coordinatorsError } = await supabase
      .from('site_members')
      .select('site_id, user_id, role')
      .in('site_id', siteIds.length > 0 ? siteIds : ['00000000-0000-0000-0000-000000000000'])

    if (coordinatorsError) {
      logger.error('Failed to load coordinators', coordinatorsError)
      return NextResponse.json({ error: 'Failed to load coordinators' }, { status: 500 })
    }

    const coordinatorIds = new Set<string>([auth.user.id])
    for (const row of coordinatorMembers ?? []) {
      if (row.role === 'coordinator' || row.role === 'owner' || row.role === 'pi') {
        coordinatorIds.add(row.user_id)
      }
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, organization, created_at')
      .in('id', Array.from(coordinatorIds))

    if (profilesError) {
      logger.error('Failed to load coordinator profiles', profilesError)
      return NextResponse.json({ error: 'Failed to load coordinator profiles' }, { status: 500 })
    }

    const { data: assignmentData, error: assignmentsError } = await supabase
      .from('study_coordinators' as any)
      .select('coordinator_id, role, joined_at, studies!inner(id, study_title, protocol_number)')

    if (assignmentsError && assignmentsError.code !== '42P01') {
      logger.error('Failed to load coordinator assignments', assignmentsError)
      return NextResponse.json({ error: 'Failed to load coordinator assignments' }, { status: 500 })
    }

    type AssignmentRow = {
      coordinator_id: string | null
      role: string | null
      joined_at: string
      studies: null | {
        id: string
        study_title: string
        protocol_number: string
      }
    }

    const assignmentRows = ((assignmentData ?? []) as unknown[]).filter(
      (row): row is AssignmentRow =>
        !!row &&
        typeof row === 'object' &&
        'coordinator_id' in row &&
        'studies' in row
    )
    const assignmentsByCoordinator = new Map<string, Array<{ id: string; studyTitle: string; protocolNumber: string; joinedAt: string; role: string | null }>>()
    for (const row of assignmentRows) {
      const coordinatorId = row.coordinator_id as string | undefined
      if (!coordinatorId || !row.studies) continue
      const list = assignmentsByCoordinator.get(coordinatorId) ?? []
      list.push({
        id: row.studies.id,
        studyTitle: row.studies.study_title,
        protocolNumber: row.studies.protocol_number,
        joinedAt: row.joined_at,
        role: row.role ?? null
      })
      assignmentsByCoordinator.set(coordinatorId, list)
    }

    const coordinators = (profiles ?? []).map((profile) => ({
      id: profile.id,
      name: profile.full_name ?? profile.email ?? 'Unknown',
      email: profile.email,
      organization: profile.organization,
      createdAt: profile.created_at,
      assignments: assignmentsByCoordinator.get(profile.id) ?? []
    }))

    return NextResponse.json({ coordinators })
  } catch (error) {
    logger.error('Unexpected error loading coordinators', error as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
