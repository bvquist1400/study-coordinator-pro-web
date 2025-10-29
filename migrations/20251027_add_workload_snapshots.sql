-- Workload snapshot storage for CWE automation

do $ddl$
begin
  create extension if not exists "uuid-ossp";
end;
$ddl$;

create table if not exists study_workload_snapshots (
  id uuid primary key default uuid_generate_v4(),
  study_id uuid not null references studies(id) on delete cascade,
  payload jsonb not null,
  computed_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + interval '5 minutes'),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint study_workload_snapshots_unique_study unique (study_id)
);

create index if not exists idx_workload_snapshots_study_id
  on study_workload_snapshots (study_id);

create index if not exists idx_workload_snapshots_expires_at
  on study_workload_snapshots (expires_at);

drop trigger if exists trg_workload_snapshots_updated_at on study_workload_snapshots;
create trigger trg_workload_snapshots_updated_at
before update on study_workload_snapshots
for each row execute function update_updated_at_column();

alter table study_workload_snapshots enable row level security;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'study_workload_snapshots'
      and policyname = 'workload_snapshots_service_role'
  ) then
    create policy workload_snapshots_service_role on public.study_workload_snapshots
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end;
$policy$;
