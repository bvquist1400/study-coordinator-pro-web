do $$
begin
  create type lifecycle_stage as enum ('start_up','active','follow_up','close_out');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type recruitment_status as enum ('enrolling','paused','closed_to_accrual','on_hold');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type subject_phase as enum ('active_treatment','follow_up','screen_fail');
exception when duplicate_object then null;
end $$;

create table if not exists public.visit_weights (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references studies(id) on delete cascade,
  visit_type text not null,
  weight numeric(4,2) not null default 1.00,
  constraint visit_weights_study_visit_type_key unique (study_id, visit_type)
);

create or replace view public.cwe_weights as
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

create or replace view public.cwe_now as
select
  w.study_id,
  (w.ps * coalesce(sub.active_n, 0)) + (0.5 * w.ps * coalesce(sub.followup_n, 0)) + w.meeting_admin_points as raw_now
from cwe_weights w
left join (
  select
    study_id,
    count(*) filter (where phase = 'active_treatment') as active_n,
    count(*) filter (where phase = 'follow_up') as followup_n
  from subjects
  group by study_id
) sub on sub.study_id = w.study_id;

create or replace view public.cwe_actuals as
select
  sv.study_id,
  sum(coalesce(vw.weight, 1.0) * w.ps) as raw_actuals
from subject_visits sv
left join visit_schedules vs on vs.id = sv.visit_schedule_id
left join visit_weights vw on vw.study_id = sv.study_id and vw.visit_type = coalesce(vs.visit_type, 'regular')
join cwe_weights w on w.study_id = sv.study_id
where sv.status = 'completed'
group by sv.study_id;

create or replace view public.cwe_forecast_4w as
select
  sv.study_id,
  sum(coalesce(vw.weight, 1.0) * w.ps) as raw_forecast
from subject_visits sv
left join visit_schedules vs on vs.id = sv.visit_schedule_id
left join visit_weights vw on vw.study_id = sv.study_id and vw.visit_type = coalesce(vs.visit_type, 'regular')
join cwe_weights w on w.study_id = sv.study_id
where sv.status = 'scheduled'
  and sv.visit_date between current_date and current_date + interval '28 days'
group by sv.study_id;

create or replace view public.v_coordinator_metrics_breakdown_weekly
with (security_barrier = true) as
select
  coordinator_id,
  study_id,
  week_start,
  sum(meeting_hours) as meeting_hours,
  sum(screening_hours) as screening_hours,
  sum(query_hours) as query_hours,
  sum(meeting_hours + screening_hours + query_hours) as total_hours,
  count(*) filter (
    where nullif(btrim(coalesce(notes, '')), '') is not null
  ) as note_entries,
  max(updated_at) as last_updated_at
from public.coordinator_metrics_notes
group by coordinator_id, study_id, week_start;
