-- Rename plan: introduce new column, backfill, keep old temporarily for compatibility.
-- Tables: visit_schedules, subject_visits

begin;

-- 1) Add new columns if not exists
alter table if exists public.visit_schedules
  add column if not exists ip_compliance_calc_required boolean;

alter table if exists public.subject_visits
  add column if not exists ip_compliance_calc_required boolean;

-- 2) Backfill visit_schedules.ip_compliance_calc_required
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'visit_schedules' and column_name = 'drug_dispensing_required'
  ) then
    update public.visit_schedules
       set ip_compliance_calc_required = coalesce(ip_compliance_calc_required, drug_dispensing_required)
     where ip_compliance_calc_required is null;
  elsif exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'visit_schedules' and column_name = 'procedures'
  ) then
    -- Infer from procedures text array if present
    update public.visit_schedules vs
       set ip_compliance_calc_required = true
     where ip_compliance_calc_required is null
       and (
         exists (select 1 from unnest(vs.procedures) p where lower(p) like '%medication dispensing%') or
         exists (select 1 from unnest(vs.procedures) p where lower(p) like '%ip compliance calculation%') or
         exists (select 1 from unnest(vs.procedures) p where lower(p) like '%drug dispensing%')
       );
  end if;
end $$;

-- 3) Backfill subject_visits.ip_compliance_calc_required
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subject_visits' and column_name = 'drug_dispensing_required'
  ) then
    update public.subject_visits
       set ip_compliance_calc_required = coalesce(ip_compliance_calc_required, drug_dispensing_required)
     where ip_compliance_calc_required is null;
  end if;

  -- Pull from linked visit_schedules when available
  update public.subject_visits sv
     set ip_compliance_calc_required = coalesce(sv.ip_compliance_calc_required, vs.ip_compliance_calc_required)
    from public.visit_schedules vs
   where sv.visit_schedule_id = vs.id
     and sv.ip_compliance_calc_required is null
     and vs.ip_compliance_calc_required is not null;

  -- Fallback: infer from visit_name keywords
  update public.subject_visits
     set ip_compliance_calc_required = true
   where ip_compliance_calc_required is null
     and (
       lower(coalesce(visit_name, '')) like '%medication dispensing%' or
       lower(coalesce(visit_name, '')) like '%ip compliance calculation%' or
       lower(coalesce(visit_name, '')) like '%drug dispensing%'
     );
end $$;

-- 4) Optional: leave old columns in place for now; code can migrate gradually.
-- To fully rename later:
-- alter table public.visit_schedules drop column drug_dispensing_required;
-- alter table public.subject_visits drop column drug_dispensing_required;

commit;
