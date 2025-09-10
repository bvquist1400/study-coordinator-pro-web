-- Backfill accession_number on lab_kit_shipments from linked lab_kits
update public.lab_kit_shipments s
set accession_number = k.accession_number
from public.lab_kits k
where s.lab_kit_id = k.id
  and s.accession_number is null
  and k.accession_number is not null;

