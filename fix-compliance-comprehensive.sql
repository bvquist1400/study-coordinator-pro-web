-- Comprehensive fix for all compliance calculation issues
-- Run this in Supabase SQL Editor

-- Step 1: Fix missing dispensing_date by linking to subject_visits.ip_start_date
UPDATE drug_compliance dc
SET 
  dispensing_date = sv.ip_start_date,
  updated_at = NOW()
FROM subject_visits sv
WHERE dc.dispensing_date IS NULL
  AND dc.subject_id = sv.subject_id
  AND dc.ip_id = sv.ip_id
  AND sv.ip_start_date IS NOT NULL
  AND sv.ip_dispensed IS NOT NULL
  AND sv.ip_dispensed > 0;

-- Step 2: Fix expected_taken for bottles that have been returned
UPDATE drug_compliance 
SET 
  expected_taken = CASE 
    WHEN dispensing_date IS NOT NULL AND ip_last_dose_date IS NOT NULL 
    THEN GREATEST((ip_last_dose_date::date - dispensing_date::date + 1), 0)
    ELSE NULL
  END,
  updated_at = NOW()
WHERE ip_last_dose_date IS NOT NULL
  AND returned_count > 0;

-- Step 3: Set expected_taken to NULL for bottles not returned yet
UPDATE drug_compliance 
SET 
  expected_taken = NULL,
  updated_at = NOW()
WHERE (ip_last_dose_date IS NULL OR returned_count = 0)
  AND expected_taken IS NOT NULL;

-- Step 4: Verify the fixes for your test subject
SELECT 
  dc.ip_id,
  dc.dispensing_date,
  dc.ip_last_dose_date,
  dc.dispensed_count,
  dc.returned_count,
  dc.expected_taken,
  dc.actual_taken,
  dc.compliance_percentage,
  -- Calculate what it should be manually for verification
  CASE 
    WHEN dc.dispensing_date IS NOT NULL AND dc.ip_last_dose_date IS NOT NULL 
    THEN (dc.ip_last_dose_date::date - dc.dispensing_date::date + 1)
    ELSE NULL
  END as should_be_expected,
  -- Status check
  CASE 
    WHEN dc.ip_last_dose_date IS NULL THEN 'Pending return'
    WHEN dc.dispensing_date IS NULL THEN 'Missing start date'
    WHEN dc.compliance_percentage::numeric > 200 THEN 'Overcompliance - check calculation'
    WHEN dc.compliance_percentage::numeric < 50 THEN 'Low compliance'
    ELSE 'Normal'
  END as status_check
FROM drug_compliance dc
WHERE dc.subject_id = '5ab7f6df-6338-41f1-8280-217af8e135ae'
ORDER BY dc.dispensing_date NULLS LAST;