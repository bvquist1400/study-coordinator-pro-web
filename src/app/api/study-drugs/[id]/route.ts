import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin, verifyStudyMembership } from '@/lib/api/auth'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error: authError, status: authStatus } = await authenticateUser(request)
  if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
  const supabase = createSupabaseAdmin()
  const { id } = params
  const payload = await request.json()
  const { data: drug } = await (supabase.from as any)('study_drugs').select('study_id').eq('id', id).maybeSingle()
  if (!drug) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const membership = await verifyStudyMembership((drug as any).study_id, user.id)
  if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
  const { error } = await (supabase.from as any)('study_drugs').update({
    code: payload.code,
    name: payload.name,
    dosing_frequency: payload.dosing_frequency,
    dose_per_day: payload.dose_per_day,
    notes: payload.notes || null
  }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error: authError, status: authStatus } = await authenticateUser(request)
  if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
  const supabase = createSupabaseAdmin()
  const { id } = params
  const { data: drug } = await (supabase.from as any)('study_drugs').select('study_id').eq('id', id).maybeSingle()
  if (!drug) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const membership = await verifyStudyMembership((drug as any).study_id, user.id)
  if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })
  const { error } = await (supabase.from as any)('study_drugs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
