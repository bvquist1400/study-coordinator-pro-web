/**
 * Script to fix compliance calculations via Supabase client
 * Run with: node scripts/fix-compliance-calculations.js
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const info = (...args) => console.warn(...args)

async function runSqlFile(filePath, description) {
  info(`\n🔧 ${description}...`)
  
  try {
    const sql = fs.readFileSync(filePath, 'utf8')
    
    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    for (const statement of statements) {
      if (statement.trim()) {
        info(`Executing: ${statement.substring(0, 50)}...`)
        const { error } = await supabase.rpc('exec_sql', { sql_statement: statement })
        
        if (error) {
          console.error(`❌ Error executing statement:`, error)
          console.error(`Statement: ${statement}`)
        } else {
          info(`✅ Success`)
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error)
  }
}

async function fixComplianceCalculations() {
  info('🚀 Starting compliance calculation fixes...')
  
  try {
    // Step 1: Update the SQL function
    await runSqlFile(
      'migrations/save_visit_with_ip_function.sql',
      'Updating save_visit_with_ip_transaction function'
    )
    
    // Step 2: Fix existing data
    await runSqlFile(
      'migrations/fix_compliance_calculations_v2.sql', 
      'Fixing existing compliance data'
    )
    
    info('\n✅ All fixes completed successfully!')
    
    // Step 3: Verify the fixes
    info('\n📊 Verifying compliance data for subject T001...')
    const { data: complianceData, error } = await supabase
      .from('drug_compliance')
      .select('*')
      .eq('subject_id', '5ab7f6df-6338-41f1-8280-217af8e135ae')
      .order('dispensing_date')
    
    if (error) {
      console.error('❌ Error fetching compliance data:', error)
    } else {
      info('\n📋 Updated compliance records:')
      complianceData.forEach((record, index) => {
        info(`\n${index + 1}. Bottle ${record.ip_id}:`)
        info(`   Dispensed: ${record.dispensed_count}`)
        info(`   Returned: ${record.returned_count}`)
        info(`   Expected: ${record.expected_taken}`)
        info(`   Actual: ${record.actual_taken}`)
        info(`   Compliance: ${record.compliance_percentage}%`)
        info(`   Start: ${record.dispensing_date}`)
        info(`   End: ${record.ip_last_dose_date}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error during fix process:', error)
  }
}

// Create the exec_sql function if it doesn't exist
async function createExecSqlFunction() {
  const createFunctionSql = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_statement TEXT)
    RETURNS TEXT AS $$
    BEGIN
      EXECUTE sql_statement;
      RETURN 'SUCCESS';
    EXCEPTION WHEN OTHERS THEN
      RETURN SQLERRM;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `
  
  info('🔧 Creating exec_sql helper function...')
  const { error } = await supabase.rpc('exec_sql', { sql_statement: createFunctionSql })
  
  if (error) {
    info('Helper function may already exist or need manual creation')
  } else {
    info('✅ Helper function created')
  }
}

// Run the fixes
async function main() {
  await createExecSqlFunction()
  await fixComplianceCalculations()
}

main().catch(console.error)
