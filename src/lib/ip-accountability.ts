import { createSupabaseAdmin } from '@/lib/api/auth'

export interface VisitIPData {
  visit_id: string
  visit_date: string
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled'
  
  // New dispensing at this visit
  ip_id_new?: string
  ip_dispensed_new?: number
  ip_start_date_new?: string
  
  // Return from previous visit
  ip_return_bottle_id?: string
  ip_returned_count?: number
  ip_last_dose_date_current_visit?: string
  
  // Other fields
  procedures_completed?: string[]
  notes?: string
  accession_number?: string
  airway_bill_number?: string
  lab_kit_shipped_date?: string
  local_labs_completed?: boolean
}

export interface DrugComplianceMetrics {
  actual_taken: number
  expected_taken: number | null
  compliance_percentage: number | null
}

/**
 * Save visit with IP accountability in a single transaction
 * Handles both returns (updating prior bottle) and new dispensing
 */
export async function saveVisitWithIP(
  subjectId: string,
  userId: string,
  visitData: VisitIPData
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = createSupabaseAdmin()
  
  try {
    const result = await supabase.rpc('save_visit_with_ip_transaction', {
      p_subject_id: subjectId,
      p_user_id: userId,
      p_visit_data: visitData
    })
    
    if (result.error) {
      console.error('Transaction failed:', result.error)
      return { success: false, error: result.error.message }
    }
    
    return { success: true }
  } catch (error) {
    console.error('saveVisitWithIP error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Calculate drug compliance metrics
 * Used for client-side preview or validation
 */
export function calculateComplianceMetrics(
  dispensedCount: number,
  returnedCount: number,
  dispensingDate: string,
  assessmentDate: string,
  dosePerDay: number = 1
): DrugComplianceMetrics {
  const actualTaken = dispensedCount - (returnedCount || 0)
  
  const dispenseDate = new Date(dispensingDate)
  const assessDate = new Date(assessmentDate)
  const daysBetween = Math.max(0, Math.floor((assessDate.getTime() - dispenseDate.getTime()) / (1000 * 60 * 60 * 24)))
  
  const expectedTaken = daysBetween * dosePerDay
  const compliancePercentage = expectedTaken > 0 
    ? Math.round((actualTaken / expectedTaken) * 100 * 100) / 100  // Round to 2 decimal places
    : null
    
  return {
    actual_taken: actualTaken,
    expected_taken: expectedTaken > 0 ? expectedTaken : null,
    compliance_percentage: compliancePercentage
  }
}

/**
 * Find prior visit where a specific IP bottle was dispensed
 */
export async function findPriorIPVisit(
  subjectId: string, 
  ipId: string
): Promise<{ visit_id: string; ip_dispensed: number; ip_start_date: string; visit_date: string } | null> {
  const supabase = createSupabaseAdmin()
  
  const { data, error } = await supabase
    .from('subject_visits')
    .select('id, ip_dispensed, ip_start_date, visit_date')
    .eq('subject_id', subjectId)
    .eq('ip_id', ipId)
    .not('ip_dispensed', 'is', null)
    .order('visit_date', { ascending: false })
    .limit(1)
    .single()
    
  if (error || !data) {
    return null
  }
  
  return {
    visit_id: data.id,
    ip_dispensed: data.ip_dispensed,
    ip_start_date: data.ip_start_date || data.visit_date,
    visit_date: data.visit_date
  }
}