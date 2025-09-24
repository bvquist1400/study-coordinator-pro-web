-- Creates table for persisting lab kit alert dismissals per user/study
create table if not exists lab_kit_alert_dismissals (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  study_id uuid not null references studies (id) on delete cascade,
  alert_hash text not null,
  dismissed_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 days',
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists lab_kit_alert_dismissals_user_study_hash_idx
  on lab_kit_alert_dismissals (user_id, study_id, alert_hash);

create index if not exists lab_kit_alert_dismissals_expires_at_idx
  on lab_kit_alert_dismissals (expires_at);

alter table lab_kit_alert_dismissals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = current_schema()
      and tablename = 'lab_kit_alert_dismissals'
      and policyname = 'Users manage their lab kit alert dismissals'
  ) then
    create policy "Users manage their lab kit alert dismissals"
      on lab_kit_alert_dismissals
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
