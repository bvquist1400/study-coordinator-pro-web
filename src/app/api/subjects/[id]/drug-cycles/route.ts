import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createSupabaseAdmin, verifyStudyMembership } from '@/lib/api/auth'

// GET /api/subjects/[id]/drug-cycles - per-visit per-drug cycles and per-visit averages
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const supabase = createSupabaseAdmin()
    const { id: subjectId } = params

    // Find subject and study for membership
    const { data: subject } = await supabase
      .from('subjects')
      .select('id, study_id')
      .eq('id', subjectId)
      .maybeSingle()
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    const membership = await verifyStudyMembership((subject as any).study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    // Load cycles for subject with joins
    const { data: rows, error } = await supabase
      .from('subject_drug_cycles')
      .select('id, visit_id, dispensing_date, last_dose_date, tablets_dispensed, tablets_returned, expected_taken, compliance_percentage, drug_id, study_drugs(code, name, dose_per_day), subject_visits(visit_date, visit_name)')
      .eq('subject_id', subjectId)
      .order('visit_id', { ascending: true })
    if (error) return NextResponse.json({ error: 'Failed to load cycles' }, { status: 500 })

    // Group by visit_id
    const grouped: Record<string, { visit_id: string; visit_date: string; visit_name: string | null; items: any[] }> = {}
    for (const r of rows || []) {
      const vId = (r as any).visit_id || 'unlinked'
      const vDate = (r as any).subject_visits?.visit_date || (r as any).dispensing_date || null
      const vName = (r as any).subject_visits?.visit_name || null
      if (!grouped[vId]) grouped[vId] = { visit_id: vId, visit_date: vDate, visit_name: vName, items: [] }
      // Compute expected return date here
      const start = (r as any).dispensing_date
      const dispensed = Number((r as any).tablets_dispensed || 0)
      const dpd = Number((r as any).study_drugs?.dose_per_day || 1)
      let expected_return_date: string | null = null
      if (start && dispensed > 0 && dpd > 0) {
        const d = new Date(start + 'T00:00:00Z')
        const durationDays = Math.ceil(dispensed / dpd)
        d.setUTCDate(d.getUTCDate() + Math.max(0, durationDays - 1))
        expected_return_date = d.toISOString().split('T')[0]
      }
      grouped[vId].items.push({
        drug_id: (r as any).drug_id,
        drug_code: (r as any).study_drugs?.code || null,
        drug_name: (r as any).study_drugs?.name || null,
        first_dose_date: (r as any).dispensing_date,
        tablets_dispensed: (r as any).tablets_dispensed,
        tablets_returned: (r as any).tablets_returned,
        last_dose_date: (r as any).last_dose_date,
        expected_return_date,
        compliance_percentage: (r as any).compliance_percentage
      })
    }

    const per_visit = Object.values(grouped).map(v => {
      const nums = v.items.map(i => typeof i.compliance_percentage === 'number' ? i.compliance_percentage as number : null).filter((n): n is number => n != null)
      const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null
      return { ...v, avg_compliance: avg }
    }).sort((a, b) => (a.visit_date || '').localeCompare(b.visit_date || ''))

    return NextResponse.json({ per_visit })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
