create table public.site_members (
  site_id uuid not null,
  user_id uuid not null,
  role text not null default 'owner'::text,
  created_at timestamp with time zone not null default now(),
  constraint site_members_pkey primary key (site_id, user_id),
  constraint site_members_site_id_fkey foreign KEY (site_id) references sites (id) on delete CASCADE,
  constraint site_members_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint site_members_role_check check (
    (
      role = any (
        array[
          'owner'::text,
          'coordinator'::text,
          'pi'::text,
          'monitor'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;