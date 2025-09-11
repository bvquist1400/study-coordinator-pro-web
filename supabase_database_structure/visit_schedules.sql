create table public.visit_schedules (
  id uuid not null default extensions.uuid_generate_v4 (),
  study_id uuid not null,
  section_id uuid null,
  visit_name text not null,
  visit_number text not null,
  visit_day integer not null,
  window_before_days integer null default 3,
  window_after_days integer null default 3,
  is_required boolean null default true,
  visit_type text null default 'regular'::text,
  procedures text[] null,
  ip_compliance_calc_required boolean null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint visit_schedules_pkey primary key (id),
  constraint visit_schedules_section_id_fkey foreign KEY (section_id) references study_sections (id) on delete CASCADE,
  constraint uniq_visit_schedules_section_visit_number unique (section_id, visit_number),
  constraint visit_schedules_visit_type_check check (
    (
      visit_type = any (
        array[
          'screening'::text,
          'baseline'::text,
          'regular'::text,
          'unscheduled'::text,
          'early_termination'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_visit_schedules_section_id on public.visit_schedules using btree (section_id) TABLESPACE pg_default;

create trigger prevent_soe_orphans BEFORE DELETE
or
update on visit_schedules for EACH row
execute FUNCTION handle_soe_changes ();

create trigger update_visit_schedules_updated_at BEFORE
update on visit_schedules for EACH row
execute FUNCTION update_updated_at_column ();
