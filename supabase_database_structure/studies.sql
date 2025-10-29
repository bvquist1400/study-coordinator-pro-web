create table public.studies (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  protocol_number text not null,
  study_title text not null,
  sponsor text null,
  principal_investigator text null,
  phase text null,
  indication text null,
  status text null default 'enrolling'::text,
  lifecycle lifecycle_stage not null default 'active'::lifecycle_stage,
  recruitment recruitment_status not null default 'enrolling'::recruitment_status,
  protocol_score numeric(4,2) not null default 3.00,
  screening_multiplier numeric(3,2) not null default 1.00,
  query_multiplier numeric(3,2) not null default 1.00,
  meeting_admin_points numeric(6,2) not null default 0.00,
  rubric_trial_type text null,
  rubric_phase text null,
  rubric_sponsor_type text null,
  rubric_visit_volume text null,
  rubric_procedural_intensity text null,
  rubric_notes text null,
  start_date date null,
  end_date date null,
  target_enrollment integer null,
  visit_window_days integer null default 7,
  dosing_frequency text null default 'QD'::text,
  compliance_threshold numeric null default 80.0,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  site_id uuid null,
  created_by uuid null,
  protocol_version text null,
  anchor_day integer not null default 0,
  inventory_buffer_days integer not null default 14,
  visit_window_buffer_days integer not null default 0,
  inventory_buffer_kits integer not null default 0,
  delivery_days_default integer not null default 5,
  constraint studies_pkey primary key (id),
  constraint uniq_studies_site_protocol unique (site_id, protocol_number),
  constraint studies_user_id_protocol_number_key unique (user_id, protocol_number),
  constraint studies_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete set null,
  constraint studies_site_id_fkey foreign KEY (site_id) references sites (id) on delete CASCADE,
  constraint studies_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint studies_status_check check (
    (
      status = any (
        array[
          'enrolling'::text,
          'active'::text,
          'closed_to_enrollment'::text,
          'completed'::text
        ]
      )
    )
  ),
  constraint studies_dosing_frequency_check check (
    (
      dosing_frequency = any (
        array[
          'QD'::text,
          'BID'::text,
          'TID'::text,
          'QID'::text,
          'weekly'::text,
          'custom'::text
        ]
      )
    )
  ),
  constraint studies_delivery_days_default_check check (
    delivery_days_default >= 0 and delivery_days_default <= 120
  )
) TABLESPACE pg_default;

create index IF not exists idx_studies_user_id on public.studies using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_studies_status on public.studies using btree (status) TABLESPACE pg_default;

create index IF not exists idx_studies_site_id on public.studies using btree (site_id) TABLESPACE pg_default;

create trigger update_studies_updated_at BEFORE
update on studies for EACH row
execute FUNCTION update_updated_at_column ();
