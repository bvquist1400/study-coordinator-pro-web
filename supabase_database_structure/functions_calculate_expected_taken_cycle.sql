-- Trigger function to compute expected_taken for aggregated per-drug cycles
create or replace function public.calculate_expected_taken_cycle()
returns trigger
language plpgsql
as $$
declare
  l_dose_per_day numeric := 1;
  l_freq text;
  l_dose_override numeric;
begin
  -- Prefer explicit dose_per_day on study_drugs; fallback to dosing_frequency mapping
  select sd.dose_per_day, sd.dosing_frequency
    into l_dose_override, l_freq
  from public.study_drugs sd
  where sd.id = new.drug_id;

  if l_dose_override is not null then
    l_dose_per_day := l_dose_override;
  elsif l_freq is not null then
    l_dose_per_day := case l_freq
      when 'QD' then 1
      when 'BID' then 2
      when 'TID' then 3
      when 'QID' then 4
      when 'weekly' then 1.0/7.0
      else 1
    end;
  end if;

  if new.dispensing_date is not null and new.last_dose_date is not null then
    -- Inclusive days: (last - first + 1)
    new.expected_taken := greatest(0, (new.last_dose_date - new.dispensing_date + 1)) * l_dose_per_day;
  else
    new.expected_taken := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

