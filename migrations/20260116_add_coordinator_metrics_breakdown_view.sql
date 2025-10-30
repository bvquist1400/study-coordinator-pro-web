-- Aggregated per-study, per-coordinator weekly breakdown view for workload analytics

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
