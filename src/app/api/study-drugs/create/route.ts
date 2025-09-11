import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin, verifyStudyMembership } from '@/lib/api/auth'

// POST /api/study-drugs/create?studyId=...
export async function POST(request: NextRequest) {
  const { user, error: authError, status: authStatus } = await authenticateUser(request)
  if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
  const supabase = createSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const studyId = searchParams.get('studyId')
  if (!studyId) return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
  const membership = await verifyStudyMembership(studyId, user.id)
  if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
  const payload = await request.json()
  const { error } = await supabase.from('study_drugs').insert({
    study_id: studyId,
    code: payload.code,
    name: payload.name,
    dosing_frequency: payload.dosing_frequency || null,
    dose_per_day: payload.dose_per_day || null,
    notes: payload.notes || null
  } as any)
  if (error) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json({ success: true })
}

