-- Expand lab_kits.status to include destroyed and archived; keep other values
do $$
begin
  -- Drop existing check constraint if present
  if exists (
    select 1 from information_schema.check_constraints cc
    join information_schema.constraint_table_usage ctu on cc.constraint_name = ctu.constraint_name
    where ctu.table_schema = 'public' and ctu.table_name = 'lab_kits' and cc.constraint_name = 'lab_kits_status_check'
  ) then
    alter table public.lab_kits drop constraint lab_kits_status_check;
  end if;

  -- Recreate with expanded set
  alter table public.lab_kits
    add constraint lab_kits_status_check check (
      status = any (array['available','assigned','used','pending_shipment','shipped','expired','destroyed','archived'])
    );
end $$;

