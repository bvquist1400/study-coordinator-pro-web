-- Sections Phase 1 Migration
-- Adds study_sections and subject_sections, namespaces visit_schedules by section,
-- links subject_visits to subject_sections, backfills default sections/assignments,
-- and updates expected dose calculation to prefer section-level dosing frequency.

-- 1) Tables: study_sections and subject_sections
create table if not exists public.study_sections (
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
  constraint study_sections_study_id_fkey foreign key (study_id) references public.studies (id) on delete cascade,
  constraint uniq_study_sections_study_code unique (study_id, code),
  constraint study_sections_anchor_type_check check (
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
  ),
  constraint study_sections_dosing_frequency_check check (
    dosing_frequency is null or dosing_frequency = any (
      array['QD'::text,'BID'::text,'TID'::text,'QID'::text,'weekly'::text,'custom'::text]
    )
  )
);

create index if not exists idx_study_sections_study_id on public.study_sections (study_id);

-- Trigger to auto-update updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'update_study_sections_updated_at'
  ) then
    create trigger update_study_sections_updated_at
    before update on public.study_sections
    for each row execute function update_updated_at_column();
  end if;
end$$;

create table if not exists public.subject_sections (
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
  constraint subject_sections_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete cascade,
  constraint subject_sections_study_section_id_fkey foreign key (study_section_id) references public.study_sections (id) on delete cascade,
  constraint subject_sections_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null,
  constraint subject_sections_status_check check (
    status = any (array['planned'::text,'active'::text,'completed'::text,'terminated'::text])
  )
);

create index if not exists idx_subject_sections_subject_id on public.subject_sections (subject_id);
create index if not exists idx_subject_sections_study_section_id on public.subject_sections (study_section_id);

-- One active section per subject at a time
create unique index if not exists uq_subject_sections_active_one
  on public.subject_sections (subject_id)
  where ended_at is null;

-- Trigger to auto-update updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'update_subject_sections_updated_at'
  ) then
    create trigger update_subject_sections_updated_at
    before update on public.subject_sections
    for each row execute function update_updated_at_column();
  end if;
end$$;

-- 2) Alter visit_schedules: add section_id and per-section uniqueness
alter table public.visit_schedules add column if not exists section_id uuid null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'visit_schedules' and constraint_name = 'visit_schedules_section_id_fkey'
  ) then
    alter table public.visit_schedules
      add constraint visit_schedules_section_id_fkey
      foreign key (section_id) references public.study_sections (id) on delete cascade;
  end if;
end$$;

create index if not exists idx_visit_schedules_section_id on public.visit_schedules (section_id);
create unique index if not exists uniq_visit_schedules_section_visit_number
  on public.visit_schedules (section_id, visit_number);

-- 3) Alter subject_visits: link to subject_sections (+ optional cycle index)
alter table public.subject_visits add column if not exists subject_section_id uuid null;
alter table public.subject_visits add column if not exists cycle_index integer null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'subject_visits' and constraint_name = 'subject_visits_subject_section_id_fkey'
  ) then
    alter table public.subject_visits
      add constraint subject_visits_subject_section_id_fkey
      foreign key (subject_section_id) references public.subject_sections (id) on delete set null;
  end if;
end$$;

create index if not exists idx_subject_visits_subject_section_id on public.subject_visits (subject_section_id);
create index if not exists idx_subject_visits_cycle_index on public.subject_visits (cycle_index);

-- 4) Backfill: default section per study and map visit_schedules
-- Insert default section S1 for all studies that don't have one
insert into public.study_sections (study_id, code, name, order_index, anchor_type, is_active)
select s.id, 'S1', 'Default Section', 1, 'section_anchor_date', true
from public.studies s
where not exists (
  select 1 from public.study_sections ss where ss.study_id = s.id and ss.code = 'S1'
);

-- Set visit_schedules.section_id to the default section for each study if null
update public.visit_schedules vs
set section_id = ss.id
from public.study_sections ss
where ss.study_id = vs.study_id
  and ss.code = 'S1'
  and vs.section_id is null;

-- Drop old uniqueness (study_id, visit_number) if it exists, now replaced by (section_id, visit_number)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'visit_schedules'
      and constraint_name = 'visit_schedules_study_id_visit_number_key'
  ) then
    alter table public.visit_schedules drop constraint visit_schedules_study_id_visit_number_key;
  end if;
end$$;

-- 5) Backfill: subject_sections per subject and link subject_visits
-- Use randomization_date if present, else enrollment_date, as initial anchor
insert into public.subject_sections (subject_id, study_section_id, anchor_date, status)
select subj.id as subject_id,
       ss.id as study_section_id,
       coalesce(subj.randomization_date, subj.enrollment_date) as anchor_date,
       'active' as status
from public.subjects subj
join public.studies st on st.id = subj.study_id
join public.study_sections ss on ss.study_id = st.id and ss.code = 'S1'
where not exists (
  select 1 from public.subject_sections x
  where x.subject_id = subj.id and x.ended_at is null
);

-- Attach existing subject_visits to the active subject_section
update public.subject_visits v
set subject_section_id = ss.id
from public.subject_sections ss
where ss.subject_id = v.subject_id
  and ss.ended_at is null
  and v.subject_section_id is null;

-- 6) Update expected_taken function to prefer section dosing frequency
create or replace function public.calculate_expected_taken()
returns trigger
language plpgsql
as $$
declare
  l_dose_per_day numeric := 1;
  l_freq text;
begin
  if new.visit_id is not null then
    select coalesce(sec.dosing_frequency, s.dosing_frequency)
      into l_freq
    from public.subject_visits v
    left join public.subject_sections ss on ss.id = v.subject_section_id
    left join public.study_sections sec on sec.id = ss.study_section_id
    join public.studies s on s.id = v.study_id
    where v.id = new.visit_id;

    if l_freq is not null then
      l_dose_per_day := case l_freq
        when 'QD' then 1
        when 'BID' then 2
        when 'TID' then 3
        when 'QID' then 4
        when 'weekly' then 1.0/7.0
        else 1
      end;
    end if;
  end if;

  if new.dispensing_date is not null and new.ip_last_dose_date is not null then
    new.expected_taken := greatest(0, (new.ip_last_dose_date - new.dispensing_date + 1)) * l_dose_per_day;
  else
    new.expected_taken := null;
  end if;

  return new;
end;
$$;

-- Note: drug_compliance.is_compliant remains at the default 80% threshold.
-- Section-level compliance_threshold is available for reporting/UI overrides.

