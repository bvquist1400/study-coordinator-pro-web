-- Migration: add atomic IP save RPC and expected_taken trigger function

-- Trigger function for expected_taken
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

-- RPC to save IP dispenses/returns in one transaction
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
        expected_taken, visit_id, ip_id, dispensing_date, ip_last_dose_date, notes, created_at, updated_at
      ) values (
        p_subject_id, p_user_id, rec_d.start_date, rec_d.count, 0,
        null, p_visit_id, trim(rec_d.ip_id), rec_d.start_date, null, null, now(), now()
      )
      on conflict (subject_id, ip_id) do update
      set dispensed_count  = excluded.dispensed_count,
          visit_id         = excluded.visit_id,
          user_id          = excluded.user_id,
          assessment_date  = excluded.assessment_date,
          dispensing_date  = excluded.dispensing_date,
          updated_at       = now();
    end loop;
  end if;

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
          expected_taken, visit_id, ip_id, dispensing_date, ip_last_dose_date, notes, created_at, updated_at
        ) values (
          p_subject_id, p_user_id, rec_r.last_dose_date, 0, rec_r.count,
          null, p_visit_id, trim(rec_r.ip_id), null, rec_r.last_dose_date, null, now(), now()
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
            expected_taken    = null,
            visit_id          = p_visit_id,
            updated_at        = now()
        where id = v_existing_id;
      end if;
    end loop;
  end if;
end;
$$;
