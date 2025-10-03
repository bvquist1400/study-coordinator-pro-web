alter table public.studies
  add column if not exists delivery_days_default integer not null default 5
    check (delivery_days_default >= 0 and delivery_days_default <= 120);

alter table public.study_kit_types
  add column if not exists delivery_days integer null
    check (delivery_days >= 0 and delivery_days <= 120);
