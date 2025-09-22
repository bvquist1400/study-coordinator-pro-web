-- Applies schema updates for study kit catalog, lab kit requirements, and visit history.
-- Idempotent guards ensure compatibility when rerun.

-- 1) Create study_kit_types if missing.
create table if not exists public.study_kit_types (
  id uuid not null default extensions.uuid_generate_v4(),
  study_id uuid not null references public.studies (id) on delete cascade,
  name text not null,
  description text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint study_kit_types_pkey primary key (id)
);

create index if not exists idx_study_kit_types_study_id on public.study_kit_types using btree (study_id);
create unique index if not exists idx_study_kit_types_unique_name on public.study_kit_types (study_id, lower(name));

-- 2) Ensure lab_kits has kit_type_id column and updated constraints.
alter table public.lab_kits
  add column if not exists kit_type_id uuid null references public.study_kit_types(id) on delete set null;

-- Replace the legacy unique constraint on accession number with study-scoped uniqueness.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'unique_accession_number'
      and table_schema = 'public'
      and table_name = 'lab_kits'
  ) then
    execute 'alter table public.lab_kits drop constraint unique_accession_number';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'unique_accession_per_study'
      and table_schema = 'public'
      and table_name = 'lab_kits'
  ) then
    execute 'alter table public.lab_kits add constraint unique_accession_per_study unique (study_id, accession_number)';
  end if;
end $$;

create index if not exists idx_lab_kits_kit_type_id on public.lab_kits using btree (kit_type_id);
create index if not exists idx_lab_kits_study_id on public.lab_kits using btree (study_id);
create index if not exists idx_lab_kits_status on public.lab_kits using btree (status);
create index if not exists idx_lab_kits_expiration_date on public.lab_kits using btree (expiration_date);
create index if not exists idx_lab_kits_accession_number on public.lab_kits using btree (accession_number);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_lab_kits_updated_at'
      and n.nspname = 'public'
      and c.relname = 'lab_kits'
  ) then
    execute 'create trigger update_lab_kits_updated_at before update on public.lab_kits
             for each row execute function update_updated_at_column()';
  end if;
end $$;

-- 3) Create visit_kit_requirements table (and upgrade legacy schema if needed).
create table if not exists public.visit_kit_requirements (
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
);

create index if not exists idx_visit_kit_requirements_study_id on public.visit_kit_requirements using btree (study_id);
create index if not exists idx_visit_kit_requirements_visit_schedule_id on public.visit_kit_requirements using btree (visit_schedule_id);
create index if not exists idx_visit_kit_requirements_kit_type_id on public.visit_kit_requirements using btree (kit_type_id);

-- Legacy cleanup: drop obsolete kit_type text column if present after capturing data.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_kit_requirements'
      and column_name = 'kit_type'
  ) then
    -- Attempt to backfill kit_type_id for legacy rows before dropping the text column.
    update public.visit_kit_requirements vkr
    set kit_type_id = skt.id
    from public.study_kit_types skt
    where vkr.kit_type_id is null
      and skt.study_id = vkr.study_id
      and lower(skt.name) = lower(vkr.kit_type);

    if exists (
      select 1 from public.visit_kit_requirements
      where kit_type_id is null
    ) then
      raise warning 'Some visit_kit_requirements rows lack kit_type_id after backfill. Please resolve manually before the kit_type column is dropped.';
    else
      execute 'alter table public.visit_kit_requirements drop column kit_type';
    end if;
  end if;
end $$;

-- 4) Create visit_schedule_history audit table.
create table if not exists public.visit_schedule_history (
  id uuid not null default extensions.uuid_generate_v4 (),
  visit_id uuid not null references public.subject_visits (id) on delete cascade,
  old_date date null,
  new_date date null,
  reason text null,
  changed_by uuid null references auth.users (id) on delete set null,
  changed_at timestamp with time zone not null default now(),
  constraint visit_schedule_history_pkey primary key (id)
);

create index if not exists idx_visit_schedule_history_visit_id on public.visit_schedule_history using btree (visit_id);

-- 5) Ensure subject_visits has unscheduled visit tracking columns.
alter table public.subject_visits
  add column if not exists is_unscheduled boolean default false,
  add column if not exists unscheduled_reason text;

update public.subject_visits
set is_unscheduled = false
where is_unscheduled is null;

create index if not exists idx_subject_visits_visit_not_needed on public.subject_visits using btree (visit_not_needed);
create index if not exists idx_subject_visits_subject_section_id on public.subject_visits using btree (subject_section_id);
create index if not exists idx_subject_visits_cycle_index on public.subject_visits using btree (cycle_index);

-- 6) Create lab_kit_orders table for ordering workflow.
create table if not exists public.lab_kit_orders (
  id uuid not null default gen_random_uuid(),
  study_id uuid not null references public.studies (id) on delete cascade,
  kit_type_id uuid null references public.study_kit_types (id) on delete set null,
  quantity integer not null,
  vendor text null,
  expected_arrival date null,
  status text not null default 'pending'::text,
  notes text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  received_date date null,
  constraint lab_kit_orders_pkey primary key (id),
  constraint lab_kit_orders_status_check check (
    status = any (array['pending'::text, 'received'::text, 'cancelled'::text])
  ),
  constraint lab_kit_orders_quantity_check check (quantity > 0)
);

create index if not exists idx_lab_kit_orders_study_id on public.lab_kit_orders using btree (study_id);
create index if not exists idx_lab_kit_orders_kit_type_id on public.lab_kit_orders using btree (kit_type_id);
create index if not exists idx_lab_kit_orders_status on public.lab_kit_orders using btree (status);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_lab_kit_orders_updated_at'
      and n.nspname = 'public'
      and c.relname = 'lab_kit_orders'
  ) then
    execute 'create trigger update_lab_kit_orders_updated_at before update on public.lab_kit_orders
             for each row execute function update_updated_at_column()';
  end if;
end $$;
