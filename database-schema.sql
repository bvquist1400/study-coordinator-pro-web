-- Study Coordinator Pro Database Schema
-- This schema is designed specifically for clinical research coordinator workflows
-- Focus: Studies, Subjects, Visits, Compliance Tracking, Monitor Actions, Deviations

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (managed by Supabase Auth)
-- Additional user profile information
CREATE TABLE user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'coordinator',
    organization TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Studies table
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

-- Subjects table
CREATE TABLE subjects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    subject_number TEXT NOT NULL,
    initials TEXT,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('M', 'F', 'Other')),
    enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    randomization_date DATE,
    treatment_arm TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('screening', 'enrolled', 'active', 'completed', 'discontinued', 'withdrawn')),
    discontinuation_reason TEXT,
    discontinuation_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(study_id, subject_number)
);

-- Visit schedules (template for each study)
CREATE TABLE visit_schedules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
    visit_name TEXT NOT NULL,
    visit_number INTEGER NOT NULL,
    visit_day INTEGER NOT NULL, -- Day relative to baseline (0 = baseline)
    window_before_days INTEGER DEFAULT 3,
    window_after_days INTEGER DEFAULT 3,
    is_required BOOLEAN DEFAULT true,
    visit_type TEXT DEFAULT 'regular' CHECK (visit_type IN ('screening', 'baseline', 'regular', 'unscheduled', 'early_termination')),
    procedures TEXT[], -- Array of required procedures
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(study_id, visit_number)
);

-- Actual subject visits with enhanced IP accountability
CREATE TABLE subject_visits (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    visit_schedule_id UUID REFERENCES visit_schedules(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    visit_name TEXT NOT NULL,
    visit_date DATE NOT NULL,  -- Unified date field
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'missed', 'cancelled')),
    is_within_window BOOLEAN,
    days_from_scheduled INTEGER,
    procedures_completed TEXT[],
    notes TEXT,
    
    -- Enhanced IP accountability fields
    study_id UUID REFERENCES studies(id),  -- Direct study reference for better queries
    lab_kit_required BOOLEAN,
    accession_number TEXT,  -- Lab kit tracking
    airway_bill_number TEXT,
    lab_kit_shipped_date DATE,
    drug_dispensing_required BOOLEAN,
    ip_start_date DATE,  -- When first dose was taken  
    ip_last_dose_date DATE,  -- When last dose was taken
    ip_dispensed INTEGER,  -- Number of pills/units dispensed at this visit
    ip_returned INTEGER,  -- Number of pills/units returned at this visit  
    ip_id TEXT,  -- Bottle/kit number dispensed at this visit
    local_labs_required BOOLEAN,
    local_labs_completed BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drug compliance tracking with multi-dose support
CREATE TABLE drug_compliance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    dispensed_count INTEGER NOT NULL,
    returned_count INTEGER NOT NULL DEFAULT 0,
    expected_taken NUMERIC,  -- Now supports multi-dose calculations
    actual_taken INTEGER GENERATED ALWAYS AS (dispensed_count - returned_count) STORED,
    compliance_percentage NUMERIC GENERATED ALWAYS AS (
        CASE 
            WHEN expected_taken > 0 THEN ROUND(((dispensed_count - returned_count)::NUMERIC / expected_taken) * 100, 1)
            ELSE 0 
        END
    ) STORED,
    is_compliant BOOLEAN GENERATED ALWAYS AS (
        CASE 
            WHEN expected_taken > 0 THEN ((dispensed_count - returned_count)::NUMERIC / expected_taken) * 100 >= 80
            ELSE true
        END
    ) STORED,
    visit_id UUID REFERENCES subject_visits(id) ON DELETE SET NULL,
    ip_id TEXT,  -- Links to specific bottle/kit for accountability
    dispensing_date DATE,  -- When the IP was originally dispensed
    ip_last_dose_date DATE,  -- When the last dose was taken
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one compliance record per bottle per subject
    UNIQUE(subject_id, ip_id)
);

-- Monitor action items (from CRA visits)
CREATE TABLE monitor_actions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    cra_name TEXT NOT NULL,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    action_item TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    due_date DATE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'deferred')),
    completion_date DATE,
    completion_notes TEXT,
    follow_up_required BOOLEAN DEFAULT false,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    category TEXT DEFAULT 'general' CHECK (category IN (
        'general', 'documentation', 'safety', 'compliance', 
        'drug_accountability', 'adverse_events', 'protocol_deviation'
    )),
    attachments TEXT[], -- Array of file URLs/paths
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Protocol deviations
CREATE TABLE protocol_deviations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    deviation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    deviation_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'critical')),
    is_reportable BOOLEAN DEFAULT false,
    root_cause TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    status TEXT DEFAULT 'identified' CHECK (status IN ('identified', 'investigating', 'resolved', 'closed')),
    resolution_date DATE,
    reported_to_sponsor BOOLEAN DEFAULT false,
    reported_to_irb BOOLEAN DEFAULT false,
    visit_id UUID REFERENCES subject_visits(id) ON DELETE SET NULL,
    category TEXT DEFAULT 'other' CHECK (category IN (
        'inclusion_exclusion', 'consent', 'visit_window', 'dosing', 
        'laboratory', 'adverse_event', 'drug_accountability', 'other'
    )),
    impact_assessment TEXT,
    attachments TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_studies_user_id ON studies(user_id);
CREATE INDEX idx_studies_status ON studies(status);
CREATE INDEX idx_subjects_study_id ON subjects(study_id);
CREATE INDEX idx_subjects_user_id ON subjects(user_id);
CREATE INDEX idx_subjects_status ON subjects(status);
CREATE INDEX idx_subject_visits_subject_id ON subject_visits(subject_id);
CREATE INDEX idx_subject_visits_visit_date ON subject_visits(visit_date);
CREATE INDEX idx_subject_visits_status ON subject_visits(status);
CREATE INDEX idx_subject_visits_study_id ON subject_visits(study_id);
CREATE INDEX idx_subject_visits_ip_id ON subject_visits(ip_id);
CREATE INDEX idx_drug_compliance_subject_id ON drug_compliance(subject_id);
CREATE INDEX idx_drug_compliance_assessment_date ON drug_compliance(assessment_date);
CREATE INDEX idx_drug_compliance_is_compliant ON drug_compliance(is_compliant);
CREATE INDEX idx_drug_compliance_ip_id ON drug_compliance(ip_id);
CREATE INDEX idx_drug_compliance_subject_ip ON drug_compliance(subject_id, ip_id);
CREATE INDEX idx_drug_compliance_dispensing_date ON drug_compliance(dispensing_date);
CREATE INDEX idx_drug_compliance_subject_ip_dates ON drug_compliance(subject_id, ip_id, dispensing_date, ip_last_dose_date);
CREATE INDEX idx_monitor_actions_study_id ON monitor_actions(study_id);
CREATE INDEX idx_monitor_actions_user_id ON monitor_actions(user_id);
CREATE INDEX idx_monitor_actions_status ON monitor_actions(status);
CREATE INDEX idx_monitor_actions_priority ON monitor_actions(priority);
CREATE INDEX idx_monitor_actions_due_date ON monitor_actions(due_date);
CREATE INDEX idx_protocol_deviations_study_id ON protocol_deviations(study_id);
CREATE INDEX idx_protocol_deviations_subject_id ON protocol_deviations(subject_id);
CREATE INDEX idx_protocol_deviations_user_id ON protocol_deviations(user_id);
CREATE INDEX idx_protocol_deviations_severity ON protocol_deviations(severity);
CREATE INDEX idx_protocol_deviations_status ON protocol_deviations(status);

-- Row Level Security (RLS) policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_deviations ENABLE ROW LEVEL SECURITY;

-- User can only access their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Users can only access their own studies
CREATE POLICY "Users can manage own studies" ON studies
    FOR ALL USING (auth.uid() = user_id);

-- Users can only access subjects in their studies
CREATE POLICY "Users can manage subjects in own studies" ON subjects
    FOR ALL USING (
        auth.uid() = user_id AND 
        study_id IN (SELECT id FROM studies WHERE user_id = auth.uid())
    );

-- Similar policies for other tables
CREATE POLICY "Users can manage own visit schedules" ON visit_schedules
    FOR ALL USING (
        study_id IN (SELECT id FROM studies WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can manage own subject visits" ON subject_visits
    FOR ALL USING (
        auth.uid() = user_id AND
        subject_id IN (
            SELECT s.id FROM subjects s 
            JOIN studies st ON s.study_id = st.id 
            WHERE st.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own compliance data" ON drug_compliance
    FOR ALL USING (
        auth.uid() = user_id AND
        subject_id IN (
            SELECT s.id FROM subjects s 
            JOIN studies st ON s.study_id = st.id 
            WHERE st.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own monitor actions" ON monitor_actions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own protocol deviations" ON protocol_deviations
    FOR ALL USING (auth.uid() = user_id);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_studies_updated_at
    BEFORE UPDATE ON studies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visit_schedules_updated_at
    BEFORE UPDATE ON visit_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subject_visits_updated_at
    BEFORE UPDATE ON subject_visits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drug_compliance_updated_at
    BEFORE UPDATE ON drug_compliance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monitor_actions_updated_at
    BEFORE UPDATE ON monitor_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_protocol_deviations_updated_at
    BEFORE UPDATE ON protocol_deviations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample views for common queries
CREATE VIEW study_overview AS
SELECT 
    s.id,
    s.protocol_number,
    s.study_title,
    s.status,
    s.user_id,
    COUNT(DISTINCT sub.id) as total_subjects,
    COUNT(DISTINCT CASE WHEN sub.status = 'active' THEN sub.id END) as active_subjects,
    COUNT(DISTINCT CASE WHEN sv.status = 'scheduled' AND sv.scheduled_date <= CURRENT_DATE + INTERVAL '7 days' THEN sv.id END) as upcoming_visits,
    AVG(dc.compliance_percentage) as avg_compliance,
    COUNT(DISTINCT CASE WHEN ma.status IN ('open', 'in_progress') THEN ma.id END) as open_actions
FROM studies s
LEFT JOIN subjects sub ON s.id = sub.study_id
LEFT JOIN subject_visits sv ON sub.id = sv.subject_id
LEFT JOIN drug_compliance dc ON sub.id = dc.subject_id
LEFT JOIN monitor_actions ma ON s.id = ma.study_id
GROUP BY s.id, s.protocol_number, s.study_title, s.status, s.user_id;

CREATE VIEW compliance_summary AS
SELECT 
    s.protocol_number,
    sub.subject_number,
    sub.status as subject_status,
    dc.assessment_date,
    dc.compliance_percentage,
    dc.is_compliant,
    CASE 
        WHEN dc.compliance_percentage < 80 THEN 'Non-compliant'
        WHEN dc.compliance_percentage < 90 THEN 'Moderate compliance'
        ELSE 'Good compliance'
    END as compliance_category
FROM drug_compliance dc
JOIN subjects sub ON dc.subject_id = sub.id
JOIN studies s ON sub.study_id = s.id
WHERE sub.status IN ('active', 'enrolled')
ORDER BY dc.assessment_date DESC;