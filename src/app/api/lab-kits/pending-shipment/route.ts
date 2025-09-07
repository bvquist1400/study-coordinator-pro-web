import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import logger from '@/lib/logger'

type KitRow = { id: string; study_id: string; status: string; accession_number: string }

// POST /api/lab-kits/pending-shipment
// Payload: { studyId: string, labKitIds?: string[], accessionNumbers?: string[] }
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })

    const supabase = createSupabaseAdmin()
    const body = await request.json().catch(() => ({}))
    const studyId: string | undefined = body?.studyId
    const labKitIds: string[] = Array.isArray(body?.labKitIds)
      ? Array.from(
          new Set(
            (body.labKitIds as unknown[])
              .map((v) => String(v).trim())
              .filter(Boolean)
          )
        )
      : []
    const accessionNumbers: string[] = Array.isArray(body?.accessionNumbers)
      ? Array.from(
          new Set(
            (body.accessionNumbers as unknown[])
              .map((s) => String(s).trim())
              .filter(Boolean)
          )
        )
      : []

    if (!studyId) return NextResponse.json({ error: 'studyId is required' }, { status: 400 })
    if (labKitIds.length === 0 && accessionNumbers.length === 0) {
      return NextResponse.json({ error: 'Provide labKitIds or accessionNumbers' }, { status: 400 })
    }

    // Verify access to study
    const membership = await verifyStudyMembership(studyId, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Resolve kits by ID (limited to study)
    let kitsById: KitRow[] = []
    if (labKitIds.length > 0) {
      const { data, error } = await supabase
        .from('lab_kits')
        .select('id, study_id, status, accession_number')
        .in('id', labKitIds)
        .eq('study_id', studyId)
      if (error) {
        logger.error('Pending-shipment lookup by ID error', error as any)
        return NextResponse.json({ error: 'Failed to verify lab kits by ID' }, { status: 500 })
      }
      kitsById = (data || []) as KitRow[]
    }

    // Resolve kits by accession (global unique but validate study)
    const kitsByAcc: KitRow[] = []
    const accToReason = new Map<string, string>()
    if (accessionNumbers.length > 0) {
      const { data, error } = await supabase
        .from('lab_kits')
        .select('id, study_id, status, accession_number')
        .in('accession_number', accessionNumbers)
      if (error) {
        logger.error('Pending-shipment lookup by accession error', error as any)
        return NextResponse.json({ error: 'Failed to verify lab kits by accession' }, { status: 500 })
      }
      const found = (data || []) as KitRow[]
      const byAcc = new Map<string, KitRow>(found.map(k => [k.accession_number, k]))
      for (const acc of accessionNumbers) {
        const k = byAcc.get(acc)
        if (!k) {
          accToReason.set(acc, 'not_found')
        } else if (k.study_id !== studyId) {
          accToReason.set(acc, 'wrong_study')
        } else {
          kitsByAcc.push(k)
        }
      }
    }

    // Combine and validate transitions
    const allowedPrev = new Set(['available', 'assigned', 'used'])
    const allKitsMap = new Map<string, KitRow>()
    for (const k of [...kitsById, ...kitsByAcc]) allKitsMap.set(k.id, k)

    const invalid: Array<{ id?: string; accession_number?: string; reason: string }> = []
    const updatableIds: string[] = []

    for (const k of allKitsMap.values()) {
      if (!allowedPrev.has(k.status)) {
        invalid.push({ id: k.id, accession_number: k.accession_number, reason: `invalid_status:${k.status}` })
      } else {
        updatableIds.push(k.id)
      }
    }
    // Include accession numbers that were not found or wrong study
    for (const [acc, reason] of accToReason.entries()) {
      invalid.push({ accession_number: acc, reason })
    }

    // Perform update if any
    let updated = 0
    if (updatableIds.length > 0) {
      const { data: updatedRows, error: updErr } = await supabase
        .from('lab_kits')
        // @ts-expect-error update object
        .update({ status: 'pending_shipment' })
        .in('id', updatableIds)
        .select('id, accession_number')
      if (updErr) {
        logger.error('Pending-shipment update error', updErr as any)
        return NextResponse.json({ error: 'Failed to update lab kits' }, { status: 500 })
      }
      updated = (updatedRows || []).length

      // Reset any existing shipped date on the most recent visit using the accession
      for (const row of updatedRows || []) {
        const acc = (row as any).accession_number as string | null
        if (!acc) continue
        const { data: visit } = await supabase
          .from('subject_visits')
          .select('id')
          .eq('accession_number', acc)
          .order('visit_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        const visitId = (visit as any)?.id
        if (visitId) {
          await (supabase as any)
            .from('subject_visits')
            .update({ lab_kit_shipped_date: null } as any)
            .eq('id', visitId)
        }
      }
    }

    return NextResponse.json({ updated, updatedIds: updatableIds, invalid })
  } catch (e) {
    logger.error('Pending-shipment POST error', e as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
