-- Row Level Security configuration snapshot.
-- Mirrors the logic executed by migrations/20240902_rls_site_members.sql.

alter table if exists public.sites enable row level security;
alter table if exists public.site_members enable row level security;
alter table if exists public.studies enable row level security;
alter table if exists public.coordinator_metrics enable row level security;
alter table if exists public.study_coordinators enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_members'
      and policyname = 'site_members_select_for_members'
  ) then
    create policy site_members_select_for_members on public.site_members
      for select using (
        site_id in (
          select site_id from public.site_members sm2 where sm2.user_id = auth.uid()
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coordinator_metrics'
      and policyname = 'coordinator_metrics_service_role'
  ) then
    create policy coordinator_metrics_service_role on public.coordinator_metrics
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'study_coordinators'
      and policyname = 'study_coordinators_service_role'
  ) then
    create policy study_coordinators_service_role on public.study_coordinators
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_members'
      and policyname = 'site_members_insert_by_owner'
  ) then
    create policy site_members_insert_by_owner on public.site_members
      for insert with check (
        exists (
          select 1 from public.site_members owners
          where owners.site_id = site_members.site_id
            and owners.user_id = auth.uid()
            and owners.role = 'owner'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_members'
      and policyname = 'site_members_update_by_owner'
  ) then
    create policy site_members_update_by_owner on public.site_members
      for update using (
        exists (
          select 1 from public.site_members owners
          where owners.site_id = site_members.site_id
            and owners.user_id = auth.uid()
            and owners.role = 'owner'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_members'
      and policyname = 'site_members_delete_by_owner'
  ) then
    create policy site_members_delete_by_owner on public.site_members
      for delete using (
        exists (
          select 1 from public.site_members owners
          where owners.site_id = site_members.site_id
            and owners.user_id = auth.uid()
            and owners.role = 'owner'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sites'
      and policyname = 'sites_select_for_members'
  ) then
    create policy sites_select_for_members on public.sites
      for select using (
        id in (select site_id from public.site_members where user_id = auth.uid())
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'studies'
      and policyname = 'studies_select_for_members_or_owner'
  ) then
    create policy studies_select_for_members_or_owner on public.studies
      for select using (
        (site_id is not null and site_id in (select site_id from public.site_members where user_id = auth.uid()))
        or (site_id is null and user_id = auth.uid())
      );
  end if;
end;
$$;
