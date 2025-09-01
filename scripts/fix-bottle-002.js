/**
 * Quick fix for bottle 002 calculation
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixBottle002() {
  console.log('🔧 Fixing bottle 002 calculation...')
  
  // Calculate the correct expected_taken
  const startDate = new Date('2025-09-01')
  const endDate = new Date('2025-09-07')
  const timeDiff = endDate.getTime() - startDate.getTime()
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1
  
  console.log(`Start: ${startDate.toISOString().split('T')[0]}`)
  console.log(`End: ${endDate.toISOString().split('T')[0]}`)
  console.log(`Days calculation: ${daysDiff}`)
  
  // Update the record
  const { data, error } = await supabase
    .from('drug_compliance')
    .update({ 
      expected_taken: 7, // Correct value
      updated_at: new Date().toISOString()
    })
    .eq('ip_id', '002')
    .eq('subject_id', '5ab7f6df-6338-41f1-8280-217af8e135ae')
    .select()
  
  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('✅ Updated bottle 002:')
    console.log(`   Expected: ${data[0].expected_taken}`)
    console.log(`   Actual: ${data[0].actual_taken}`) 
    console.log(`   Compliance: ${data[0].compliance_percentage}%`)
  }
}

fixBottle002()