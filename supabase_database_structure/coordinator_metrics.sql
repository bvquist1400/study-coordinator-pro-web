create table public.coordinator_metrics (
  id uuid not null default gen_random_uuid(),
  coordinator_id uuid not null,
  recorded_by uuid null references auth.users (id),
  week_start date not null,
  meeting_hours numeric(5,2) not null default 0.00,
  screening_hours numeric(5,2) not null default 0.00,
  screening_study_count integer not null default 0,
  query_hours numeric(5,2) not null default 0.00,
  query_study_count integer not null default 0,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint coordinator_metrics_pkey primary key (id),
  constraint coordinator_metrics_unique_week unique (coordinator_id, week_start),
  constraint coordinator_metrics_coordinator_id_fkey foreign key (coordinator_id) references auth.users (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_coordinator_metrics_study_id
  on public.coordinator_metrics using btree (study_id) tablespace pg_default;

create index if not exists idx_coordinator_metrics_coordinator_id
  on public.coordinator_metrics using btree (coordinator_id) tablespace pg_default;

create index if not exists idx_coordinator_metrics_week_start
  on public.coordinator_metrics using btree (week_start) tablespace pg_default;

create trigger update_coordinator_metrics_updated_at before
update on coordinator_metrics for each row
execute function update_updated_at_column ();
