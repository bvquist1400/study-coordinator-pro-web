create table public.subject_sections (
  id uuid not null default extensions.uuid_generate_v4 (),
  subject_id uuid not null,
  study_section_id uuid not null,
  anchor_date date not null,
  started_at timestamp with time zone null default now(),
  ended_at timestamp with time zone null,
  status text null default 'active',
  transition_reason text null,
  notes text null,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint subject_sections_pkey primary key (id),
  constraint subject_sections_subject_id_fkey foreign KEY (subject_id) references subjects (id) on delete CASCADE,
  constraint subject_sections_study_section_id_fkey foreign KEY (study_section_id) references study_sections (id) on delete CASCADE,
  constraint subject_sections_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete set null,
  constraint subject_sections_status_check check (
    (
      status = any (
        array['planned'::text, 'active'::text, 'completed'::text, 'terminated'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_subject_sections_subject_id on public.subject_sections using btree (subject_id) TABLESPACE pg_default;

create index IF not exists idx_subject_sections_study_section_id on public.subject_sections using btree (study_section_id) TABLESPACE pg_default;

create unique index IF not exists uq_subject_sections_active_one on public.subject_sections (subject_id) where (ended_at is null);

create trigger update_subject_sections_updated_at BEFORE
update on subject_sections for EACH row
execute FUNCTION update_updated_at_column ();

