create table public.lab_kit_settings_history (
  id uuid not null default gen_random_uuid (),
  settings_id uuid null,
  study_id uuid not null,
  kit_type_id uuid null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  changed_by uuid null,
  created_at timestamp with time zone not null default now(),
  constraint lab_kit_settings_history_pkey primary key (id),
  constraint lab_kit_settings_history_settings_id_fkey foreign key (settings_id) references lab_kit_settings (id) on delete set null,
  constraint lab_kit_settings_history_study_id_fkey foreign key (study_id) references studies (id) on delete cascade,
  constraint lab_kit_settings_history_kit_type_id_fkey foreign key (kit_type_id) references study_kit_types (id) on delete set null,
  constraint lab_kit_settings_history_changed_by_fkey foreign key (changed_by) references auth.users (id) on delete set null,
  constraint lab_kit_settings_history_action_check check (
    action = any (
      array['create'::text, 'update'::text, 'delete'::text]
    )
  )
) tablespace pg_default;

create index if not exists idx_lab_kit_settings_history_settings_id
  on public.lab_kit_settings_history using btree (settings_id) tablespace pg_default;

create index if not exists idx_lab_kit_settings_history_study_id
  on public.lab_kit_settings_history using btree (study_id) tablespace pg_default;
