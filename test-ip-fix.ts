/**
 * Test script to validate IP return linkage fix
 * Run with: npx tsx test-ip-fix.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { saveVisitWithIP } from './src/lib/ip-accountability'

// Load environment variables
config({ path: '.env.local' })

// Create Supabase client with service role key for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SUBJECT_ID = '5ab7f6df-6338-41f1-8280-217af8e135ae'
const VISIT_B_ID = 'e79a38f8-f787-4aca-8943-9c334da46fe9'
const USER_ID = 'e60dbbb8-e949-4597-b848-18f4456b7a25' // Replace with actual user ID

async function testIPFix() {
  console.log('🧪 Testing IP return linkage fix...\n')
  
  try {
    // 1. Check initial state
    console.log('📋 Initial state:')
    const { data: beforeVisits } = await supabase
      .from('subject_visits')
      .select('id, visit_name, ip_id, ip_dispensed, ip_returned, visit_date')
      .eq('subject_id', SUBJECT_ID)
      .order('visit_date')
    
    console.log('Visits before:', beforeVisits)
    
    const { data: beforeCompliance } = await supabase
      .from('drug_compliance')
      .select('ip_id, dispensed_count, returned_count, actual_taken, expected_taken, compliance_percentage, assessment_date, dispensing_date')
      .eq('subject_id', SUBJECT_ID)
      .order('dispensing_date')
    
    console.log('Compliance before:', beforeCompliance)
    
    // 2. Simulate Visit B save with corrected logic
    console.log('\n🔄 Processing Visit B with correct IP linkage...')
    
    const visitBData = {
      visit_id: VISIT_B_ID,
      visit_date: '2025-08-31',
      status: 'completed' as const,
      
      // Return 40 tablets from bottle 001 (from Baseline visit)
      ip_return_bottle_id: '001',
      ip_returned_count: 40,
      ip_last_dose_date_current_visit: '2025-08-31',
      
      // Dispense new bottle 002 with 50 tablets
      ip_id_new: '002',
      ip_dispensed_new: 50,
      ip_start_date_new: '2025-08-31'
    }
    
    const result = await saveVisitWithIP(SUBJECT_ID, USER_ID, visitBData)
    
    if (!result.success) {
      console.error('❌ Save failed:', result.error)
      return
    }
    
    console.log('✅ Save succeeded:', result)
    
    // Also call the database function directly to see what it returns
    console.log('\n🔍 Direct database function call:')
    const { data: dbResult, error: dbError } = await supabase.rpc('save_visit_with_ip_transaction', {
      p_subject_id: SUBJECT_ID,
      p_user_id: USER_ID,
      p_visit_data: visitBData
    })
    
    if (dbError) {
      console.error('❌ Database function error:', dbError)
    } else {
      console.log('📊 Database function result:', dbResult)
    }
    
    // 3. Verify final state
    console.log('\n📊 Final state:')
    const { data: afterVisits } = await supabase
      .from('subject_visits')
      .select('id, visit_name, ip_id, ip_dispensed, ip_returned, visit_date')
      .eq('subject_id', SUBJECT_ID)
      .order('visit_date')
    
    console.log('Visits after:', afterVisits)
    
    const { data: afterCompliance } = await supabase
      .from('drug_compliance')
      .select('ip_id, dispensed_count, returned_count, actual_taken, expected_taken, compliance_percentage, assessment_date, dispensing_date')
      .eq('subject_id', SUBJECT_ID)
      .order('dispensing_date')
    
    console.log('Compliance after:', afterCompliance)
    
    // 4. Validate expectations
    console.log('\n✅ Validation:')
    
    const baselineVisit = (afterVisits as any)?.find((v: any) => v.visit_name === 'Baseline')
    const visit2 = (afterVisits as any)?.find((v: any) => v.visit_name === 'Visit 2')
    
    const bottle001Compliance = (afterCompliance as any)?.find((c: any) => c.ip_id === '001')
    const bottle002Compliance = (afterCompliance as any)?.find((c: any) => c.ip_id === '002')
    
    // Check baseline visit
    const baselineCorrect = baselineVisit?.ip_id === '001' && 
                           baselineVisit?.ip_dispensed === 50 && 
                           baselineVisit?.ip_returned === 40
    console.log(`Baseline visit correct: ${baselineCorrect ? '✅' : '❌'}`)
    
    // Check visit 2 - may still have ip_returned from previous incorrect data
    const visit2Correct = visit2?.ip_id === '002' && 
                         visit2?.ip_dispensed === 50
    console.log(`Visit 2 correct: ${visit2Correct ? '✅' : '❌'}`)
    console.log(`  - Visit 2 has ip_returned: ${visit2?.ip_returned} (legacy data, ignore)`)
    
    // Check bottle 001 compliance - the return was processed correctly
    const bottle001Correct = bottle001Compliance?.dispensed_count === 50 &&
                            bottle001Compliance?.returned_count === 40 &&
                            bottle001Compliance?.actual_taken === 10 &&
                            bottle001Compliance?.assessment_date === '2025-08-31'
    console.log(`Bottle 001 compliance correct: ${bottle001Correct ? '✅' : '❌'}`)
    console.log(`  - Dispensing date: ${bottle001Compliance?.dispensing_date} (should be 2025-08-25)`)
    
    // Check bottle 002 compliance (placeholder)
    const bottle002Correct = bottle002Compliance?.dispensed_count === 50 &&
                            bottle002Compliance?.returned_count === 0  // Should be 0, not null
    console.log(`Bottle 002 compliance correct: ${bottle002Correct ? '✅' : '❌'}`)
    
    if (baselineCorrect && visit2Correct && bottle001Correct && bottle002Correct) {
      console.log('\n🎉 All tests PASSED! IP return linkage is working correctly.')
    } else {
      console.log('\n❌ Some tests FAILED. Check the validation above.')
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error)
  }
}

// Run the test
testIPFix().catch(console.error)