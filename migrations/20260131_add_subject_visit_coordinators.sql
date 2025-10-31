-- Subject visit coordinator assignments

create table if not exists subject_visit_coordinators (
  id uuid primary key default gen_random_uuid(),
  subject_visit_id uuid not null references subject_visits(id) on delete cascade,
  coordinator_id uuid not null references auth.users(id) on delete cascade,
  role text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_by uuid null references auth.users(id) on delete set null,
  constraint subject_visit_coordinators_unique unique (subject_visit_id, coordinator_id)
);

create index if not exists idx_subject_visit_coordinators_visit
  on subject_visit_coordinators (subject_visit_id);

create index if not exists idx_subject_visit_coordinators_coordinator
  on subject_visit_coordinators (coordinator_id);

create index if not exists idx_subject_visit_coordinators_assigned_by
  on subject_visit_coordinators (assigned_by);

comment on table subject_visit_coordinators is 'Tracks coordinator assignments for individual subject visits';
comment on column subject_visit_coordinators.role is 'Optional role or note about the coordinator assignment';

-- Maintain updated_at
create trigger trg_subject_visit_coordinators_updated
before update on subject_visit_coordinators
for each row execute function update_updated_at_column();

alter table subject_visit_coordinators enable row level security;
