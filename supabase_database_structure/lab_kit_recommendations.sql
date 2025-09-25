create table public.lab_kit_recommendations (
  id uuid not null default gen_random_uuid (),
  study_id uuid not null,
  kit_type_id uuid null,
  status text not null default 'new'::text,
  recommended_quantity integer not null,
  reason text not null,
  window_start date null,
  window_end date null,
  latest_order_date date null,
  confidence numeric null,
  metadata jsonb not null default '{}'::jsonb,
  dismissed_reason text null,
  acted_by uuid null,
  acted_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lab_kit_recommendations_pkey primary key (id),
  constraint lab_kit_recommendations_study_id_fkey foreign key (study_id) references studies (id) on delete cascade,
  constraint lab_kit_recommendations_kit_type_id_fkey foreign key (kit_type_id) references study_kit_types (id) on delete set null,
  constraint lab_kit_recommendations_acted_by_fkey foreign key (acted_by) references auth.users (id) on delete set null,
  constraint lab_kit_recommendations_status_check check (
    status = any (
      array['new'::text, 'accepted'::text, 'dismissed'::text, 'expired'::text]
    )
  ),
  constraint lab_kit_recommendations_quantity_check check (recommended_quantity > 0),
  constraint lab_kit_recommendations_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
) tablespace pg_default;

create index if not exists idx_lab_kit_recommendations_study_id
  on public.lab_kit_recommendations using btree (study_id) tablespace pg_default;

create index if not exists idx_lab_kit_recommendations_kit_type_id
  on public.lab_kit_recommendations using btree (kit_type_id)
  where kit_type_id is not null tablespace pg_default;

create index if not exists idx_lab_kit_recommendations_status
  on public.lab_kit_recommendations using btree (status) tablespace pg_default;

create trigger update_lab_kit_recommendations_updated_at before
update on lab_kit_recommendations for each row
execute function update_updated_at_column ();
