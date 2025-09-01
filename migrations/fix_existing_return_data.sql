-- Fix existing data to match the new return information structure
-- This script moves return information from prior visits to the visits where they were actually entered

-- Step 1: Add the return_ip_id field if it doesn't exist
ALTER TABLE subject_visits 
ADD COLUMN IF NOT EXISTS return_ip_id TEXT;

-- Step 2: Move return information to the correct visit
-- Find visits that have ip_returned data and move it to the next visit that references that bottle
WITH return_fixes AS (
  SELECT 
    sv1.id as prior_visit_id,
    sv1.ip_id as bottle_id,
    sv1.ip_returned,
    sv1.ip_last_dose_date,
    sv2.id as current_visit_id,
    sv1.subject_id
  FROM subject_visits sv1
  JOIN subject_visits sv2 ON (
    sv1.subject_id = sv2.subject_id 
    AND sv2.visit_date > sv1.visit_date 
    AND sv1.ip_returned IS NOT NULL 
    AND sv1.ip_returned > 0
  )
  WHERE sv1.ip_id IS NOT NULL 
    AND sv1.ip_dispensed IS NOT NULL
    AND sv1.ip_dispensed > 0
  ORDER BY sv1.subject_id, sv1.visit_date, sv2.visit_date
)
-- Update the current visit with return information
UPDATE subject_visits 
SET 
  return_ip_id = rf.bottle_id,
  ip_returned = rf.ip_returned,
  ip_last_dose_date = rf.ip_last_dose_date,
  updated_at = NOW()
FROM return_fixes rf 
WHERE subject_visits.id = rf.current_visit_id;

-- Step 3: Clear return information from prior visits (keep only dispensing info)
UPDATE subject_visits 
SET 
  ip_returned = NULL,
  ip_last_dose_date = NULL,
  updated_at = NOW()
WHERE ip_returned IS NOT NULL 
  AND ip_dispensed IS NOT NULL 
  AND ip_dispensed > 0
  AND EXISTS (
    SELECT 1 FROM subject_visits sv2 
    WHERE sv2.subject_id = subject_visits.subject_id 
      AND sv2.return_ip_id = subject_visits.ip_id
      AND sv2.visit_date > subject_visits.visit_date
  );

-- Step 4: Fix compliance calculations with corrected expected_taken values
-- Note: actual_taken, compliance_percentage, and is_compliant are GENERATED columns
-- They will be automatically recalculated when we update expected_taken
UPDATE drug_compliance 
SET 
  expected_taken = CASE 
    WHEN dispensing_date IS NOT NULL AND ip_last_dose_date IS NOT NULL 
    THEN GREATEST(ROUND((ip_last_dose_date - dispensing_date + 1) * 1), 0) -- Assuming QD dosing
    ELSE NULL 
  END,
  updated_at = NOW()
WHERE ip_last_dose_date IS NOT NULL;