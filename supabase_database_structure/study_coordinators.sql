create table public.study_coordinators (
  id uuid not null default gen_random_uuid(),
  study_id uuid not null,
  coordinator_id uuid not null,
  role text null,
  joined_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint study_coordinators_pkey primary key (id),
  constraint study_coordinators_unique unique (study_id, coordinator_id),
  constraint study_coordinators_study_id_fkey foreign key (study_id) references studies (id) on delete cascade,
  constraint study_coordinators_coordinator_id_fkey foreign key (coordinator_id) references auth.users (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_study_coordinators_study_id
  on public.study_coordinators using btree (study_id) tablespace pg_default;

create index if not exists idx_study_coordinators_coordinator_id
  on public.study_coordinators using btree (coordinator_id) tablespace pg_default;

create trigger update_study_coordinators_updated_at before
update on study_coordinators for each row
execute function update_updated_at_column ();
