-- Use IF EXISTS to ensure idempotency and avoid name conflicts
alter table public.lab_kits drop constraint if exists lab_kits_status_check;

-- Recreate with expanded set including 'delivered'
alter table public.lab_kits
  add constraint lab_kits_status_check check (
    status = any (
      array[
        'available',
        'assigned',
        'used',
        'pending_shipment',
        'shipped',
        'delivered',
        'expired',
        'destroyed',
        'archived'
      ]
    )
  );
