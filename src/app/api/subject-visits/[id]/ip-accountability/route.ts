import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import { saveVisitWithIP, type VisitIPData } from '@/lib/ip-accountability'
import logger from '@/lib/logger'
import type { DrugComplianceUpdate, DrugComplianceInsert, SubjectVisitUpdate } from '@/types/database'

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
    
    // Handle multi-bottle data if present
    if (requestData.dispensed_bottles || requestData.returned_bottles) {
      // Multi-bottle format - save each bottle separately
      const dispensedBottles = requestData.dispensed_bottles || []
      const returnedBottles = requestData.returned_bottles || []
      
      // Save dispensed bottles
      for (const bottle of dispensedBottles) {
        if (bottle.ip_id && bottle.count > 0 && bottle.start_date) {
          const { error } = await (supabase
            .from('drug_compliance') as any)
            .insert({
              subject_id: vAny.subject_id,
              user_id: user.id,
              assessment_date: bottle.start_date,
              dispensed_count: bottle.count,
              returned_count: 0,
              expected_taken: 0, // Will be calculated by trigger
              visit_id: resolvedParams.id,
              ip_id: bottle.ip_id.trim(),
              dispensing_date: bottle.start_date
            } as DrugComplianceInsert)
          
          if (error) {
            logger.error('Error saving dispensed bottle', error)
            return NextResponse.json({ 
              error: 'Failed to save dispensed bottle data',
              detail: error.message 
            }, { status: 500 })
          }
        }
      }
      
      // Save returned bottles
      for (const bottle of returnedBottles) {
        if (bottle.ip_id && bottle.count > 0 && bottle.last_dose_date) {
          // Find existing compliance record for this bottle
          const { data: existing } = await supabase
            .from('drug_compliance')
            .select('*')
            .eq('subject_id', vAny.subject_id)
            .eq('ip_id', bottle.ip_id.trim())
            .order('dispensing_date', { ascending: false })
            .limit(1)

          if (existing && existing.length > 0) {
            // Update existing record with return data
            const startDate = new Date((existing[0] as any).dispensing_date || bottle.last_dose_date)
            const endDate = new Date(bottle.last_dose_date)
            const daysDifference = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
            const expected = daysDifference * 1 // Default 1 dose per day

            const { error } = await (supabase
              .from('drug_compliance') as any)
              .update({
                returned_count: bottle.count,
                assessment_date: bottle.last_dose_date,
                expected_taken: expected,
                ip_last_dose_date: bottle.last_dose_date
              } as DrugComplianceUpdate)
              .eq('id', (existing[0] as any).id)
              
            if (error) {
              logger.error('Error updating returned bottle', error)
              return NextResponse.json({ 
                error: 'Failed to update returned bottle data',
                detail: error.message 
              }, { status: 500 })
            }
          } else {
            // Create new return-only record if no dispensing record exists
            const { error } = await (supabase
              .from('drug_compliance') as any)
              .insert({
                subject_id: vAny.subject_id,
                user_id: user.id,
                assessment_date: bottle.last_dose_date,
                dispensed_count: 0,
                returned_count: bottle.count,
                expected_taken: 0,
                visit_id: resolvedParams.id,
                ip_id: bottle.ip_id.trim(),
                ip_last_dose_date: bottle.last_dose_date
              } as DrugComplianceInsert)
              
            if (error) {
              logger.error('Error saving returned bottle', error)
              return NextResponse.json({ 
                error: 'Failed to save returned bottle data',
                detail: error.message 
              }, { status: 500 })
            }
          }
        }
      }
      
      // Update visit record with summary data (using first bottle for backward compatibility)
      const updateData: any = {
        status: requestData.status || 'completed'
      }
      
      if (dispensedBottles.length > 0) {
        const firstDispensed = dispensedBottles[0]
        updateData.ip_dispensed = firstDispensed.count
        updateData.ip_id = firstDispensed.ip_id
        updateData.ip_start_date = firstDispensed.start_date
      }
      
      if (returnedBottles.length > 0) {
        const firstReturned = returnedBottles[0]
        updateData.ip_returned = firstReturned.count
        updateData.return_ip_id = firstReturned.ip_id
        updateData.ip_last_dose_date = firstReturned.last_dose_date
      }
      
      const { error: visitError } = await (supabase
        .from('subject_visits') as any)
        .update(updateData as SubjectVisitUpdate)
        .eq('id', resolvedParams.id)
        
      if (visitError) {
        logger.error('Error updating visit', visitError as any)
        return NextResponse.json({ 
          error: 'Failed to update visit record',
          detail: visitError.message 
        }, { status: 500 })
      }
      
    } else {
      // Legacy single-bottle format - use existing logic
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

      // Save with transaction using existing function
      const result = await saveVisitWithIP(vAny.subject_id, user.id, visitData)
      
      if (!result.success) {
        logger.error('IP accountability save failed', result.error as any)
        return NextResponse.json({ 
          error: 'Failed to save visit with IP accountability',
          detail: result.error 
        }, { status: 500 })
      }
    }

    // Return updated visit data
    const { data: updatedVisit } = await supabase
      .from('subject_visits')
      .select('*')
      .eq('id', resolvedParams.id)
      .single()

    return NextResponse.json({ 
      visit: updatedVisit,
      success: true
    })
    
  } catch (error) {
    logger.error('API error in IP accountability PUT', error as any)
    return NextResponse.json({ 
      error: 'Internal server error',
      detail: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
