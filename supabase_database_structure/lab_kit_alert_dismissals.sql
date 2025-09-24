create table lab_kit_alert_dismissals (
  id uuid not null default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  study_id uuid not null references studies (id) on delete cascade,
  alert_hash text not null,
  dismissed_at timestamp with time zone not null default timezone('utc', now()),
  expires_at timestamp with time zone not null default timezone('utc', now()) + interval '30 days',
  metadata jsonb not null default '{}'::jsonb
);

create unique index lab_kit_alert_dismissals_user_study_hash_idx on lab_kit_alert_dismissals using btree (user_id, study_id, alert_hash);

create index lab_kit_alert_dismissals_expires_at_idx on lab_kit_alert_dismissals using btree (expires_at);

alter table lab_kit_alert_dismissals enable row level security;

create policy "Users manage their lab kit alert dismissals"
  on lab_kit_alert_dismissals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
