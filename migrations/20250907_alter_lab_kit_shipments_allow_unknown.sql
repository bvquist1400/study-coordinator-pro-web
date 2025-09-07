-- Allow creating shipments for kits not in inventory
-- 1) Make lab_kit_id nullable
-- 2) Add accession_number column
-- 3) Add check: must have either lab_kit_id or accession_number
do $$
begin
  -- Make lab_kit_id nullable
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='lab_kit_shipments' and column_name='lab_kit_id' and is_nullable='NO'
  ) then
    alter table public.lab_kit_shipments alter column lab_kit_id drop not null;
  end if;

  -- Add accession_number column if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='lab_kit_shipments' and column_name='accession_number'
  ) then
    alter table public.lab_kit_shipments add column accession_number text null;
  end if;

  -- Add presence check constraint
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema='public' and table_name='lab_kit_shipments' and constraint_name='shipments_kit_or_accession_chk'
  ) then
    alter table public.lab_kit_shipments
      add constraint shipments_kit_or_accession_chk check (lab_kit_id is not null or accession_number is not null);
  end if;
end $$;

