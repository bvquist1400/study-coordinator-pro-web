-- Add explicit timing fields for visit schedules to preserve units (days/weeks/months)
ALTER TABLE visit_schedules
  ADD COLUMN IF NOT EXISTS timing_value integer,
  ADD COLUMN IF NOT EXISTS timing_unit text CHECK (timing_unit IN ('days','weeks','months'));

-- Backfill timing column values based on existing visit_day values
UPDATE visit_schedules
SET
  timing_value = CASE
    WHEN visit_day = 0 THEN 0
    WHEN visit_day > 0 AND visit_day % 30 = 0 THEN visit_day / 30
    WHEN visit_day > 0 AND visit_day % 7 = 0 THEN visit_day / 7
    ELSE visit_day
  END,
  timing_unit = CASE
    WHEN visit_day = 0 THEN 'days'
    WHEN visit_day > 0 AND visit_day % 30 = 0 THEN 'months'
    WHEN visit_day > 0 AND visit_day % 7 = 0 THEN 'weeks'
    ELSE 'days'
  END
WHERE timing_value IS NULL OR timing_unit IS NULL;

-- Ensure defaults and non-null constraints for new columns
ALTER TABLE visit_schedules
  ALTER COLUMN timing_unit SET DEFAULT 'days';

UPDATE visit_schedules
SET timing_unit = 'days'
WHERE timing_unit IS NULL;

UPDATE visit_schedules
SET timing_value = 0
WHERE timing_value IS NULL;

ALTER TABLE visit_schedules
  ALTER COLUMN timing_unit SET NOT NULL,
  ALTER COLUMN timing_value SET NOT NULL;
