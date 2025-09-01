-- Debug the date calculation for bottle 002
SELECT 
    dc.ip_id,
    dc.dispensing_date,
    dc.ip_last_dose_date,
    -- Show the raw calculation
    dc.ip_last_dose_date - dc.dispensing_date as raw_days_diff,
    (dc.ip_last_dose_date - dc.dispensing_date + 1) as days_plus_one,
    -- Show what the calculation should be
    GREATEST(ROUND((dc.ip_last_dose_date - dc.dispensing_date + 1) * 1), 0) as calculated_expected,
    dc.expected_taken as stored_expected,
    -- Compare with visit data
    sv.ip_start_date as visit_start_date,
    sv.visit_date as visit_date,
    -- Show dosing frequency from study
    s.dosing_frequency
FROM drug_compliance dc
LEFT JOIN subject_visits sv ON (sv.subject_id = dc.subject_id AND sv.ip_id = dc.ip_id)
LEFT JOIN studies s ON s.id = sv.study_id
WHERE dc.ip_id = '002' 
  AND dc.subject_id = '5ab7f6df-6338-41f1-8280-217af8e135ae';