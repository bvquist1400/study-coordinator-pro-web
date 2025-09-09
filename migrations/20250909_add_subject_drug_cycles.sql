-- Aggregated per-drug compliance model (no required bottle IDs)

-- Ensure study_drugs exists (some environments may not have run prior migration)
create table if not exists public.study_drugs (
    id uuid default extensions.uuid_generate_v4() primary key,
    study_id uuid references public.studies(id) on delete cascade not null,
    code text not null,
    name text not null,
    dosing_frequency text not null check (dosing_frequency in ('QD','BID','TID','QID','weekly','custom')),
    dose_per_day numeric,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (study_id, code)
);

create index if not exists idx_study_drugs_study_code on public.study_drugs(study_id, code);

-- subject_drug_cycles: one row per subject + visit (optional) + drug
create table if not exists public.subject_drug_cycles (
  id uuid primary key default extensions.uuid_generate_v4(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  visit_id uuid null references public.subject_visits(id) on delete set null,
  drug_id uuid not null references public.study_drugs(id) on delete restrict,

  dispensing_date date null,
  last_dose_date date null,

  tablets_dispensed integer not null default 0,
  tablets_returned integer not null default 0,

  expected_taken numeric null,
  actual_taken integer generated always as ((tablets_dispensed - tablets_returned)) stored,
  compliance_percentage numeric generated always as (
    case
      when (expected_taken > (0)::numeric) then round(
        (
          (
            ((tablets_dispensed - tablets_returned))::numeric / expected_taken
          ) * (100)::numeric
        ),
        1
      )
      else null::numeric
    end
  ) stored,
  is_compliant boolean generated always as (
    case
      when (expected_taken > (0)::numeric) then (
        (
          (
            ((tablets_dispensed - tablets_returned))::numeric / expected_taken
          ) * (100)::numeric
        ) >= (80)::numeric
      )
      else null::boolean
    end
  ) stored,

  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_subject_visit_drug unique (subject_id, visit_id, drug_id)
);

create index if not exists idx_subject_drug_cycles_subject on public.subject_drug_cycles(subject_id);
create index if not exists idx_subject_drug_cycles_visit on public.subject_drug_cycles(visit_id);
create index if not exists idx_subject_drug_cycles_drug on public.subject_drug_cycles(drug_id);

-- Adjustments table to support unscheduled returns and corrections
create table if not exists public.drug_cycle_adjustments (
  id uuid primary key default extensions.uuid_generate_v4(),
  cycle_id uuid not null references public.subject_drug_cycles(id) on delete cascade,
  event_type text not null check (event_type in ('dispense','return','correction')),
  delta_tablets integer not null,
  event_date date not null,
  reason text null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_drug_cycle_adjustments_cycle on public.drug_cycle_adjustments(cycle_id);
create index if not exists idx_drug_cycle_adjustments_event_date on public.drug_cycle_adjustments(event_date);

-- Trigger to compute expected_taken for subject_drug_cycles using study_drugs dose_per_day/frequency
create or replace function public.calculate_expected_taken_cycle()
returns trigger
language plpgsql
as $$
declare
  l_dose_per_day numeric := 1;
  l_freq text;
  l_dose_override numeric;
begin
  -- Prefer explicit dose_per_day on study_drugs; fallback to dosing_frequency mapping
  select sd.dose_per_day, sd.dosing_frequency
    into l_dose_override, l_freq
  from public.study_drugs sd
  where sd.id = new.drug_id;

  if l_dose_override is not null then
    l_dose_per_day := l_dose_override;
  elsif l_freq is not null then
    l_dose_per_day := case l_freq
      when 'QD' then 1
      when 'BID' then 2
      when 'TID' then 3
      when 'QID' then 4
      when 'weekly' then 1.0/7.0
      else 1
    end;
  end if;

  if new.dispensing_date is not null and new.last_dose_date is not null then
    -- Inclusive days: (last - first + 1)
    new.expected_taken := greatest(0, (new.last_dose_date - new.dispensing_date + 1)) * l_dose_per_day;
  else
    new.expected_taken := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_calc_expected_taken_cycle on public.subject_drug_cycles;
create trigger trg_calc_expected_taken_cycle
before insert or update on public.subject_drug_cycles
for each row execute function public.calculate_expected_taken_cycle();

-- Optional view to align with analytics expectations (subject-level per drug per visit)
create or replace view public.v_subject_drug_compliance as
select 
  c.id,
  c.subject_id,
  c.visit_id,
  c.drug_id,
  c.dispensing_date,
  c.last_dose_date as ip_last_dose_date,
  c.tablets_dispensed as dispensed_count,
  c.tablets_returned as returned_count,
  c.expected_taken,
  c.actual_taken,
  c.compliance_percentage,
  c.is_compliant,
  c.created_at,
  c.updated_at
from public.subject_drug_cycles c;
