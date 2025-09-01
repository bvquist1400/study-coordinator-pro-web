-- Migration: Fix IP return linkage + drug compliance calculations
-- Safe, idempotent migration for existing production data

-- 1. Skip compliance_percentage column fix - it's already a generated numeric column
-- The existing schema already has it as a computed numeric field, which is what we want

-- 2. Add missing columns if they don't exist
-- Note: actual_taken is already a generated column, so only add expected_taken
ALTER TABLE drug_compliance 
ADD COLUMN IF NOT EXISTS expected_taken NUMERIC;

-- Skip altering returned_count since it's used by generated columns

-- 3. Add unique constraint on (subject_id, ip_id) - handle existing duplicates
-- First, remove duplicates keeping the most recent record
WITH ranked_compliance AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY subject_id, ip_id 
      ORDER BY updated_at DESC, created_at DESC, assessment_date DESC
    ) as rn
  FROM drug_compliance 
  WHERE ip_id IS NOT NULL
)
DELETE FROM drug_compliance 
WHERE id IN (
  SELECT id FROM ranked_compliance WHERE rn > 1
);

-- Add the unique constraint (drop first if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uniq_drug_compliance_subject_ip'
  ) THEN
    ALTER TABLE drug_compliance 
    ADD CONSTRAINT uniq_drug_compliance_subject_ip 
    UNIQUE (subject_id, ip_id);
  END IF;
END $$;

-- 4. Ensure foreign key constraint exists
DO $$ 
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'drug_compliance_visit_id_fkey'
  ) THEN
    ALTER TABLE drug_compliance DROP CONSTRAINT drug_compliance_visit_id_fkey;
  END IF;
  
  -- Add the constraint
  ALTER TABLE drug_compliance 
  ADD CONSTRAINT drug_compliance_visit_id_fkey 
  FOREIGN KEY (visit_id) REFERENCES subject_visits(id) ON DELETE SET NULL;
END $$;

-- 5. Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_drug_compliance_subject_ip_assess 
ON drug_compliance(subject_id, ip_id, assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_drug_compliance_dispensing_date 
ON drug_compliance(dispensing_date DESC);

-- 6. Create function to calculate compliance metrics
CREATE OR REPLACE FUNCTION calculate_drug_compliance_metrics(
  p_dispensed_count INTEGER,
  p_returned_count INTEGER,
  p_dispensing_date DATE,
  p_assessment_date DATE,
  p_dose_per_day NUMERIC DEFAULT 1
) RETURNS TABLE (
  actual_taken NUMERIC,
  expected_taken NUMERIC,
  compliance_percentage NUMERIC
) AS $$
DECLARE
  v_actual_taken NUMERIC;
  v_expected_taken NUMERIC;
  v_compliance_percentage NUMERIC;
  v_days_between INTEGER;
BEGIN
  -- Calculate actual taken
  v_actual_taken := COALESCE(p_dispensed_count, 0) - COALESCE(p_returned_count, 0);
  
  -- Calculate expected taken if we have both dates (inclusive of both start and end dates)
  IF p_dispensing_date IS NOT NULL AND p_assessment_date IS NOT NULL THEN
    v_days_between := GREATEST(p_assessment_date - p_dispensing_date + 1, 0);
    v_expected_taken := v_days_between * COALESCE(p_dose_per_day, 1);
  ELSE
    v_expected_taken := NULL;
  END IF;
  
  -- Calculate compliance percentage
  IF v_expected_taken IS NOT NULL AND v_expected_taken > 0 THEN
    v_compliance_percentage := ROUND(100.0 * v_actual_taken / v_expected_taken, 2);
  ELSE
    v_compliance_percentage := NULL;
  END IF;
  
  RETURN QUERY SELECT v_actual_taken, v_expected_taken, v_compliance_percentage;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Update existing records to fix compliance calculations
-- Note: actual_taken and compliance_percentage are generated, so we only update expected_taken
UPDATE drug_compliance 
SET expected_taken = calc_data.expected_taken
FROM (
  SELECT 
    dc.id,
    (SELECT expected_taken FROM calculate_drug_compliance_metrics(
      dc.dispensed_count, 
      dc.returned_count, 
      dc.dispensing_date, 
      dc.assessment_date, 
      1
    )) as expected_taken
  FROM drug_compliance dc
  WHERE dc.dispensing_date IS NOT NULL AND dc.assessment_date IS NOT NULL
) AS calc_data
WHERE drug_compliance.id = calc_data.id;

-- 8. Add trigger to automatically calculate metrics on insert/update
-- Note: actual_taken and compliance_percentage are already generated columns, so we only set expected_taken
CREATE OR REPLACE FUNCTION trigger_calculate_drug_compliance_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_study_dosing_frequency TEXT;
  v_dose_per_day NUMERIC;
BEGIN
  -- Only calculate if we have the required dates
  IF NEW.dispensing_date IS NOT NULL AND NEW.assessment_date IS NOT NULL THEN
    
    -- Get study dosing frequency via visit_id
    SELECT s.dosing_frequency INTO v_study_dosing_frequency
    FROM studies s
    JOIN subject_visits sv ON sv.study_id = s.id 
    WHERE sv.id = NEW.visit_id;
    
    -- Convert dosing frequency to numeric dose per day
    CASE v_study_dosing_frequency
      WHEN 'QD' THEN v_dose_per_day := 1;
      WHEN 'BID' THEN v_dose_per_day := 2; 
      WHEN 'TID' THEN v_dose_per_day := 3;
      WHEN 'QID' THEN v_dose_per_day := 4;
      WHEN 'weekly' THEN v_dose_per_day := 1.0 / 7.0;
      WHEN 'custom' THEN v_dose_per_day := 1;
      ELSE v_dose_per_day := 1;
    END CASE;
    
    -- Calculate expected_taken with study-specific dosing
    SELECT expected_taken INTO NEW.expected_taken 
    FROM calculate_drug_compliance_metrics(
      NEW.dispensed_count,
      NEW.returned_count,
      NEW.dispensing_date,
      NEW.assessment_date,
      v_dose_per_day  -- Use study-specific dosing
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_compliance_metrics_trigger ON drug_compliance;
CREATE TRIGGER calculate_compliance_metrics_trigger
  BEFORE INSERT OR UPDATE ON drug_compliance
  FOR EACH ROW
  EXECUTE FUNCTION trigger_calculate_drug_compliance_metrics();

-- Migration completed successfully