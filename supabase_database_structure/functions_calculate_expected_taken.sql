-- Trigger function to compute expected_taken using inclusive days and per-study dosing
-- Assumes single-drug QD by default; looks up study.dosing_frequency when visit_id is present

create or replace function public.calculate_expected_taken()
returns trigger
language plpgsql
as $$
declare
  l_dose_per_day numeric := 1;
  l_freq text;
begin
  -- Determine dose_per_day from study if available
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
    -- Inclusive days: (last - first + 1)
    new.expected_taken := greatest(0, (new.ip_last_dose_date - new.dispensing_date + 1)) * l_dose_per_day;
  else
    new.expected_taken := null;
  end if;

  return new;
end;
$$;

