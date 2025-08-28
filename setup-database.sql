-- Apply updated database schema to Supabase
-- Run this in Supabase SQL Editor

-- First, let's check if the studies table exists and drop/recreate it if needed
-- This is a development environment so we can be more aggressive

-- Drop existing table if it exists (be careful in production!)
DROP TABLE IF EXISTS studies CASCADE;

-- Create the studies table with our updated schema
CREATE TABLE studies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    protocol_number TEXT NOT NULL,
    study_title TEXT NOT NULL,
    sponsor TEXT,
    principal_investigator TEXT,
    phase TEXT,
    indication TEXT,
    status TEXT DEFAULT 'enrolling' CHECK (status IN ('enrolling', 'active', 'closed_to_enrollment', 'completed')),
    start_date DATE,
    end_date DATE,
    target_enrollment INTEGER,
    visit_window_days INTEGER DEFAULT 7,
    dosing_frequency TEXT DEFAULT 'QD' CHECK (dosing_frequency IN ('QD', 'BID', 'TID', 'QID', 'weekly', 'custom')),
    compliance_threshold DECIMAL DEFAULT 80.0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, protocol_number)
);

-- Enable Row Level Security
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own studies
DROP POLICY IF EXISTS "Users can manage own studies" ON studies;
CREATE POLICY "Users can manage own studies" ON studies
    FOR ALL USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_studies_user_id ON studies(user_id);
CREATE INDEX IF NOT EXISTS idx_studies_status ON studies(status);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_studies_updated_at ON studies;
CREATE TRIGGER update_studies_updated_at
    BEFORE UPDATE ON studies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Test insert to verify everything works
-- (This will be commented out for safety, but you can uncomment to test)
-- INSERT INTO studies (user_id, protocol_number, study_title) 
-- VALUES (auth.uid(), 'TEST-001', 'Test Study');