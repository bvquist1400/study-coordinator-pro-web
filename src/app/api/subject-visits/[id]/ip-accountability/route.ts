import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, verifyStudyMembership, createSupabaseAdmin } from '@/lib/api/auth'
import { saveVisitWithIP, type VisitIPData } from '@/lib/ip-accountability'
import logger from '@/lib/logger'
import type { SubjectVisitUpdate } from '@/types/database'

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
  
  // New aggregated per-drug cycles path
  if (requestData.cycles || requestData.adjustments) {
      const cycles = (requestData.cycles || []) as Array<any>
      const adjustments = (requestData.adjustments || []) as Array<any>

      // Helper: resolve drug_id by label (code or name) within study
      const resolveDrugId = async (label?: string, directId?: string): Promise<string | null> => {
        if (directId) return directId
        if (!label) return null
        const { data } = await supabase
          .from('study_drugs')
          .select('id, code, name')
          .eq('study_id', vAny.study_id)
          .or(`code.ilike.%${label}%,name.ilike.%${label}%`)
          .limit(1)
          .maybeSingle()
        return (data as any)?.id || null
      }

      // Upsert cycles per drug for this visit
      for (const c of cycles) {
        const drugId = await resolveDrugId(c.drug_label || c.drug_code || c.drug_name, c.drug_id)
        if (!drugId) {
          return NextResponse.json({ error: `Unknown drug: ${c.drug_label || c.drug_code || c.drug_name || c.drug_id}` }, { status: 400 })
        }
        const tabletsDispensed = c.tablets_dispensed ?? ((c.bottles || 0) * (c.tablets_per_bottle || 0))
        if (!tabletsDispensed || tabletsDispensed <= 0) {
          return NextResponse.json({ error: 'tablets_dispensed must be > 0 (or provide bottles and tablets_per_bottle)' }, { status: 400 })
        }
        const row = {
          subject_id: vAny.subject_id,
          visit_id: resolvedParams.id,
          drug_id: drugId,
          dispensing_date: c.start_date,
          last_dose_date: c.last_dose_date || null,
          tablets_dispensed: tabletsDispensed,
          tablets_returned: c.tablets_returned || 0,
          notes: c.notes || null,
          updated_at: new Date().toISOString()
        } as any
        const { error: upsertErr } = await supabase
          .from('subject_drug_cycles')
          .upsert(row, { onConflict: 'subject_id,visit_id,drug_id' } as any)
        if (upsertErr) {
          logger.error('subject_drug_cycles upsert failed', upsertErr as any)
          return NextResponse.json({ error: 'Failed to save drug cycles', detail: upsertErr.message }, { status: 500 })
        }
      }

      // Adjustments (optional): create or update a cycle and insert adjustment
      for (const a of adjustments) {
        const drugId = await resolveDrugId(a.drug_label || a.drug_code || a.drug_name, a.drug_id)
        if (!drugId) {
          return NextResponse.json({ error: `Unknown drug in adjustment: ${a.drug_label || a.drug_code || a.drug_name || a.drug_id}` }, { status: 400 })
        }
        const delta = Number(a.delta_tablets || 0)
        if (!delta) continue
        const targetVisitId = a.visit_id || resolvedParams.id || null
        const { data: existing } = await supabase
          .from('subject_drug_cycles')
          .select('id, tablets_dispensed, tablets_returned')
          .eq('subject_id', vAny.subject_id)
          .eq('drug_id', drugId)
          .eq('visit_id', targetVisitId)
          .maybeSingle()
        let cycleId = (existing as any)?.id
        if (!cycleId) {
          const { data: inserted, error: insErr } = await supabase
            .from('subject_drug_cycles')
            .insert({
              subject_id: vAny.subject_id,
              visit_id: targetVisitId,
              drug_id: drugId,
              tablets_dispensed: 0,
              tablets_returned: 0,
              dispensing_date: null,
              last_dose_date: null
            } as any)
            .select('id')
            .single()
          if (insErr) {
            logger.error('Create cycle for adjustment failed', insErr as any)
            return NextResponse.json({ error: 'Failed to create cycle for adjustment', detail: insErr.message }, { status: 500 })
          }
          cycleId = (inserted as any).id
        }

        const eventDate = a.event_date || new Date().toISOString().slice(0, 10)
        const { error: adjErr } = await supabase
          .from('drug_cycle_adjustments')
          .insert({
            cycle_id: cycleId,
            event_type: a.type || (delta > 0 ? 'return' : 'correction'),
            delta_tablets: delta,
            event_date: eventDate,
            reason: a.reason || null,
            user_id: user.id
          } as any)
        if (adjErr) {
          logger.error('Insert adjustment failed', adjErr as any)
          return NextResponse.json({ error: 'Failed to save adjustment', detail: adjErr.message }, { status: 500 })
        }

        // Simple roll-up into cycle totals
        if ((a.type === 'return') || delta > 0) {
          const { error: updErr } = await supabase
            .from('subject_drug_cycles')
            .update({
              tablets_returned: ((existing as any)?.tablets_returned || 0) + delta,
              last_dose_date: eventDate
            } as any)
            .eq('id', cycleId)
          if (updErr) logger.warn?.('Cycle roll-up (return) failed', updErr as any)
        } else if (a.type === 'dispense') {
          const { error: updErr } = await supabase
            .from('subject_drug_cycles')
            .update({ tablets_dispensed: ((existing as any)?.tablets_dispensed || 0) + Math.abs(delta) } as any)
            .eq('id', cycleId)
          if (updErr) logger.warn?.('Cycle roll-up (dispense) failed', updErr as any)
        }
      }

      // Update visit record (status + light snapshot)
      const updateData: any = { status: requestData.status || 'completed' }
      if (cycles.length > 0) {
        const first = cycles[0]
        updateData.ip_dispensed = first.tablets_dispensed ?? ((first.bottles || 0) * (first.tablets_per_bottle || 0))
        updateData.ip_start_date = first.start_date || null
      }
      const firstReturn = cycles.find((c: any) => (c.tablets_returned || 0) > 0)
      if (firstReturn) {
        updateData.ip_returned = firstReturn.tablets_returned
        updateData.ip_last_dose_date = firstReturn.last_dose_date || null
      }
      const { error: visitError } = await (supabase
        .from('subject_visits') as any)
        .update(updateData as SubjectVisitUpdate)
        .eq('id', resolvedParams.id)
      if (visitError) {
        logger.error('Error updating visit (cycles)', visitError as any)
        return NextResponse.json({ error: 'Failed to update visit record', detail: visitError.message }, { status: 500 })
      }

    // Handle multi-bottle data if present
    } else if (requestData.dispensed_bottles || requestData.returned_bottles) {
      // Multi-bottle format: validate and call atomic RPC (mandatory)
      const dispensedBottles = (requestData.dispensed_bottles || []).filter((b: any) => b && b.ip_id && b.count > 0 && b.start_date)
      const returnedBottles = (requestData.returned_bottles || []).filter((b: any) => b && b.ip_id && b.count > 0 && b.last_dose_date)

      if (dispensedBottles.length > 0 || returnedBottles.length > 0) {
        const rpcPayload = {
          p_subject_id: vAny.subject_id,
          p_user_id: user.id,
          p_visit_id: resolvedParams.id,
          p_dispensed: dispensedBottles,
          p_returned: returnedBottles
        } as any
        const rpc = await supabase.rpc('save_visit_ip_batch', rpcPayload)
        if (rpc.error) {
          logger.error('RPC save_visit_ip_batch error', rpc.error as any)
          return NextResponse.json({ error: 'Failed to save IP accountability', detail: rpc.error.message }, { status: 500 })
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

    // Fetch updated visit and create lab_kit_usage if applicable
    const { data: updatedVisit } = await supabase
      .from('subject_visits')
      .select('id, status, accession_number, visit_date')
      .eq('id', resolvedParams.id)
      .single()

    // Create usage record on completion when accession_number resolves to a known kit
    try {
      const v: any = updatedVisit
      if (v && v.status === 'completed' && v.accession_number) {
        const { data: kit } = await supabase
          .from('lab_kits')
          .select('id')
          .eq('accession_number', v.accession_number)
          .maybeSingle()
        const kitId = (kit as any)?.id
        if (kitId) {
          const { data: existingUsage } = await supabase
            .from('lab_kit_usage')
            .select('id')
            .eq('lab_kit_id', kitId)
            .eq('subject_visit_id', resolvedParams.id)
            .maybeSingle()
          if (!existingUsage) {
            await supabase
              .from('lab_kit_usage')
              .insert({
                lab_kit_id: kitId,
                subject_visit_id: resolvedParams.id,
                used_date: v.visit_date,
                used_by_user_id: user.id
              } as any)
          }
        }
      }
    } catch (e) {
      logger.warn?.('lab_kit_usage insert failed', e as any)
    }

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
