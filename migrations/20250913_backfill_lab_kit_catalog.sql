-- Backfills study_kit_types and lab_kits.kit_type_id values for legacy data.
-- Safe to rerun; inserts use ON CONFLICT guards via unique index.

begin;

with distinct_kits as (
  select
    lk.study_id,
    trim(lk.kit_type) as kit_name
  from public.lab_kits lk
  where lk.kit_type is not null
    and trim(lk.kit_type) <> ''
  group by lk.study_id, trim(lk.kit_type)
)
insert into public.study_kit_types (study_id, name)
select dk.study_id, dk.kit_name
from distinct_kits dk
on conflict (study_id, lower(name)) do nothing;

update public.lab_kits lk
set kit_type_id = skt.id,
    kit_type = skt.name
from public.study_kit_types skt
where lk.study_id = skt.study_id
  and lk.kit_type is not null
  and lower(trim(lk.kit_type)) = lower(skt.name)
  and (lk.kit_type_id is null or lk.kit_type_id <> skt.id);

commit;

-- Normalize visit kit requirements created prior to catalog introduction.
update public.visit_kit_requirements vkr
set kit_type_id = skt.id
from public.study_kit_types skt
where vkr.kit_type_id is null
  and skt.study_id = vkr.study_id
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_kit_requirements'
      and column_name = 'kit_type'
  )
  and coalesce(lower(vkr.notes), '') is distinct from 'legacy_unmapped';

-- Drop the legacy text column when possible.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_kit_requirements'
      and column_name = 'kit_type'
  ) then
    if not exists (
      select 1 from public.visit_kit_requirements
      where kit_type_id is null
    ) then
      execute 'alter table public.visit_kit_requirements drop column kit_type';
    end if;
  end if;
end $$;
