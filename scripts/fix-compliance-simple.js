/**
 * Simple script to fix compliance calculations via direct Supabase updates
 * Run with: node scripts/fix-compliance-simple.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixComplianceRecords() {
  console.log('🚀 Starting compliance fixes...')
  
  try {
    // Get all compliance records that need fixing
    const { data: complianceRecords, error: fetchError } = await supabase
      .from('drug_compliance')
      .select('*, subject_visits!inner(ip_start_date)')
      .eq('subject_id', '5ab7f6df-6338-41f1-8280-217af8e135ae')
    
    if (fetchError) {
      console.error('❌ Error fetching compliance records:', fetchError)
      return
    }
    
    console.log(`📊 Found ${complianceRecords.length} compliance records to check`)
    
    for (const record of complianceRecords) {
      console.log(`\n🔧 Processing bottle ${record.ip_id}...`)
      
      const updates = {}
      let needsUpdate = false
      
      // Fix missing dispensing_date
      if (!record.dispensing_date && record.subject_visits?.ip_start_date) {
        updates.dispensing_date = record.subject_visits.ip_start_date
        needsUpdate = true
        console.log(`  ✅ Setting dispensing_date to ${updates.dispensing_date}`)
      }
      
      // Fix expected_taken calculation
      const startDate = updates.dispensing_date || record.dispensing_date
      if (startDate && record.ip_last_dose_date) {
        const start = new Date(startDate)
        const end = new Date(record.ip_last_dose_date)
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        const expectedTaken = Math.max(0, Math.round(daysDiff * 1)) // Assuming QD dosing
        
        if (record.expected_taken !== expectedTaken) {
          updates.expected_taken = expectedTaken
          needsUpdate = true
          console.log(`  ✅ Updating expected_taken from ${record.expected_taken} to ${expectedTaken}`)
        }
      } else if (!record.ip_last_dose_date && record.returned_count === 0) {
        // New bottle not returned yet - should have NULL expected_taken
        if (record.expected_taken !== null) {
          updates.expected_taken = null
          needsUpdate = true
          console.log(`  ✅ Setting expected_taken to NULL (bottle not returned)`)
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from('drug_compliance')
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('id', record.id)
        
        if (updateError) {
          console.error(`  ❌ Error updating record ${record.id}:`, updateError)
        } else {
          console.log(`  ✅ Updated record successfully`)
        }
      } else {
        console.log(`  ℹ️  No updates needed`)
      }
    }
    
    // Show final results
    console.log('\n📊 Final compliance results:')
    const { data: finalData } = await supabase
      .from('drug_compliance')
      .select('*')
      .eq('subject_id', '5ab7f6df-6338-41f1-8280-217af8e135ae')
      .order('dispensing_date')
    
    finalData?.forEach((record, index) => {
      console.log(`\n${index + 1}. Bottle ${record.ip_id}:`)
      console.log(`   Dispensed: ${record.dispensed_count} | Returned: ${record.returned_count}`)
      console.log(`   Expected: ${record.expected_taken} | Actual: ${record.actual_taken}`)
      console.log(`   Compliance: ${record.compliance_percentage}%`)
      console.log(`   Period: ${record.dispensing_date} → ${record.ip_last_dose_date || 'ongoing'}`)
    })
    
    console.log('\n✅ All fixes completed!')
    
  } catch (error) {
    console.error('❌ Error during fix process:', error)
  }
}

fixComplianceRecords()
