create table public.visit_kit_requirements (
  id uuid not null default extensions.uuid_generate_v4(),
  study_id uuid not null references public.studies (id) on delete cascade,
  visit_schedule_id uuid not null references public.visit_schedules (id) on delete cascade,
  kit_type_id uuid not null references public.study_kit_types (id) on delete cascade,
  quantity integer not null default 1,
  is_optional boolean not null default false,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint visit_kit_requirements_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_visit_kit_requirements_study_id on public.visit_kit_requirements using btree (study_id) tablespace pg_default;
create index if not exists idx_visit_kit_requirements_visit_schedule_id on public.visit_kit_requirements using btree (visit_schedule_id) tablespace pg_default;
create index if not exists idx_visit_kit_requirements_kit_type_id on public.visit_kit_requirements using btree (kit_type_id) tablespace pg_default;
