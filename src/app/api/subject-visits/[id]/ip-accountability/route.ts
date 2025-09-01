import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/api/auth'
import { saveVisitWithIP, type VisitIPData } from '@/lib/ip-accountability'

// PUT /api/subject-visits/[id]/ip-accountability - Save visit with IP accountability
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const resolvedParams = await params
    
    // Verify the JWT token
    const supabase = createSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

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
      .eq('id', visit.study_id)
      .single()

    if (!study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 })
    }

    // Check permissions
    if (study.site_id) {
      const { data: member } = await supabase
        .from('site_members')
        .select('user_id')
        .eq('site_id', study.site_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (study.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

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
    const result = await saveVisitWithIP(visit.subject_id, user.id, visitData)
    
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