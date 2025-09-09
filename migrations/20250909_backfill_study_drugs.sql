-- Backfill a default per-study drug for studies with no configured drugs

-- Ensure table exists (no-op if created earlier)
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

-- Insert a single default drug for any study lacking entries
insert into public.study_drugs (study_id, code, name, dosing_frequency, dose_per_day, notes)
select 
  s.id,
  'DRUG1' as code,
  coalesce(s.protocol_number, 'Drug 1') as name,
  coalesce(s.dosing_frequency, 'QD') as dosing_frequency,
  case coalesce(s.dosing_frequency, 'QD')
    when 'QD' then 1
    when 'BID' then 2
    when 'TID' then 3
    when 'QID' then 4
    when 'weekly' then 1.0/7.0
    else null
  end as dose_per_day,
  'Backfilled default per-study drug' as notes
from public.studies s
where not exists (
  select 1 from public.study_drugs sd where sd.study_id = s.id
);

