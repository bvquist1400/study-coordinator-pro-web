create table public.lab_kits (
  id uuid not null default gen_random_uuid (),
  study_id uuid not null,
  visit_schedule_id uuid null,
  accession_number text not null,
  kit_type text null,
  lot_number text null,
  expiration_date date null,
  status text null default 'available'::text,
  received_date date null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint lab_kits_pkey primary key (id),
  constraint unique_accession_number unique (accession_number),
  constraint lab_kits_study_id_fkey foreign KEY (study_id) references studies (id) on delete CASCADE,
  constraint lab_kits_visit_schedule_id_fkey foreign KEY (visit_schedule_id) references visit_schedules (id) on delete set null,
  constraint lab_kits_status_check check (
    (
      status = any (
        array[
          'available'::text,
          'assigned'::text,
          'used'::text,
          'pending_shipment'::text,
          'shipped'::text,
          'expired'::text,
          'destroyed'::text,
          'archived'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_lab_kits_study_id on public.lab_kits using btree (study_id) TABLESPACE pg_default;

create index IF not exists idx_lab_kits_status on public.lab_kits using btree (status) TABLESPACE pg_default;

create index IF not exists idx_lab_kits_expiration_date on public.lab_kits using btree (expiration_date) TABLESPACE pg_default;

create index IF not exists idx_lab_kits_accession_number on public.lab_kits using btree (accession_number) TABLESPACE pg_default;

create trigger update_lab_kits_updated_at BEFORE
update on lab_kits for EACH row
execute FUNCTION update_updated_at_column ();
