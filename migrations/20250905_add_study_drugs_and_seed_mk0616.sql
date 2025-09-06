-- Create study_drugs table (if not exists) and seed MK-0616/Placebo for the specified study

-- 1) Table: study_drugs
CREATE TABLE IF NOT EXISTS study_drugs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    dosing_frequency TEXT NOT NULL CHECK (dosing_frequency IN ('QD','BID','TID','QID','weekly','custom')),
    dose_per_day NUMERIC,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (study_id, code)
);

-- Helpful index for lookups by study/name
CREATE INDEX IF NOT EXISTS idx_study_drugs_study_code ON study_drugs(study_id, code);

-- 2) Seed data for study: fe45638b-fd27-461d-929f-255cdd34f5ec
-- Assumes BID (2/day) dosing per your morning/evening description. Adjust if needed.
INSERT INTO study_drugs (id, study_id, code, name, dosing_frequency, dose_per_day, notes)
VALUES
  (uuid_generate_v4(), 'fe45638b-fd27-461d-929f-255cdd34f5ec', 'MK-0616', 'MK-0616', 'BID', 2, 'Seeded via migration'),
  (uuid_generate_v4(), 'fe45638b-fd27-461d-929f-255cdd34f5ec', 'PLACEBO', 'Placebo', 'BID', 2, 'Seeded via migration')
ON CONFLICT (study_id, code) DO UPDATE
SET dosing_frequency = EXCLUDED.dosing_frequency,
    dose_per_day     = EXCLUDED.dose_per_day,
    name             = EXCLUDED.name,
    updated_at       = NOW();

