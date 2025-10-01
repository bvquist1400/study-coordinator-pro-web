drop table if exists public.lab_kit_alert_dismissals cascade;

create table public.lab_kit_alert_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  study_id uuid not null references public.studies (id) on delete cascade,
  alert_id text not null,
  dismissed_at timestamp with time zone not null default now(),
  snooze_until timestamp with time zone,
  conditions jsonb not null,
  auto_restore_rule text,
  manually_restored boolean not null default false,
  restored_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_lab_kit_alert_dismissals_user_study on public.lab_kit_alert_dismissals using btree (user_id, study_id);
create index if not exists idx_lab_kit_alert_dismissals_alert on public.lab_kit_alert_dismissals using btree (alert_id);
create unique index if not exists idx_lab_kit_alert_dismissals_active
  on public.lab_kit_alert_dismissals (user_id, study_id, alert_id)
  where restored_at is null;

drop trigger if exists update_lab_kit_alert_dismissals_updated_at on public.lab_kit_alert_dismissals;
create trigger update_lab_kit_alert_dismissals_updated_at
before update on public.lab_kit_alert_dismissals
for each row execute procedure public.update_updated_at_column();
