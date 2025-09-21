create table public.lab_kit_orders (
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
) tablespace pg_default;

create index if not exists idx_lab_kit_orders_study_id on public.lab_kit_orders using btree (study_id) tablespace pg_default;
create index if not exists idx_lab_kit_orders_kit_type_id on public.lab_kit_orders using btree (kit_type_id) tablespace pg_default;
create index if not exists idx_lab_kit_orders_status on public.lab_kit_orders using btree (status) tablespace pg_default;

create trigger update_lab_kit_orders_updated_at before
update on lab_kit_orders for each row
execute function update_updated_at_column ();
