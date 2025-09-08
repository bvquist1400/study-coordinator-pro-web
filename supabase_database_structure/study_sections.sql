create table public.study_sections (
  id uuid not null default extensions.uuid_generate_v4 (),
  study_id uuid not null,
  code text not null,
  name text null,
  order_index integer null,
  anchor_type text not null default 'section_anchor_date',
  anchor_offset_days integer null default 0,
  dosing_frequency text null,
  compliance_threshold numeric null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint study_sections_pkey primary key (id),
  constraint study_sections_study_id_fkey foreign KEY (study_id) references studies (id) on delete CASCADE,
  constraint uniq_study_sections_study_code unique (study_id, code),
  constraint study_sections_anchor_type_check check (
    (
      anchor_type = any (
        array[
          'enrollment_date'::text,
          'randomization_date'::text,
          'first_dose_date'::text,
          'section_anchor_date'::text,
          'previous_section_end_date'::text,
          'custom_event_date'::text
        ]
      )
    )
  ),
  constraint study_sections_dosing_frequency_check check (
    (
      dosing_frequency is null
      or dosing_frequency = any (
        array['QD'::text, 'BID'::text, 'TID'::text, 'QID'::text, 'weekly'::text, 'custom'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_study_sections_study_id on public.study_sections using btree (study_id) TABLESPACE pg_default;

create trigger update_study_sections_updated_at BEFORE
update on study_sections for EACH row
execute FUNCTION update_updated_at_column ();

