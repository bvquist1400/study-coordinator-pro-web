-- Add accession_number column to lab_kit_shipments for accession-only shipments
-- and (re)create the check constraint ensuring either lab_kit_id or accession_number is present.

do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'lab_kit_shipments' and column_name = 'accession_number'
  ) then
    alter table public.lab_kit_shipments add column accession_number text null;
  end if;
end $$;

-- Recreate check constraint if missing
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'shipments_kit_or_accession_chk' and conrelid = 'public.lab_kit_shipments'::regclass
  ) then
    alter table public.lab_kit_shipments
      add constraint shipments_kit_or_accession_chk check (
        lab_kit_id is not null or accession_number is not null
      );
  end if;
end $$;

