-- Adds/ensures expected_taken trigger, visit linkage columns, indexes,
-- and updates the atomic RPC for multi-bottle dispense/return pairing.

-- 1) Trigger function to compute expected_taken (inclusive days × dose_per_day)
create or replace function public.calculate_expected_taken()
returns trigger
language plpgsql
as $$
declare
  l_dose_per_day numeric := 1;
  l_freq text;
begin
  if new.visit_id is not null then
    select s.dosing_frequency
      into l_freq
    from subject_visits v
    join studies s on s.id = v.study_id
    where v.id = new.visit_id;

    if l_freq is not null then
      l_dose_per_day := case l_freq
        when 'QD' then 1
        when 'BID' then 2
        when 'TID' then 3
        when 'QID' then 4
        when 'weekly' then 1.0/7.0
        else 1
      end;
    end if;
  end if;

  if new.dispensing_date is not null and new.ip_last_dose_date is not null then
    new.expected_taken := greatest(0, (new.ip_last_dose_date - new.dispensing_date + 1)) * l_dose_per_day;
  else
    new.expected_taken := null;
  end if;
  return new;
end;
$$;

-- 5) Backfill linkage columns for existing data (best-effort, idempotent)
do $$
declare
  r record;
begin
  -- Backfill dispensed_visit_id by exact date match to subject_visits.visit_date
  update public.drug_compliance dc
  set dispensed_visit_id = sv.id
  from public.subject_visits sv
  where dc.dispensed_visit_id is null
    and dc.dispensing_date is not null
    and sv.subject_id = dc.subject_id
    and sv.visit_date = dc.dispensing_date;

  -- Backfill return_visit_id from existing visit_id where returns already posted
  update public.drug_compliance dc
  set return_visit_id = dc.visit_id
  where dc.return_visit_id is null
    and dc.visit_id is not null
    and coalesce(dc.returned_count, 0) > 0;

  -- Fallback: set return_visit_id by exact date match to ip_last_dose_date
  update public.drug_compliance dc
  set return_visit_id = sv2.id
  from public.subject_visits sv2
  where dc.return_visit_id is null
    and dc.ip_last_dose_date is not null
    and sv2.subject_id = dc.subject_id
    and sv2.visit_date = dc.ip_last_dose_date;
end $$;

-- 2) Ensure the trigger is present (drop+create to avoid duplicates)
do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'trg_calculate_expected_taken'
      and n.nspname = 'public'
      and c.relname = 'drug_compliance'
  ) then
    execute 'drop trigger trg_calculate_expected_taken on public.drug_compliance';
  end if;

  execute 'create trigger trg_calculate_expected_taken
           before insert or update on public.drug_compliance
           for each row execute function public.calculate_expected_taken()';
end $$;

-- 3) Add visit linkage columns for pairing bottles between visits (+ indexes)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='drug_compliance' and column_name='dispensed_visit_id'
  ) then
    alter table public.drug_compliance
      add column dispensed_visit_id uuid references public.subject_visits(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='drug_compliance' and column_name='return_visit_id'
  ) then
    alter table public.drug_compliance
      add column return_visit_id uuid references public.subject_visits(id) on delete set null;
  end if;

  create index if not exists idx_drug_compliance_dispensed_visit on public.drug_compliance(dispensed_visit_id);
  create index if not exists idx_drug_compliance_return_visit on public.drug_compliance(return_visit_id);
end $$;

-- 4) Atomic RPC to save multi-bottle dispenses/returns in one transaction
-- Expects arrays of rows with keys:
--   dispensed:  [{ ip_id, count, start_date }]
--   returned:   [{ ip_id, count, last_dose_date }]
create or replace function public.save_visit_ip_batch(
  p_subject_id uuid,
  p_user_id uuid,
  p_visit_id uuid,
  p_dispensed jsonb,
  p_returned jsonb
) returns void
language plpgsql
as $$
declare
  rec_d record;
  rec_r record;
  v_existing_id uuid;
  v_existing_dispensed integer;
  v_dispensing_date date;
begin
  -- Dispensed bottles
  if p_dispensed is not null then
    for rec_d in (
      select * from jsonb_to_recordset(p_dispensed)
      as x(ip_id text, count integer, start_date date)
    ) loop
      if rec_d.ip_id is null or rec_d.count is null or rec_d.start_date is null then
        raise exception 'Invalid dispensed row: %', rec_d;
      end if;
      if rec_d.count < 0 then
        raise exception 'Negative dispensed count for %', rec_d.ip_id;
      end if;

      insert into public.drug_compliance (
        subject_id, user_id, assessment_date, dispensed_count, returned_count,
        expected_taken, visit_id, ip_id, dispensing_date, ip_last_dose_date, notes,
        dispensed_visit_id, created_at, updated_at
      ) values (
        p_subject_id, p_user_id, rec_d.start_date, rec_d.count, 0,
        null, p_visit_id, trim(rec_d.ip_id), rec_d.start_date, null, null,
        p_visit_id, now(), now()
      )
      on conflict (subject_id, ip_id) do update
      set dispensed_count     = excluded.dispensed_count,
          visit_id            = excluded.visit_id,
          user_id             = excluded.user_id,
          assessment_date     = excluded.assessment_date,
          dispensing_date     = excluded.dispensing_date,
          dispensed_visit_id  = excluded.dispensed_visit_id,
          updated_at          = now();
    end loop;
  end if;

  -- Returned bottles
  if p_returned is not null then
    for rec_r in (
      select * from jsonb_to_recordset(p_returned)
      as x(ip_id text, count integer, last_dose_date date)
    ) loop
      if rec_r.ip_id is null or rec_r.count is null or rec_r.last_dose_date is null then
        raise exception 'Invalid returned row: %', rec_r;
      end if;
      if rec_r.count < 0 then
        raise exception 'Negative returned count for %', rec_r.ip_id;
      end if;

      select id, dispensed_count, dispensing_date
        into v_existing_id, v_existing_dispensed, v_dispensing_date
      from public.drug_compliance
      where subject_id = p_subject_id and ip_id = trim(rec_r.ip_id)
      order by dispensing_date desc nulls last
      limit 1;

      if v_existing_id is null then
        insert into public.drug_compliance (
          subject_id, user_id, assessment_date, dispensed_count, returned_count,
          expected_taken, visit_id, ip_id, dispensing_date, ip_last_dose_date, notes,
          return_visit_id, created_at, updated_at
        ) values (
          p_subject_id, p_user_id, rec_r.last_dose_date, 0, rec_r.count,
          null, p_visit_id, trim(rec_r.ip_id), null, rec_r.last_dose_date, null,
          p_visit_id, now(), now()
        );
      else
        if rec_r.count > coalesce(v_existing_dispensed, 0) then
          raise exception 'Returned count % exceeds dispensed % for bottle %', rec_r.count, v_existing_dispensed, rec_r.ip_id;
        end if;
        if v_dispensing_date is not null and rec_r.last_dose_date < v_dispensing_date then
          raise exception 'Last dose date % before dispensing date % for bottle %', rec_r.last_dose_date, v_dispensing_date, rec_r.ip_id;
        end if;

        update public.drug_compliance
        set returned_count    = rec_r.count,
            assessment_date   = rec_r.last_dose_date,
            ip_last_dose_date = rec_r.last_dose_date,
            expected_taken    = null,          -- trigger recalculates
            visit_id          = p_visit_id,
            return_visit_id   = p_visit_id,
            updated_at        = now()
        where id = v_existing_id;
      end if;
    end loop;
  end if;
end;
$$;
