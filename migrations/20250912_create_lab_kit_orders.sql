create table if not exists public.lab_kit_orders (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies (id) on delete cascade,
  kit_type_id uuid references public.study_kit_types (id) on delete set null,
  quantity integer not null check (quantity > 0),
  vendor text,
  expected_arrival date,
  status text not null default 'pending',
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  received_date date,
  constraint lab_kit_orders_status_check check (
    status = any (array['pending', 'received', 'cancelled'])
  )
);

create index if not exists idx_lab_kit_orders_study_id on public.lab_kit_orders using btree (study_id);
create index if not exists idx_lab_kit_orders_kit_type_id on public.lab_kit_orders using btree (kit_type_id);
create index if not exists idx_lab_kit_orders_status on public.lab_kit_orders using btree (status);

create trigger if not exists update_lab_kit_orders_updated_at
before update on public.lab_kit_orders
for each row execute procedure public.update_updated_at_column();
