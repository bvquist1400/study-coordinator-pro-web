-- Adds configurable buffer settings to studies for inventory forecasting and visit warnings.

alter table public.studies
  add column if not exists inventory_buffer_days integer not null default 14,
  add column if not exists visit_window_buffer_days integer not null default 0;

-- Ensure existing rows have defaults applied if columns already existed without data.
update public.studies
set inventory_buffer_days = coalesce(inventory_buffer_days, 14),
    visit_window_buffer_days = coalesce(visit_window_buffer_days, 0)
where inventory_buffer_days is null
   or visit_window_buffer_days is null;
