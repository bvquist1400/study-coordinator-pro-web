-- Restructure coordinator workload metrics and introduce study assignments

-- Study coordinators linking table
create table if not exists study_coordinators (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies(id) on delete cascade,
  coordinator_id uuid not null references auth.users(id) on delete cascade,
  role text null,
  joined_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint study_coordinators_unique unique (study_id, coordinator_id)
);

create index if not exists idx_study_coordinators_study_id
  on study_coordinators (study_id);

create index if not exists idx_study_coordinators_coordinator_id
  on study_coordinators (coordinator_id);

drop trigger if exists update_study_coordinators_updated_at on study_coordinators;

create trigger update_study_coordinators_updated_at
before update on study_coordinators
for each row
execute function update_updated_at_column();

alter table study_coordinators enable row level security;

-- Coordinator metrics restructuring
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coordinator_metrics'
      and column_name = 'study_id'
  ) then
    alter table coordinator_metrics drop column if exists study_id;
  end if;
end;
$$;

alter table coordinator_metrics
  add column if not exists recorded_by uuid references auth.users(id),
  add column if not exists meeting_hours numeric(5,2) not null default 0.00,
  add column if not exists screening_study_count integer not null default 0,
  add column if not exists query_study_count integer not null default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coordinator_metrics'
      and column_name = 'admin_hours'
  ) then
    update coordinator_metrics
      set meeting_hours = coalesce(meeting_hours, admin_hours, 0);
    alter table coordinator_metrics drop column admin_hours;
  end if;
end;
$$;

update coordinator_metrics
  set recorded_by = coordinator_id
  where recorded_by is null;

-- Collapse coordinator-level duplicates created by previous per-study records
drop table if exists tmp_coordinator_metrics_agg;

create temporary table tmp_coordinator_metrics_agg as
select
  coordinator_id,
  week_start,
  (max((recorded_by)::text))::uuid as recorded_by,
  sum(meeting_hours) as meeting_hours,
  sum(screening_hours) as screening_hours,
  sum(screening_study_count) as screening_study_count,
  sum(query_hours) as query_hours,
  sum(query_study_count) as query_study_count,
  max(notes) as notes,
  min(created_at) as created_at,
  max(updated_at) as updated_at
from coordinator_metrics
group by coordinator_id, week_start;

delete from coordinator_metrics;

insert into coordinator_metrics (
  id,
  coordinator_id,
  recorded_by,
  week_start,
  meeting_hours,
  screening_hours,
  screening_study_count,
  query_hours,
  query_study_count,
  notes,
  created_at,
  updated_at
)
select
  uuid_generate_v4(),
  coordinator_id,
  recorded_by,
  week_start,
  meeting_hours,
  screening_hours,
  screening_study_count,
  query_hours,
  query_study_count,
  notes,
  created_at,
  updated_at
from tmp_coordinator_metrics_agg;

drop table if exists tmp_coordinator_metrics_agg;

-- Defensive cleanup in case duplicates still exist after aggregation
delete from coordinator_metrics a
using coordinator_metrics b
where a.ctid < b.ctid
  and a.coordinator_id = b.coordinator_id
  and a.week_start = b.week_start;

-- Coordinator metrics table is global; ensure unique constraint still valid
alter table coordinator_metrics
  drop constraint if exists coordinator_metrics_unique_week;

alter table coordinator_metrics
  add constraint coordinator_metrics_unique_week unique (coordinator_id, week_start);
