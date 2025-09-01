import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import { saveVisitWithIP, type VisitIPData } from '@/lib/ip-accountability'

// PUT /api/subject-visits/[id]/ip-accountability - Save visit with IP accountability
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError, status: authStatus } = await authenticateUser(request)
    if (authError || !user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: authStatus || 401 })
    const resolvedParams = await params
    
    // DB client
    const supabase = createSupabaseAdmin()

    // Get the visit and verify ownership
    const { data: visit } = await supabase
      .from('subject_visits')
      .select('subject_id, study_id')
      .eq('id', resolvedParams.id)
      .single()

    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    }

    // Verify user has access to this study
    const { data: study } = await supabase
      .from('studies')
      .select('site_id, user_id')
      .eq('id', (visit as any).study_id)
      .single()

    if (!study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    // Check permissions
    const vAny = visit as any
    const membership = await verifyStudyMembership(vAny.study_id, user.id)
    if (!membership.success) return NextResponse.json({ error: membership.error || 'Access denied' }, { status: membership.status || 403 })

    const requestData = await request.json()
    
    // Map request data to VisitIPData format
    const visitData: VisitIPData = {
      visit_id: resolvedParams.id,
      visit_date: requestData.visit_date || requestData.scheduled_date,
      status: requestData.status || 'completed',
      
      // New dispensing
      ip_id_new: requestData.ip_id,
      ip_dispensed_new: requestData.ip_dispensed ? parseInt(requestData.ip_dispensed) : undefined,
      ip_start_date_new: requestData.ip_start_date,
      
      // Return from previous visit
      ip_return_bottle_id: requestData.return_ip_id,
      ip_returned_count: requestData.ip_returned ? parseInt(requestData.ip_returned) : undefined,
      ip_last_dose_date_current_visit: requestData.ip_last_dose_date,
      
      // Other fields
      procedures_completed: requestData.procedures_completed,
      notes: requestData.notes,
      accession_number: requestData.accession_number,
      airway_bill_number: requestData.airway_bill_number,
      lab_kit_shipped_date: requestData.lab_kit_shipped_date,
      local_labs_completed: requestData.local_labs_completed
    }

    // Save with transaction
    const result = await saveVisitWithIP(vAny.subject_id, user.id, visitData)
    
    if (!result.success) {
      console.error('IP accountability save failed:', result.error)
      return NextResponse.json({ 
        error: 'Failed to save visit with IP accountability',
        detail: result.error 
      }, { status: 500 })
    }

    // Return updated visit data
    const { data: updatedVisit } = await supabase
      .from('subject_visits')
      .select('*')
      .eq('id', resolvedParams.id)
      .single()

    return NextResponse.json({ 
      visit: updatedVisit,
      ip_result: result
    })
    
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      detail: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
