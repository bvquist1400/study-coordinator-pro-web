-- Migration to add IP accountability fields to subject_visits table
-- Based on INSTRUCTIONS.md requirements for enhanced visit management

-- Add the missing IP accountability fields
ALTER TABLE subject_visits 
ADD COLUMN IF NOT EXISTS visit_date DATE,
ADD COLUMN IF NOT EXISTS lab_kit_required BOOLEAN,
ADD COLUMN IF NOT EXISTS drug_dispensing_required BOOLEAN,  
ADD COLUMN IF NOT EXISTS local_labs_required BOOLEAN,
ADD COLUMN IF NOT EXISTS accession_number TEXT,
ADD COLUMN IF NOT EXISTS airway_bill_number TEXT,
ADD COLUMN IF NOT EXISTS lab_kit_shipped_date DATE,
ADD COLUMN IF NOT EXISTS ip_start_date DATE,
ADD COLUMN IF NOT EXISTS ip_last_dose_date DATE,
ADD COLUMN IF NOT EXISTS ip_dispensed INTEGER,
ADD COLUMN IF NOT EXISTS ip_returned INTEGER,
ADD COLUMN IF NOT EXISTS ip_id TEXT,
ADD COLUMN IF NOT EXISTS return_ip_id TEXT,
ADD COLUMN IF NOT EXISTS local_labs_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS study_id UUID REFERENCES studies(id) ON DELETE CASCADE;

-- Update existing records to use visit_date from scheduled_date if needed
UPDATE subject_visits 
SET visit_date = scheduled_date 
WHERE visit_date IS NULL;

-- Update existing records to set study_id from subject relationship if needed
UPDATE subject_visits 
SET study_id = subjects.study_id
FROM subjects 
WHERE subject_visits.subject_id = subjects.id 
AND subject_visits.study_id IS NULL;

-- Add index for the new study_id column
CREATE INDEX IF NOT EXISTS idx_subject_visits_study_id ON subject_visits(study_id);

-- Add index for visit_date column
CREATE INDEX IF NOT EXISTS idx_subject_visits_visit_date ON subject_visits(visit_date);
