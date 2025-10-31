-- Visit schedule coordinator assignments

create table if not exists visit_schedule_coordinators (
  id uuid primary key default gen_random_uuid(),
  visit_schedule_id uuid not null references visit_schedules(id) on delete cascade,
  coordinator_id uuid not null references auth.users(id) on delete cascade,
  role text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_schedule_coordinators_unique unique (visit_schedule_id, coordinator_id)
);

create index if not exists idx_visit_schedule_coordinators_visit_id
  on visit_schedule_coordinators (visit_schedule_id);

create index if not exists idx_visit_schedule_coordinators_coordinator_id
  on visit_schedule_coordinators (coordinator_id);

drop trigger if exists update_visit_schedule_coordinators_updated_at on visit_schedule_coordinators;

create trigger update_visit_schedule_coordinators_updated_at
before update on visit_schedule_coordinators
for each row
execute function update_updated_at_column();

alter table visit_schedule_coordinators enable row level security;
