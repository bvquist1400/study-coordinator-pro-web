create table public.lab_kit_settings (
  id uuid not null default gen_random_uuid (),
  study_id uuid not null,
  kit_type_id uuid null,
  min_on_hand integer not null default 0,
  buffer_days integer not null default 0,
  lead_time_days integer not null default 0,
  auto_order_enabled boolean not null default false,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lab_kit_settings_pkey primary key (id),
  constraint lab_kit_settings_study_id_fkey foreign key (study_id) references studies (id) on delete cascade,
  constraint lab_kit_settings_kit_type_id_fkey foreign key (kit_type_id) references study_kit_types (id) on delete set null,
  constraint lab_kit_settings_updated_by_fkey foreign key (updated_by) references auth.users (id) on delete set null,
  constraint lab_kit_settings_min_on_hand_check check (min_on_hand >= 0),
  constraint lab_kit_settings_buffer_days_check check (buffer_days >= 0),
  constraint lab_kit_settings_lead_time_days_check check (lead_time_days >= 0)
) tablespace pg_default;

create unique index if not exists idx_lab_kit_settings_study_default
  on public.lab_kit_settings using btree (study_id)
  where kit_type_id is null tablespace pg_default;

create unique index if not exists idx_lab_kit_settings_study_kit
  on public.lab_kit_settings using btree (study_id, kit_type_id)
  where kit_type_id is not null tablespace pg_default;

create index if not exists idx_lab_kit_settings_kit_type_id
  on public.lab_kit_settings using btree (kit_type_id)
  where kit_type_id is not null tablespace pg_default;

create trigger update_lab_kit_settings_updated_at before
update on lab_kit_settings for each row
execute function update_updated_at_column ();
