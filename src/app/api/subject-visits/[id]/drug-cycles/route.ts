import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin, verifyStudyMembership } from '@/lib/api/auth'

// GET /api/subject-visits/[id]/drug-cycles - Per-visit per-drug cycles with compliance fields
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()
    const { id: visitId } = await params

    // Load visit to verify membership
    const { data: visit, error: vErr } = await supabase
      .from('subject_visits')
      .select('id, subject_id, study_id, visit_date')
      .eq('id', visitId)
      .maybeSingle()
    if (vErr || !visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

    const membership = await verifyStudyMembership((visit as any).study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Join subject_drug_cycles to study_drugs to fetch code/name and dosing
    const { data: cycles, error: cErr } = await supabase
      .from('subject_drug_cycles')
      .select('id, drug_id, dispensing_date, last_dose_date, tablets_dispensed, tablets_returned, expected_taken, compliance_percentage, study_drugs(code, name, dose_per_day)')
      .eq('visit_id', visitId)
    if (cErr) return NextResponse.json({ error: 'Failed to load drug cycles' }, { status: 500 })

    // Compute expected return date (dispense + ceil(dispensed/dose_per_day) - 1)
    const result = (cycles || []).map((row: any) => {
      const start = row.dispensing_date
      const dispensed = Number(row.tablets_dispensed || 0)
      const dpd = Number(row.study_drugs?.dose_per_day || 1)
      let expected_return_date: string | null = null
      if (start && dispensed > 0 && dpd > 0) {
        const d = new Date(start + 'T00:00:00Z')
        const durationDays = Math.ceil(dispensed / dpd)
        d.setUTCDate(d.getUTCDate() + Math.max(0, durationDays - 1))
        expected_return_date = d.toISOString().split('T')[0]
      }
      return {
        id: row.id,
        drug_id: row.drug_id,
        drug_code: row.study_drugs?.code || null,
        drug_name: row.study_drugs?.name || null,
        dispensing_date: row.dispensing_date,
        last_dose_date: row.last_dose_date,
        tablets_dispensed: row.tablets_dispensed,
        tablets_returned: row.tablets_returned,
        expected_taken: row.expected_taken,
        compliance_percentage: row.compliance_percentage,
        expected_return_date
      }
    })

    return NextResponse.json({ cycles: result })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
