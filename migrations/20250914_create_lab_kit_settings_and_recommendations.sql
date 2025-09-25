-- Adds configurable lab kit settings, change history, and recommendation tracking.

alter table public.studies
  add column if not exists inventory_buffer_kits integer not null default 0;

create table if not exists public.lab_kit_settings (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies (id) on delete cascade,
  kit_type_id uuid references public.study_kit_types (id) on delete set null,
  min_on_hand integer not null default 0 check (min_on_hand >= 0),
  buffer_days integer not null default 0 check (buffer_days >= 0),
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  auto_order_enabled boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists idx_lab_kit_settings_study_default
  on public.lab_kit_settings (study_id)
  where kit_type_id is null;

create unique index if not exists idx_lab_kit_settings_study_kit
  on public.lab_kit_settings (study_id, kit_type_id)
  where kit_type_id is not null;

create index if not exists idx_lab_kit_settings_kit_type_id
  on public.lab_kit_settings (kit_type_id)
  where kit_type_id is not null;

drop trigger if exists update_lab_kit_settings_updated_at on public.lab_kit_settings;

create trigger update_lab_kit_settings_updated_at
  before update on public.lab_kit_settings
  for each row execute procedure public.update_updated_at_column();

create table if not exists public.lab_kit_settings_history (
  id uuid primary key default gen_random_uuid(),
  settings_id uuid references public.lab_kit_settings (id) on delete set null,
  study_id uuid not null references public.studies (id) on delete cascade,
  kit_type_id uuid references public.study_kit_types (id) on delete set null,
  action text not null check (action = any (array['create', 'update', 'delete'])),
  changes jsonb not null default '{}'::jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_lab_kit_settings_history_settings_id
  on public.lab_kit_settings_history (settings_id);

create index if not exists idx_lab_kit_settings_history_study_id
  on public.lab_kit_settings_history (study_id);

create table if not exists public.lab_kit_recommendations (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies (id) on delete cascade,
  kit_type_id uuid references public.study_kit_types (id) on delete set null,
  status text not null default 'new' check (status = any (array['new', 'accepted', 'dismissed', 'expired'])),
  recommended_quantity integer not null check (recommended_quantity > 0),
  reason text not null,
  window_start date,
  window_end date,
  latest_order_date date,
  confidence numeric,
  metadata jsonb not null default '{}'::jsonb,
  dismissed_reason text,
  acted_by uuid references auth.users (id) on delete set null,
  acted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.lab_kit_recommendations
  add constraint lab_kit_recommendations_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

create index if not exists idx_lab_kit_recommendations_study_id
  on public.lab_kit_recommendations (study_id);

create index if not exists idx_lab_kit_recommendations_kit_type_id
  on public.lab_kit_recommendations (kit_type_id)
  where kit_type_id is not null;

create index if not exists idx_lab_kit_recommendations_status
  on public.lab_kit_recommendations (status);

drop trigger if exists update_lab_kit_recommendations_updated_at on public.lab_kit_recommendations;

create trigger update_lab_kit_recommendations_updated_at
  before update on public.lab_kit_recommendations
  for each row execute procedure public.update_updated_at_column();
