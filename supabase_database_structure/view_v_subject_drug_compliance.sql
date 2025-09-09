create or replace view public.v_subject_drug_compliance as
select 
  c.id,
  c.subject_id,
  c.visit_id,
  c.drug_id,
  c.dispensing_date,
  c.last_dose_date as ip_last_dose_date,
  c.tablets_dispensed as dispensed_count,
  c.tablets_returned as returned_count,
  c.expected_taken,
  c.actual_taken,
  c.compliance_percentage,
  c.is_compliant,
  c.created_at,
  c.updated_at
from public.subject_drug_cycles c;

