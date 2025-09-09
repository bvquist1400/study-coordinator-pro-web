create table public.subject_drug_cycles (
  id uuid not null default extensions.uuid_generate_v4(),
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
  constraint subject_drug_cycles_pkey primary key (id),
  constraint uq_subject_visit_drug unique (subject_id, visit_id, drug_id)
) tablespace pg_default;

create index if not exists idx_subject_drug_cycles_subject on public.subject_drug_cycles using btree (subject_id) tablespace pg_default;
create index if not exists idx_subject_drug_cycles_visit on public.subject_drug_cycles using btree (visit_id) tablespace pg_default;
create index if not exists idx_subject_drug_cycles_drug on public.subject_drug_cycles using btree (drug_id) tablespace pg_default;

create trigger trg_calc_expected_taken_cycle before insert or update on public.subject_drug_cycles for each row execute function public.calculate_expected_taken_cycle();

