ALTER TABLE public.study_kit_types
  ADD COLUMN buffer_days integer NULL CHECK (buffer_days >= 0 AND buffer_days <= 120),
  ADD COLUMN buffer_count integer NULL CHECK (buffer_count >= 0 AND buffer_count <= 999);

-- Optional: backfill existing rows with null (default already null)
