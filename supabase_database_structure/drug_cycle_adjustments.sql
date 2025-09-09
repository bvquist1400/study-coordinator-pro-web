create table public.drug_cycle_adjustments (
  id uuid not null default extensions.uuid_generate_v4(),
  cycle_id uuid not null references public.subject_drug_cycles(id) on delete cascade,
  event_type text not null check (event_type in ('dispense','return','correction')),
  delta_tablets integer not null,
  event_date date not null,
  reason text null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint drug_cycle_adjustments_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_drug_cycle_adjustments_cycle on public.drug_cycle_adjustments using btree (cycle_id) tablespace pg_default;
create index if not exists idx_drug_cycle_adjustments_event_date on public.drug_cycle_adjustments using btree (event_date) tablespace pg_default;

