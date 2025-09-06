create table public.lab_kit_usage (
  id uuid not null default gen_random_uuid (),
  lab_kit_id uuid not null,
  subject_visit_id uuid not null,
  used_date date not null,
  used_by_user_id uuid null,
  notes text null,
  created_at timestamp with time zone null default now(),
  constraint lab_kit_usage_pkey primary key (id),
  constraint lab_kit_usage_lab_kit_id_fkey foreign KEY (lab_kit_id) references lab_kits (id) on delete CASCADE,
  constraint lab_kit_usage_subject_visit_id_fkey foreign KEY (subject_visit_id) references subject_visits (id) on delete CASCADE,
  constraint lab_kit_usage_used_by_user_id_fkey foreign KEY (used_by_user_id) references auth.users (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_lab_kit_usage_lab_kit_id on public.lab_kit_usage using btree (lab_kit_id) TABLESPACE pg_default;