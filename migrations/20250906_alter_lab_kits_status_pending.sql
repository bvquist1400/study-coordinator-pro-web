-- Allow 'pending_shipment' status for lab_kits and keep existing values
do $$
begin
  -- Drop old status check if present
  if exists (
    select 1 from information_schema.table_constraints 
    where table_schema='public' and table_name='lab_kits' and constraint_name='lab_kits_status_check'
  ) then
    alter table public.lab_kits drop constraint lab_kits_status_check;
  end if;

  -- Add updated check constraint including pending_shipment
  alter table public.lab_kits
    add constraint lab_kits_status_check check (
      status = any (array['available','assigned','used','pending_shipment','shipped','expired'])
    );
end $$;

