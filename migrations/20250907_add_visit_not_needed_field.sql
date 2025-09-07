-- Add visit_not_needed field to subject_visits table
-- This allows marking visits as not needed, which excludes them from visit metrics

do $$
begin
  -- Add visit_not_needed column
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='subject_visits' and column_name='visit_not_needed'
  ) then
    alter table public.subject_visits 
    add column visit_not_needed boolean null default false;
    
    -- Create index for performance
    create index if not exists idx_subject_visits_visit_not_needed 
    on public.subject_visits using btree (visit_not_needed) 
    tablespace pg_default;
  end if;
end $$;