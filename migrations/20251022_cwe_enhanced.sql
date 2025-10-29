-- Coordinator Workload Estimation enhancements

-- Lifecycle & recruitment enums
do $$ begin
  create type lifecycle_stage as enum ('start_up','active','follow_up','close_out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recruitment_status as enum ('enrolling','paused','closed_to_accrual','on_hold');
exception when duplicate_object then null; end $$;

-- Subject phase enum
do $$ begin
  create type subject_phase as enum ('active_treatment','follow_up','screen_fail');
exception when duplicate_object then null; end $$;

-- Extend studies table with workload weighting fields
alter table studies
  add column if not exists lifecycle lifecycle_stage not null default 'active',
  add column if not exists recruitment recruitment_status not null default 'enrolling',
  add column if not exists protocol_score numeric(4,2) not null default 3.00,
  add column if not exists screening_multiplier numeric(3,2) not null default 1.00,
  add column if not exists query_multiplier numeric(3,2) not null default 1.00,
  add column if not exists meeting_admin_points numeric(6,2) not null default 0.00,
  add column if not exists rubric_trial_type text,
  add column if not exists rubric_phase text,
  add column if not exists rubric_sponsor_type text,
  add column if not exists rubric_visit_volume text,
  add column if not exists rubric_procedural_intensity text,
  add column if not exists rubric_notes text;

-- Extend subjects with phase tracking used in workload calculations
alter table subjects
  add column if not exists phase subject_phase not null default 'active_treatment';

-- Visit-level weighting table (one row per study & visit_type)
create table if not exists visit_weights (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references studies(id) on delete cascade,
  visit_type text not null,
  weight numeric(4,2) not null default 1.00,
  unique (study_id, visit_type)
);

-- Seed default visit weights for existing studies
insert into visit_weights (study_id, visit_type, weight)
select s.id, defaults.visit_type, defaults.weight
from studies s
cross join (
  values
    ('screening', 1.50::numeric),
    ('baseline', 2.00::numeric),
    ('regular', 1.00::numeric),
    ('unscheduled', 1.10::numeric),
    ('early_termination', 0.75::numeric),
    ('dose', 1.25::numeric),
    ('long_term', 0.50::numeric)
) as defaults(visit_type, weight)
on conflict do nothing;

-- Weight lookup view
create or replace view cwe_weights as
select
  s.id as study_id,
  case s.lifecycle
    when 'start_up' then 1.15
    when 'active' then 1.00
    when 'follow_up' then 0.50
    when 'close_out' then 0.25
  end as lifecycle_w,
  case s.recruitment
    when 'enrolling' then 1.00
    when 'paused' then 0.25
    when 'closed_to_accrual' then 0.00
    when 'on_hold' then 0.00
  end as recruitment_w,
  s.protocol_score as ps,
  s.screening_multiplier as sm,
  s.query_multiplier as qm,
  s.meeting_admin_points
from studies s;

-- Current workload snapshot based on subject phases
create or replace view cwe_now as
select
  w.study_id,
  ((w.ps * coalesce(sub.active_n, 0)) + (0.5 * w.ps * coalesce(sub.followup_n, 0)) + w.meeting_admin_points) as raw_now
from cwe_weights w
left join (
  select
    study_id,
    count(*) filter (where phase = 'active_treatment') as active_n,
    count(*) filter (where phase = 'follow_up') as followup_n
  from subjects
  group by study_id
) sub on sub.study_id = w.study_id;

-- Actual workload from completed visits
create or replace view cwe_actuals as
select
  sv.study_id,
  sum(coalesce(vw.weight, 1.0) * w.ps) as raw_actuals
from subject_visits sv
left join visit_schedules vs on vs.id = sv.visit_schedule_id
left join visit_weights vw on vw.study_id = sv.study_id
  and vw.visit_type = coalesce(vs.visit_type, 'regular')
join cwe_weights w on w.study_id = sv.study_id
where sv.status = 'completed'
group by sv.study_id;

-- Forecast workload for the next 4 weeks
create or replace view cwe_forecast_4w as
select
  sv.study_id,
  sum(coalesce(vw.weight, 1.0) * w.ps) as raw_forecast
from subject_visits sv
left join visit_schedules vs on vs.id = sv.visit_schedule_id
left join visit_weights vw on vw.study_id = sv.study_id
  and vw.visit_type = coalesce(vs.visit_type, 'regular')
join cwe_weights w on w.study_id = sv.study_id
where sv.status = 'scheduled'
  and sv.visit_date between current_date and current_date + interval '28 days'
group by sv.study_id;
