-- PostgreSQL function to handle visit IP accountability in a transaction
-- This runs entirely in the database for data consistency

CREATE OR REPLACE FUNCTION save_visit_with_ip_transaction(
  p_subject_id UUID,
  p_user_id UUID,
  p_visit_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_visit_id UUID;
  v_visit_date DATE;
  v_return_bottle_id TEXT;
  v_returned_count INTEGER;
  v_new_bottle_id TEXT;
  v_new_dispensed INTEGER;
  v_new_start_date DATE;
  v_last_dose_date DATE;
  v_prior_visit RECORD;
  v_dispensing_date DATE;
  v_study_dosing_frequency TEXT;
  v_dose_per_day NUMERIC;
  v_result JSONB;
BEGIN
  -- Extract data from JSON input
  v_visit_id := (p_visit_data->>'visit_id')::UUID;
  v_visit_date := (p_visit_data->>'visit_date')::DATE;
  v_return_bottle_id := p_visit_data->>'ip_return_bottle_id';
  v_returned_count := (p_visit_data->>'ip_returned_count')::INTEGER;
  v_new_bottle_id := p_visit_data->>'ip_id_new';
  v_new_dispensed := (p_visit_data->>'ip_dispensed_new')::INTEGER;
  v_new_start_date := (p_visit_data->>'ip_start_date_new')::DATE;
  v_last_dose_date := (p_visit_data->>'ip_last_dose_date_current_visit')::DATE;

  -- Start transaction (implicit in function)
  
  -- 0. Get study dosing frequency for compliance calculations
  SELECT dosing_frequency INTO v_study_dosing_frequency
  FROM studies s
  JOIN subject_visits sv ON sv.study_id = s.id 
  WHERE sv.id = v_visit_id;
  
  -- Convert dosing frequency to numeric dose per day
  CASE v_study_dosing_frequency
    WHEN 'QD' THEN v_dose_per_day := 1;
    WHEN 'BID' THEN v_dose_per_day := 2; 
    WHEN 'TID' THEN v_dose_per_day := 3;
    WHEN 'QID' THEN v_dose_per_day := 4;
    WHEN 'weekly' THEN v_dose_per_day := 1.0 / 7.0;  -- Once per week
    WHEN 'custom' THEN v_dose_per_day := 1;  -- Default for custom, could be enhanced later
    ELSE v_dose_per_day := 1;  -- Default fallback
  END CASE;
  
  -- 1. Update basic visit fields
  UPDATE subject_visits 
  SET 
    visit_date = v_visit_date,
    status = p_visit_data->>'status',
    procedures_completed = CASE 
      WHEN p_visit_data ? 'procedures_completed' 
      THEN ARRAY(SELECT jsonb_array_elements_text(p_visit_data->'procedures_completed'))
      ELSE procedures_completed 
    END,
    notes = COALESCE(p_visit_data->>'notes', notes),
    accession_number = COALESCE(p_visit_data->>'accession_number', accession_number),
    airway_bill_number = COALESCE(p_visit_data->>'airway_bill_number', airway_bill_number),
    lab_kit_shipped_date = COALESCE((p_visit_data->>'lab_kit_shipped_date')::DATE, lab_kit_shipped_date),
    local_labs_completed = COALESCE((p_visit_data->>'local_labs_completed')::BOOLEAN, local_labs_completed),
    updated_at = NOW()
  WHERE id = v_visit_id AND subject_id = p_subject_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found or access denied: %', v_visit_id;
  END IF;

  -- 2. Handle IP RETURN if specified
  IF v_return_bottle_id IS NOT NULL AND v_returned_count IS NOT NULL AND v_returned_count > 0 THEN
    
    -- Find the prior visit where this bottle was dispensed
    SELECT id, ip_dispensed, ip_start_date, visit_date 
    INTO v_prior_visit
    FROM subject_visits 
    WHERE subject_id = p_subject_id 
      AND ip_id = v_return_bottle_id 
      AND ip_dispensed IS NOT NULL 
      AND ip_dispensed > 0
    ORDER BY visit_date DESC 
    LIMIT 1;
    
    IF v_prior_visit IS NULL THEN
      RAISE EXCEPTION 'No prior visit found for bottle ID: %', v_return_bottle_id;
    END IF;
    
    -- Store return information on the CURRENT visit (where it's being entered)
    -- Keep the original dispensing information on the prior visit unchanged
    UPDATE subject_visits 
    SET 
      return_ip_id = v_return_bottle_id,
      ip_returned = v_returned_count,
      ip_last_dose_date = v_last_dose_date,
      updated_at = NOW()
    WHERE id = v_visit_id;
    
    -- Determine actual start date (prefer ip_start_date, fallback to visit_date)
    -- This is when the subject actually started taking the medication
    v_dispensing_date := COALESCE(v_prior_visit.ip_start_date, v_prior_visit.visit_date);
    
    -- Upsert drug_compliance for the returned bottle with study-specific dosing
    INSERT INTO drug_compliance (
      subject_id,
      user_id,
      ip_id,
      dispensed_count,
      returned_count,
      dispensing_date,
      ip_last_dose_date,
      assessment_date,
      visit_id,
      expected_taken,
      created_at,
      updated_at
    ) VALUES (
      p_subject_id,
      p_user_id,
      v_return_bottle_id,
      v_prior_visit.ip_dispensed,
      v_returned_count,
      v_dispensing_date,
      v_last_dose_date,
      v_visit_date,  -- Assessment happened at current visit
      v_visit_id,    -- Assessment visit
      CASE 
        WHEN v_dispensing_date IS NOT NULL AND v_last_dose_date IS NOT NULL 
        THEN GREATEST(ROUND((v_last_dose_date::date - v_dispensing_date::date + 1) * v_dose_per_day), 0)
        ELSE NULL 
      END,
      NOW(),
      NOW()
    )
    ON CONFLICT (subject_id, ip_id) DO UPDATE SET
      returned_count = EXCLUDED.returned_count,
      ip_last_dose_date = EXCLUDED.ip_last_dose_date,
      assessment_date = EXCLUDED.assessment_date,
      visit_id = EXCLUDED.visit_id,
      expected_taken = EXCLUDED.expected_taken,
      updated_at = NOW();
      
  END IF;

  -- 3. Handle NEW IP DISPENSING if specified  
  IF v_new_bottle_id IS NOT NULL AND v_new_dispensed IS NOT NULL AND v_new_dispensed > 0 THEN
    
    -- Update current visit with new dispensing info
    UPDATE subject_visits 
    SET 
      ip_id = v_new_bottle_id,
      ip_dispensed = v_new_dispensed,
      ip_start_date = COALESCE(v_new_start_date, v_visit_date),
      updated_at = NOW()
    WHERE id = v_visit_id;
    
    -- Create placeholder drug_compliance for new bottle (no expected_taken until returned)
    INSERT INTO drug_compliance (
      subject_id,
      user_id,
      ip_id,
      dispensed_count,
      returned_count,
      dispensing_date,
      assessment_date,
      visit_id,
      expected_taken,
      created_at,
      updated_at
    ) VALUES (
      p_subject_id,
      p_user_id,
      v_new_bottle_id,
      v_new_dispensed,
      0,  -- Default to 0, not NULL
      COALESCE(v_new_start_date, v_visit_date),
      v_visit_date,
      v_visit_id,
      NULL,  -- No expected_taken calculation until bottle is returned
      NOW(),
      NOW()
    )
    ON CONFLICT (subject_id, ip_id) DO UPDATE SET
      dispensed_count = EXCLUDED.dispensed_count,
      dispensing_date = EXCLUDED.dispensing_date,
      assessment_date = EXCLUDED.assessment_date,
      visit_id = EXCLUDED.visit_id,
      updated_at = NOW();
      
  END IF;

  -- Return success with summary
  v_result := jsonb_build_object(
    'success', true,
    'visit_id', v_visit_id,
    'return_processed', (v_return_bottle_id IS NOT NULL AND v_returned_count > 0),
    'new_dispensing_processed', (v_new_bottle_id IS NOT NULL AND v_new_dispensed > 0),
    'returned_bottle_id', v_return_bottle_id,
    'returned_count', v_returned_count,
    'new_bottle_id', v_new_bottle_id,
    'new_dispensed_count', v_new_dispensed
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;