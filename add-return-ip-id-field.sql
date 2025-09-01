-- Add missing return_ip_id field to subject_visits table
-- This field stores the IP ID being returned from a previous visit

ALTER TABLE subject_visits 
ADD COLUMN IF NOT EXISTS return_ip_id TEXT;

-- Add index for the new field for performance
CREATE INDEX IF NOT EXISTS idx_subject_visits_return_ip_id ON subject_visits(return_ip_id);