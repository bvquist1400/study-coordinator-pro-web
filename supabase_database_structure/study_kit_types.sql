create table public.study_kit_types (
  id uuid not null default extensions.uuid_generate_v4(),
  study_id uuid not null references public.studies (id) on delete cascade,
  name text not null,
  description text null,
  buffer_days integer null,
  buffer_count integer null,
  delivery_days integer null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint study_kit_types_buffer_days_check check (
    buffer_days is null or (buffer_days >= 0 and buffer_days <= 120)
  ),
  constraint study_kit_types_buffer_count_check check (
    buffer_count is null or (buffer_count >= 0 and buffer_count <= 999)
  ),
  constraint study_kit_types_delivery_days_check check (
    delivery_days is null or (delivery_days >= 0 and delivery_days <= 120)
  ),
  constraint study_kit_types_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_study_kit_types_study_id on public.study_kit_types using btree (study_id) tablespace pg_default;
create unique index if not exists idx_study_kit_types_unique_name on public.study_kit_types (study_id, lower(name));
