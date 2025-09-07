create table public.drug_compliance (
  id uuid not null default extensions.uuid_generate_v4 (),
  subject_id uuid not null,
  user_id uuid not null,
  assessment_date date not null default CURRENT_DATE,
  dispensed_count integer not null,
  returned_count integer not null default 0,
  expected_taken numeric null,
  actual_taken integer GENERATED ALWAYS as ((dispensed_count - returned_count)) STORED null,
  compliance_percentage numeric GENERATED ALWAYS as (
    case
      when (expected_taken > (0)::numeric) then round(
        (
          (
            ((dispensed_count - returned_count))::numeric / expected_taken
          ) * (100)::numeric
        ),
        1
      )
      else null::numeric
    end
  ) STORED null,
  is_compliant boolean GENERATED ALWAYS as (
    case
      when (expected_taken > (0)::numeric) then (
        (
          (
            ((dispensed_count - returned_count))::numeric / expected_taken
          ) * (100)::numeric
        ) >= (80)::numeric
      )
      else null::boolean
    end
  ) STORED null,
  visit_id uuid null,
  dispensed_visit_id uuid null,
  return_visit_id uuid null,
  ip_id text not null,
  dispensing_date date null,
  ip_last_dose_date date null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint drug_compliance_pkey primary key (id),
  constraint drug_compliance_subject_id_ip_id_key unique (subject_id, ip_id),
  constraint drug_compliance_subject_id_fkey foreign KEY (subject_id) references subjects (id) on delete CASCADE,
  constraint drug_compliance_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint drug_compliance_visit_id_fkey foreign KEY (visit_id) references subject_visits (id) on delete CASCADE,
  constraint drug_compliance_dispensed_visit_id_fkey foreign KEY (dispensed_visit_id) references subject_visits (id) on delete set null,
  constraint drug_compliance_return_visit_id_fkey foreign KEY (return_visit_id) references subject_visits (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_drug_compliance_subject_id on public.drug_compliance using btree (subject_id) TABLESPACE pg_default;

create index IF not exists idx_drug_compliance_visit_id on public.drug_compliance using btree (visit_id) TABLESPACE pg_default;

create index IF not exists idx_drug_compliance_ip_id on public.drug_compliance using btree (ip_id) TABLESPACE pg_default;

create index IF not exists idx_drug_compliance_dispensed_visit on public.drug_compliance using btree (dispensed_visit_id) TABLESPACE pg_default;

create index IF not exists idx_drug_compliance_return_visit on public.drug_compliance using btree (return_visit_id) TABLESPACE pg_default;

create trigger fix_expected_taken BEFORE INSERT
or
update on drug_compliance for EACH row
execute FUNCTION calculate_expected_taken ();
