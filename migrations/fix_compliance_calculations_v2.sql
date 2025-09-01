-- Fix compliance calculations by properly linking start and end dates
-- This addresses the issue where expected_taken is calculated incorrectly

-- Step 1: Fix records where we have both dispensing_date and ip_last_dose_date
UPDATE drug_compliance 
SET expected_taken = GREATEST(ROUND((ip_last_dose_date - dispensing_date + 1) * 1), 0)
WHERE dispensing_date IS NOT NULL 
  AND ip_last_dose_date IS NOT NULL
  AND (expected_taken IS NULL OR expected_taken != GREATEST(ROUND((ip_last_dose_date - dispensing_date + 1) * 1), 0));

-- Step 2: For records where dispensing_date is NULL, try to find it from the subject_visits table
UPDATE drug_compliance dc
SET 
  dispensing_date = sv.ip_start_date,
  expected_taken = CASE 
    WHEN sv.ip_start_date IS NOT NULL AND dc.ip_last_dose_date IS NOT NULL 
    THEN GREATEST(ROUND((dc.ip_last_dose_date - sv.ip_start_date + 1) * 1), 0)
    ELSE NULL
  END
FROM subject_visits sv
WHERE dc.dispensing_date IS NULL
  AND dc.ip_id = sv.ip_id
  AND dc.subject_id = sv.subject_id
  AND sv.ip_start_date IS NOT NULL
  AND sv.ip_dispensed IS NOT NULL;

-- Step 3: Set expected_taken to NULL for new bottles that haven't been returned yet
-- (These should not have compliance calculated until they are returned)
UPDATE drug_compliance 
SET expected_taken = NULL
WHERE ip_last_dose_date IS NULL
  AND returned_count = 0;

-- Step 4: Verify the fixes by showing a summary of corrections
SELECT 
  ip_id,
  dispensing_date,
  ip_last_dose_date,
  dispensed_count,
  returned_count,
  expected_taken,
  actual_taken,
  compliance_percentage,
  CASE 
    WHEN ip_last_dose_date IS NULL THEN 'Pending - not returned yet'
    WHEN expected_taken IS NULL THEN 'Missing calculation'
    WHEN compliance_percentage > 150 THEN 'Overcompliance - check dates'
    WHEN compliance_percentage < 50 THEN 'Low compliance'
    ELSE 'Normal'
  END as status_check
FROM drug_compliance 
WHERE subject_id = '5ab7f6df-6338-41f1-8280-217af8e135ae'  -- Your test subject
ORDER BY dispensing_date;