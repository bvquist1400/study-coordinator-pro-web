create table public.sites (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint sites_pkey primary key (id)
) TABLESPACE pg_default;