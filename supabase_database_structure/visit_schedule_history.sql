create table public.visit_schedule_history (
  id uuid not null default extensions.uuid_generate_v4 (),
  visit_id uuid not null references public.subject_visits (id) on delete cascade,
  old_date date null,
  new_date date null,
  reason text null,
  changed_by uuid null references auth.users (id) on delete set null,
  changed_at timestamp with time zone not null default now(),
  constraint visit_schedule_history_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_visit_schedule_history_visit_id on public.visit_schedule_history using btree (visit_id) tablespace pg_default;
