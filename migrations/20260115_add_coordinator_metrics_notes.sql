-- Coordinator metrics per-study breakdown storage and saver routine

create table if not exists public.coordinator_metrics_notes (
  id uuid primary key default gen_random_uuid(),
  coordinator_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid not null references public.studies(id) on delete cascade,
  week_start date not null,
  meeting_hours numeric(6,2) not null default 0,
  screening_hours numeric(6,2) not null default 0,
  query_hours numeric(6,2) not null default 0,
  notes text null,
  recorded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coordinator_metrics_notes_unique unique (coordinator_id, study_id, week_start)
);

create index if not exists idx_coordinator_metrics_notes_coordinator_week
  on public.coordinator_metrics_notes (coordinator_id, week_start);

create index if not exists idx_coordinator_metrics_notes_study
  on public.coordinator_metrics_notes (study_id);

drop trigger if exists trg_coordinator_metrics_notes_updated_at on public.coordinator_metrics_notes;
create trigger trg_coordinator_metrics_notes_updated_at
before update on public.coordinator_metrics_notes
for each row execute function public.update_updated_at_column();

alter table public.coordinator_metrics_notes enable row level security;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coordinator_metrics_notes'
      and policyname = 'coordinator_metrics_notes_service_role'
  ) then
    create policy coordinator_metrics_notes_service_role on public.coordinator_metrics_notes
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end;
$policy$;

create or replace function public.save_coordinator_metrics_with_breakdown(
  p_coordinator_id uuid,
  p_recorded_by uuid,
  p_week_start date,
  p_meeting_hours numeric,
  p_screening_hours numeric,
  p_screening_study_count integer,
  p_query_hours numeric,
  p_query_study_count integer,
  p_notes text,
  p_breakdown jsonb default '[]'::jsonb
) returns public.coordinator_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metric public.coordinator_metrics%rowtype;
  rec jsonb;
  l_notes text;
begin
  insert into public.coordinator_metrics (
    coordinator_id,
    recorded_by,
    week_start,
    meeting_hours,
    screening_hours,
    screening_study_count,
    query_hours,
    query_study_count,
    notes
  )
  values (
    p_coordinator_id,
    p_recorded_by,
    p_week_start,
    coalesce(p_meeting_hours, 0),
    coalesce(p_screening_hours, 0),
    coalesce(p_screening_study_count, 0),
    coalesce(p_query_hours, 0),
    coalesce(p_query_study_count, 0),
    p_notes
  )
  on conflict (coordinator_id, week_start) do update
  set
    recorded_by = excluded.recorded_by,
    meeting_hours = excluded.meeting_hours,
    screening_hours = excluded.screening_hours,
    screening_study_count = excluded.screening_study_count,
    query_hours = excluded.query_hours,
    query_study_count = excluded.query_study_count,
    notes = excluded.notes,
    updated_at = now()
  returning * into v_metric;

  delete from public.coordinator_metrics_notes
  where coordinator_id = p_coordinator_id
    and week_start = p_week_start;

  for rec in
    select value
    from jsonb_array_elements(coalesce(p_breakdown, '[]'::jsonb)) as t(value)
  loop
    continue when rec->>'studyId' is null;

    l_notes := nullif(btrim(coalesce(rec->>'notes', '')), '');

    if coalesce((rec->>'meetingHours')::numeric, 0) = 0
       and coalesce((rec->>'screeningHours')::numeric, 0) = 0
       and coalesce((rec->>'queryHours')::numeric, 0) = 0
       and l_notes is null then
      continue;
    end if;

    insert into public.coordinator_metrics_notes (
      coordinator_id,
      recorded_by,
      study_id,
      week_start,
      meeting_hours,
      screening_hours,
      query_hours,
      notes
    )
    values (
      p_coordinator_id,
      p_recorded_by,
      (rec->>'studyId')::uuid,
      p_week_start,
      coalesce((rec->>'meetingHours')::numeric, 0),
      coalesce((rec->>'screeningHours')::numeric, 0),
      coalesce((rec->>'queryHours')::numeric, 0),
      l_notes
    )
    on conflict (coordinator_id, study_id, week_start) do update
    set
      recorded_by = excluded.recorded_by,
      meeting_hours = excluded.meeting_hours,
      screening_hours = excluded.screening_hours,
      query_hours = excluded.query_hours,
      notes = excluded.notes,
      updated_at = now();
  end loop;

  return v_metric;
end;
$$;
