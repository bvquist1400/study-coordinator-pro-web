create table public.subjects (
  id uuid not null default extensions.uuid_generate_v4 (),
  study_id uuid not null,
  user_id uuid not null,
  subject_number text not null,
  initials text null,
  date_of_birth date null,
  gender text null,
  enrollment_date date not null default CURRENT_DATE,
  randomization_date date null,
  treatment_arm text null,
  status text null default 'active'::text,
  phase subject_phase not null default 'active_treatment'::subject_phase,
  discontinuation_reason text null,
  discontinuation_date date null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint subjects_pkey primary key (id),
  constraint subjects_study_id_subject_number_key unique (study_id, subject_number),
  constraint subjects_study_id_fkey foreign KEY (study_id) references studies (id) on delete CASCADE,
  constraint subjects_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint subjects_gender_check check (
    (
      gender = any (array['M'::text, 'F'::text, 'Other'::text])
    )
  ),
  constraint subjects_status_check check (
    (
      status = any (
        array[
          'screening'::text,
          'enrolled'::text,
          'active'::text,
          'completed'::text,
          'discontinued'::text,
          'withdrawn'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_subjects_study_id on public.subjects using btree (study_id) TABLESPACE pg_default;

create index IF not exists idx_subjects_user_id on public.subjects using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_subjects_status on public.subjects using btree (status) TABLESPACE pg_default;

create trigger update_subjects_updated_at BEFORE
update on subjects for EACH row
execute FUNCTION update_updated_at_column ();
