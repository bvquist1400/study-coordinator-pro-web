create table public.lab_kit_shipments (
  id uuid not null default gen_random_uuid (),
  lab_kit_id uuid null,
  accession_number text null,
  subject_visit_id uuid null,
  airway_bill_number text not null,
  carrier text null default 'fedex'::text,
  shipped_date date null,
  estimated_delivery date null,
  actual_delivery date null,
  tracking_status text null,
  notes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint lab_kit_shipments_pkey primary key (id),
  constraint lab_kit_shipments_lab_kit_id_fkey foreign KEY (lab_kit_id) references lab_kits (id) on delete CASCADE,
  constraint lab_kit_shipments_subject_visit_id_fkey foreign KEY (subject_visit_id) references subject_visits (id) on delete set null,
  constraint lab_kit_shipments_carrier_check check (
    (
      carrier = any (array['fedex'::text, 'ups'::text, 'other'::text])
    )
  ),
  constraint shipments_kit_or_accession_chk check (
    lab_kit_id is not null or accession_number is not null
  )
) TABLESPACE pg_default;

create index IF not exists idx_lab_kit_shipments_lab_kit_id on public.lab_kit_shipments using btree (lab_kit_id) TABLESPACE pg_default;

create trigger update_lab_kit_shipments_updated_at BEFORE
update on lab_kit_shipments for EACH row
execute FUNCTION update_updated_at_column ();
