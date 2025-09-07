create table public.subject_visits (
  id uuid not null default extensions.uuid_generate_v4 (),
  subject_id uuid not null,
  visit_schedule_id uuid null,
  user_id uuid not null,
  visit_name text not null,
  visit_date date not null,
  status text null default 'scheduled'::text,
  is_within_window boolean null,
  days_from_scheduled integer null,
  procedures_completed text[] null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  study_id uuid null,
  lab_kit_required boolean null,
  accession_number text null,
  airway_bill_number text null,
  lab_kit_shipped_date date null,
  drug_dispensing_required boolean null,
  ip_last_dose_date date null,
  ip_dispensed integer null,
  ip_returned integer null,
  ip_start_date date null,
  local_labs_required boolean null,
  local_labs_completed boolean null,
  ip_id text null,
  return_ip_id text null,
  visit_not_needed boolean null default false,
  constraint subject_visits_pkey primary key (id),
  constraint subject_visits_study_id_fkey foreign KEY (study_id) references studies (id),
  constraint subject_visits_subject_id_fkey foreign KEY (subject_id) references subjects (id) on delete CASCADE,
  constraint subject_visits_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint subject_visits_visit_schedule_id_fkey foreign KEY (visit_schedule_id) references visit_schedules (id) on update CASCADE on delete set null,
  constraint subject_visits_status_check check (
    (
      status = any (
        array[
          'scheduled'::text,
          'completed'::text,
          'missed'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_subject_visits_subject_id on public.subject_visits using btree (subject_id) TABLESPACE pg_default;

create index IF not exists idx_subject_visits_scheduled_date on public.subject_visits using btree (visit_date) TABLESPACE pg_default;

create index IF not exists idx_subject_visits_status on public.subject_visits using btree (status) TABLESPACE pg_default;

create index IF not exists idx_subject_visits_visit_not_needed on public.subject_visits using btree (visit_not_needed) TABLESPACE pg_default;

create trigger update_subject_visits_updated_at BEFORE
update on subject_visits for EACH row
execute FUNCTION update_updated_at_column ();