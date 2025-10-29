-- Align studies table with current application expectations.
-- Adds site linkage, audit columns, and supporting constraints.

alter table public.studies
  add column if not exists site_id uuid null,
  add column if not exists created_by uuid null,
  add column if not exists protocol_version text null,
  add column if not exists anchor_day integer not null default 0,
  add column if not exists inventory_buffer_kits integer not null default 0;

-- Ensure existing rows pick up the new defaults (covers databases where column was nullable).
update public.studies
set anchor_day = 0
where anchor_day is null;

update public.studies
set inventory_buffer_kits = 0
where inventory_buffer_kits is null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'studies'
      and constraint_name = 'studies_site_id_fkey'
  ) then
    alter table public.studies
      add constraint studies_site_id_fkey foreign key (site_id) references public.sites(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'studies'
      and constraint_name = 'studies_created_by_fkey'
  ) then
    alter table public.studies
      add constraint studies_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'studies'
      and constraint_name = 'uniq_studies_site_protocol'
  ) then
    alter table public.studies
      add constraint uniq_studies_site_protocol unique (site_id, protocol_number);
  end if;
end;
$$;

create index if not exists idx_studies_site_id on public.studies(site_id);
