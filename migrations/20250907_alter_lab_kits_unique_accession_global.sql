-- Make accession_number globally unique (not per study)
do $$
begin
  -- Drop old per-study unique constraint if it exists
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'lab_kits' and constraint_name = 'unique_accession_per_study'
  ) then
    alter table public.lab_kits drop constraint unique_accession_per_study;
  end if;

  -- Add new global unique constraint if not present
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'lab_kits' and constraint_name = 'unique_accession_number'
  ) then
    alter table public.lab_kits add constraint unique_accession_number unique (accession_number);
  end if;
end $$;

