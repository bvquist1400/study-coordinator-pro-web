-- Adds UPS tracking metadata columns to lab kit shipments for carrier integrations.

alter table public.lab_kit_shipments
  add column if not exists ups_tracking_payload jsonb,
  add column if not exists last_tracking_update timestamp with time zone;

-- existing rows remain unchanged; UPS integration backfills data once tracking jobs run.
