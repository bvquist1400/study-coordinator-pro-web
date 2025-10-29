-- Coordinator metrics capture table

create table if not exists coordinator_metrics (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies(id) on delete cascade,
  coordinator_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  meeting_hours numeric(5,2) not null default 0.00,
  screening_hours numeric(5,2) not null default 0.00,
  screening_study_count integer not null default 0,
  query_hours numeric(5,2) not null default 0.00,
  query_study_count integer not null default 0,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint coordinator_metrics_unique_week unique (study_id, coordinator_id, week_start)
);

create index if not exists idx_coordinator_metrics_study_id
  on coordinator_metrics (study_id);

create index if not exists idx_coordinator_metrics_coordinator_id
  on coordinator_metrics (coordinator_id);

create index if not exists idx_coordinator_metrics_week_start
  on coordinator_metrics (week_start);

drop trigger if exists update_coordinator_metrics_updated_at on coordinator_metrics;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coordinator_metrics'
      and column_name = 'admin_hours'
  ) then
    alter table coordinator_metrics rename column admin_hours to meeting_hours;
  end if;
end;
$$;

alter table coordinator_metrics
  add column if not exists meeting_hours numeric(5,2) not null default 0.00,
  add column if not exists screening_study_count integer not null default 0,
  add column if not exists query_study_count integer not null default 0;

create trigger update_coordinator_metrics_updated_at
before update on coordinator_metrics
for each row
execute function update_updated_at_column();

alter table coordinator_metrics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coordinator_metrics'
      and policyname = 'coordinator_metrics_service_role'
  ) then
    create policy coordinator_metrics_service_role on public.coordinator_metrics
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end;
$$;
