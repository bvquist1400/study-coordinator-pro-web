-- Initial core schema baseline for Study Coordinator Pro
-- Ensures foundational tables exist so later migrations apply cleanly.

-- Extensions required for UUID generation helpers.
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Generic trigger to keep updated_at columns in sync.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auth-linked profile details for application users.
create table if not exists public.user_profiles (
  id uuid not null,
  email text not null,
  full_name text null,
  role text null default 'coordinator',
  organization text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint user_profiles_pkey primary key (id),
  constraint user_profiles_id_fkey foreign key (id) references auth.users (id)
);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_user_profiles_updated_at'
      and n.nspname = 'public'
      and c.relname = 'user_profiles'
  ) then
    create trigger update_user_profiles_updated_at
      before update on public.user_profiles
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

-- Clinical sites that own studies.
create table if not exists public.sites (
  id uuid not null default extensions.uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_pkey primary key (id)
);

-- Site membership roster and roles.
create table if not exists public.site_members (
  site_id uuid not null,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  constraint site_members_pkey primary key (site_id, user_id),
  constraint site_members_site_id_fkey foreign key (site_id) references public.sites (id) on delete cascade,
  constraint site_members_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint site_members_role_check check (
    role = any (array['owner','coordinator','pi','monitor'])
  )
);

-- Core study metadata (columns expanded in later migrations).
create table if not exists public.studies (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  protocol_number text not null,
  study_title text not null,
  sponsor text null,
  principal_investigator text null,
  phase text null,
  indication text null,
  status text null default 'enrolling' check (
    status in ('enrolling','active','closed_to_enrollment','completed')
  ),
  start_date date null,
  end_date date null,
  target_enrollment integer null,
  visit_window_days integer null default 7,
  inventory_buffer_days integer null default 14,
  visit_window_buffer_days integer null default 0,
  delivery_days_default integer null default 5 check (delivery_days_default >= 0 and delivery_days_default <= 120),
  dosing_frequency text null default 'QD' check (
    dosing_frequency in ('QD','BID','TID','QID','weekly','custom')
  ),
  compliance_threshold numeric null default 80.0,
  notes text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint studies_user_id_protocol_number_key unique (user_id, protocol_number)
);

create index if not exists idx_studies_user_id on public.studies(user_id);
create index if not exists idx_studies_status on public.studies(status);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_studies_updated_at'
      and n.nspname = 'public'
      and c.relname = 'studies'
  ) then
    create trigger update_studies_updated_at
      before update on public.studies
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

-- Study-level kit catalog.
create table if not exists public.study_kit_types (
  id uuid not null default extensions.uuid_generate_v4(),
  study_id uuid not null references public.studies(id) on delete cascade,
  name text not null,
  description text null,
  buffer_days integer null,
  buffer_count integer null,
  delivery_days integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_kit_types_pkey primary key (id),
  constraint study_kit_types_buffer_days_check check (
    buffer_days is null or (buffer_days >= 0 and buffer_days <= 120)
  ),
  constraint study_kit_types_buffer_count_check check (
    buffer_count is null or (buffer_count >= 0 and buffer_count <= 999)
  ),
  constraint study_kit_types_delivery_days_check check (
    delivery_days is null or (delivery_days >= 0 and delivery_days <= 120)
  )
);

create index if not exists idx_study_kit_types_study_id on public.study_kit_types(study_id);
create unique index if not exists idx_study_kit_types_unique_name on public.study_kit_types (study_id, lower(name));

-- Subjects enrolled on a study.
create table if not exists public.subjects (
  id uuid not null default uuid_generate_v4() primary key,
  study_id uuid not null references public.studies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_number text not null,
  initials text null,
  date_of_birth date null,
  gender text null check (gender in ('M','F','Other')),
  enrollment_date date not null default current_date,
  randomization_date date null,
  treatment_arm text null,
  status text null default 'active' check (
    status in ('screening','enrolled','active','completed','discontinued','withdrawn')
  ),
  discontinuation_reason text null,
  discontinuation_date date null,
  notes text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint subjects_study_id_subject_number_key unique (study_id, subject_number)
);

create index if not exists idx_subjects_study_id on public.subjects(study_id);
create index if not exists idx_subjects_user_id on public.subjects(user_id);
create index if not exists idx_subjects_status on public.subjects(status);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_subjects_updated_at'
      and n.nspname = 'public'
      and c.relname = 'subjects'
  ) then
    create trigger update_subjects_updated_at
      before update on public.subjects
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

-- Per-study visit templates.
create table if not exists public.visit_schedules (
  id uuid not null default uuid_generate_v4() primary key,
  study_id uuid not null references public.studies(id) on delete cascade,
  visit_name text not null,
  visit_number integer not null,
  visit_day integer not null,
  timing_value integer not null default 0,
  timing_unit text not null default 'days' check (timing_unit in ('days','weeks','months')),
  window_before_days integer null default 3,
  window_after_days integer null default 3,
  is_required boolean null default true,
  visit_type text null default 'regular' check (
    visit_type in ('screening','baseline','regular','unscheduled','early_termination')
  ),
  procedures text[] null,
  notes text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint visit_schedules_study_id_visit_number_key unique (study_id, visit_number)
);

-- Subject visits with IP accountability details.
create table if not exists public.subject_visits (
  id uuid not null default uuid_generate_v4() primary key,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  visit_schedule_id uuid null references public.visit_schedules(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_name text not null,
  visit_date date not null,
  status text null default 'scheduled' check (
    status in ('scheduled','completed','missed','cancelled')
  ),
  is_within_window boolean null,
  days_from_scheduled integer null,
  procedures_completed text[] null,
  notes text null,
  study_id uuid null references public.studies(id),
  lab_kit_required boolean null,
  accession_number text null,
  airway_bill_number text null,
  lab_kit_shipped_date date null,
  drug_dispensing_required boolean null,
  ip_start_date date null,
  ip_last_dose_date date null,
  ip_dispensed integer null,
  ip_returned integer null,
  ip_id text null,
  local_labs_required boolean null,
  local_labs_completed boolean null default false,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now()
);

create index if not exists idx_subject_visits_subject_id on public.subject_visits(subject_id);
create index if not exists idx_subject_visits_visit_date on public.subject_visits(visit_date);
create index if not exists idx_subject_visits_status on public.subject_visits(status);
create index if not exists idx_subject_visits_study_id on public.subject_visits(study_id);
create index if not exists idx_subject_visits_ip_id on public.subject_visits(ip_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_subject_visits_updated_at'
      and n.nspname = 'public'
      and c.relname = 'subject_visits'
  ) then
    create trigger update_subject_visits_updated_at
      before update on public.subject_visits
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

-- Lab kit inventory tied to studies and visit templates.
create table if not exists public.lab_kits (
  id uuid not null default gen_random_uuid() primary key,
  study_id uuid not null references public.studies(id) on delete cascade,
  visit_schedule_id uuid null references public.visit_schedules(id) on delete set null,
  accession_number text not null,
  kit_type text null,
  lot_number text null,
  expiration_date date null,
  status text null default 'available' check (
    status in (
      'available','assigned','used','pending_shipment',
      'shipped','delivered','expired','destroyed','archived'
    )
  ),
  received_date date null,
  notes text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  kit_type_id uuid null references public.study_kit_types(id) on delete set null,
  constraint unique_accession_per_study unique (study_id, accession_number)
);

create index if not exists idx_lab_kits_study_id on public.lab_kits(study_id);
create index if not exists idx_lab_kits_status on public.lab_kits(status);
create index if not exists idx_lab_kits_expiration_date on public.lab_kits(expiration_date);
create index if not exists idx_lab_kits_accession_number on public.lab_kits(accession_number);
create index if not exists idx_lab_kits_kit_type_id on public.lab_kits(kit_type_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_lab_kits_updated_at'
      and n.nspname = 'public'
      and c.relname = 'lab_kits'
  ) then
    create trigger update_lab_kits_updated_at
      before update on public.lab_kits
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

-- Tracking outbound and returned shipments.
create table if not exists public.lab_kit_shipments (
  id uuid not null default gen_random_uuid() primary key,
  lab_kit_id uuid null references public.lab_kits(id) on delete cascade,
  accession_number text null,
  subject_visit_id uuid null references public.subject_visits(id) on delete set null,
  airway_bill_number text not null,
  carrier text null default 'fedex' check (carrier in ('fedex','ups','other')),
  shipped_date date null,
  estimated_delivery date null,
  actual_delivery date null,
  tracking_status text null,
  ups_tracking_payload jsonb null,
  last_tracking_update timestamptz null,
  notes text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint shipments_kit_or_accession_chk check (
    lab_kit_id is not null or accession_number is not null
  )
);

create index if not exists idx_lab_kit_shipments_lab_kit_id on public.lab_kit_shipments(lab_kit_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'update_lab_kit_shipments_updated_at'
      and n.nspname = 'public'
      and c.relname = 'lab_kit_shipments'
  ) then
    create trigger update_lab_kit_shipments_updated_at
      before update on public.lab_kit_shipments
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

-- Bottle-level drug accountability records.
create table if not exists public.drug_compliance (
  id uuid not null default extensions.uuid_generate_v4() primary key,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_date date not null default current_date,
  dispensed_count integer not null,
  returned_count integer not null default 0,
  expected_taken numeric null,
  actual_taken integer generated always as ((dispensed_count - returned_count)) stored,
  compliance_percentage numeric generated always as (
    case
      when expected_taken > 0 then round(((dispensed_count - returned_count)::numeric / expected_taken) * 100, 1)
      else null::numeric
    end
  ) stored,
  is_compliant boolean generated always as (
    case
      when expected_taken > 0 then (((dispensed_count - returned_count)::numeric / expected_taken) * 100) >= 80
      else null::boolean
    end
  ) stored,
  visit_id uuid null references public.subject_visits(id) on delete cascade,
  dispensed_visit_id uuid null references public.subject_visits(id) on delete set null,
  return_visit_id uuid null references public.subject_visits(id) on delete set null,
  ip_id text not null,
  dispensing_date date null,
  ip_last_dose_date date null,
  notes text null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  constraint drug_compliance_subject_id_ip_id_key unique (subject_id, ip_id)
);

create index if not exists idx_drug_compliance_subject_id on public.drug_compliance(subject_id);
create index if not exists idx_drug_compliance_visit_id on public.drug_compliance(visit_id);
create index if not exists idx_drug_compliance_ip_id on public.drug_compliance(ip_id);
create index if not exists idx_drug_compliance_dispensed_visit on public.drug_compliance(dispensed_visit_id);
create index if not exists idx_drug_compliance_return_visit on public.drug_compliance(return_visit_id);
