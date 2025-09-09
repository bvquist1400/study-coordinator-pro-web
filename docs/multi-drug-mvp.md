# Multi-Drug MVP — Usage and Notes

Last updated: 2025-09-06

## What this enables
- Record multiple bottles in a single visit (dispense and/or return), covering scenarios where a subject takes two drugs concurrently.
- Compliance is tracked per bottle in `drug_compliance` and aggregated in analytics and subject views.
- Expected doses use the study’s `dosing_frequency` (BID = 2/day) or, when sections are enabled, a section‑level `dosing_frequency` override.

## Setup for your study with two BID drugs
- Set the study’s dosing frequency to `BID`:
  - UI: Studies → Edit → Dosing frequency = BID
  - Or API: `PUT /api/studies` with `dosing_frequency: 'BID'`.
- No separate drug catalog is required for MVP; identify each bottle by its unique `ip_id`.

## How to enter data
- Open a subject visit and click “Edit Visit”.
- In “Investigational Product Accountability”, add entries under:
  - “Bottles to Dispense” → one row per bottle (for each drug), set `Bottle/Kit ID`, `Tablets Dispensed`, and `Start Date`.
  - “Bottles Being Returned” → one row per bottle returned, set `Bottle/Kit ID`, `Tablets Returned`, and `Last Dose Date`.
- Save changes. The app writes all bottles atomically via RPC `save_visit_ip_batch` and updates the visit summary (first bottle only for legacy fields).

## How compliance is calculated
- DB trigger `calculate_expected_taken()` computes `expected_taken` when a return is posted for a bottle:
  - Inclusive days × `dose_per_day` derived from section `dosing_frequency` (if set) else study `dosing_frequency` (BID = 2).
- Each bottle has its own `drug_compliance` row keyed by `(subject_id, ip_id)`.
- UI and analytics can summarize across multiple bottles for the subject.

## Limitations (by design in MVP)
- No per-drug identifiers yet (e.g., no `drug_id`); differentiation is by bottle `ip_id`.
- Per-drug dosing frequencies are not supported; frequency is study‑wide or per‑section.
- Legacy single-bottle fields remain on `subject_visits` for compatibility and show only the first bottle.

## Next steps (optional, later)
- Add `study_drugs` and `drug_id` on `drug_compliance` and inventory to tag bottles by drug.
- Support per-drug dosing frequency and per-drug reporting widgets.
- UI labels to select the drug when dispensing (stored alongside `ip_id`).
