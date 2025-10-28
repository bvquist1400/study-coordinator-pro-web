-- CWE automation event notifications

do $notify$
begin
  create extension if not exists "uuid-ossp";
end;
$notify$;

-- Shared notifier function emits compact JSON payloads for CWE consumers
create or replace function emit_cwe_event() returns trigger as $$
declare
  record_data jsonb;
  payload jsonb;
begin
  if tg_op = 'DELETE' then
    record_data := to_jsonb(old);
  else
    record_data := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' and record_data = to_jsonb(old) then
    return new;
  end if;

  payload := jsonb_build_object(
    'table', tg_table_name,
    'event', tg_op,
    'emitted_at', (now())::text,
    'id', record_data -> 'id'
  );

  if record_data ? 'study_id' then
    payload := payload || jsonb_build_object('study_id', record_data -> 'study_id');
  end if;

  if record_data ? 'coordinator_id' then
    payload := payload || jsonb_build_object('coordinator_id', record_data -> 'coordinator_id');
  end if;

  if record_data ? 'week_start' then
    payload := payload || jsonb_build_object('week_start', record_data -> 'week_start');
  end if;

  perform pg_notify('cwe_events', payload::text);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

-- subject_visits
drop trigger if exists trg_cwe_subject_visits_event on subject_visits;
create trigger trg_cwe_subject_visits_event
after insert or update or delete on subject_visits
for each row execute function emit_cwe_event();

-- coordinator_metrics
drop trigger if exists trg_cwe_coordinator_metrics_event on coordinator_metrics;
create trigger trg_cwe_coordinator_metrics_event
after insert or update or delete on coordinator_metrics
for each row execute function emit_cwe_event();

-- study_coordinators
drop trigger if exists trg_cwe_study_coordinators_event on study_coordinators;
create trigger trg_cwe_study_coordinators_event
after insert or update or delete on study_coordinators
for each row execute function emit_cwe_event();
