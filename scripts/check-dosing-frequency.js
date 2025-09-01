/**
 * Check the dosing frequency for the study
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkDosingFrequency() {
  console.log('🔍 Checking study dosing frequency...')
  
  const { data, error } = await supabase
    .from('studies')
    .select('id, name, dosing_frequency')
    .eq('id', 'd06ec12d-51fc-47c5-94d7-e3f45d76a13e')
  
  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('📊 Study details:')
    console.log(`   Name: ${data[0]?.name}`)
    console.log(`   Dosing frequency: ${data[0]?.dosing_frequency}`)
    
    // Calculate dose per day
    const frequency = data[0]?.dosing_frequency || 'QD'
    let dosePerDay
    switch (frequency) {
      case 'QD': dosePerDay = 1; break
      case 'BID': dosePerDay = 2; break  
      case 'TID': dosePerDay = 3; break
      case 'QID': dosePerDay = 4; break
      case 'weekly': dosePerDay = 1/7; break
      default: dosePerDay = 1
    }
    
    console.log(`   Dose per day: ${dosePerDay}`)
    console.log(`   Expected for 7 days: ${7 * dosePerDay}`)
  }
}

checkDosingFrequency()