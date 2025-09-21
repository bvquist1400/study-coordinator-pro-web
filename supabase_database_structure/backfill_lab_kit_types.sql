-- Validate that the lab_kits table already has the kit_type_id column.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lab_kits'
      and column_name = 'kit_type_id'
  ) then
    raise exception 'lab_kits.kit_type_id does not exist. Apply the lab kit catalog migration first.';
  end if;
end
$$;

begin;

-- 1) Normalize existing lab kit names and ensure matching catalog rows exist.
with distinct_kits as (
  select
    lk.study_id,
    trim(lk.kit_type) as kit_name
  from lab_kits lk
  where lk.kit_type is not null
    and trim(lk.kit_type) <> ''
  group by lk.study_id, trim(lk.kit_type)
),
missing_catalog as (
  select dk.study_id, dk.kit_name
  from distinct_kits dk
  left join study_kit_types skt
    on skt.study_id = dk.study_id
   and lower(skt.name) = lower(dk.kit_name)
  where skt.id is null
)
insert into study_kit_types (study_id, name)
select mc.study_id, mc.kit_name
from missing_catalog mc;

-- 2) Backfill lab_kits.kit_type_id using the catalog entry
--    and realign the display name to the canonical catalog value.
update lab_kits lk
set kit_type_id = skt.id,
    kit_type = skt.name
from study_kit_types skt
where lk.study_id = skt.study_id
  and lk.kit_type is not null
  and lower(trim(lk.kit_type)) = lower(skt.name)
  and (lk.kit_type_id is null or lk.kit_type_id <> skt.id);

commit;
