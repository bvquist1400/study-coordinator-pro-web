-- add_kit_type_id_to_lab_kits.sql
-- Adds the nullable kit_type_id reference to lab_kits for catalog support.

alter table public.lab_kits
  add column if not exists kit_type_id uuid null references public.study_kit_types(id) on delete set null;

create index if not exists idx_lab_kits_kit_type_id on public.lab_kits using btree (kit_type_id);
