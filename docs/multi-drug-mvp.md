# IP Compliance: Multi-Drug Support (Cycles Model)

Last updated: October 2025

## What This Covers
- Recording multiple drugs/bottles for a single visit using the `subject_drug_cycles` table
- How the UI maps to the cycles model (dispense + return in one save)
- How expected vs actual doses are computed with per-drug metadata

## Before You Start
- Ensure the IP/Drug Compliance redesign (cycles model) is enabled in your environment. The legacy `drug_compliance` bottle model is deprecated.
- Confirm your study has drugs configured in **Study Settings → Investigational Products** with dosing information (dose per day or dosing frequency).

## Recording IP Actions (Visit Detail Modal)
1. Open a subject visit and choose **Edit Visit**.
2. In **IP/Drug Compliance**, add rows under:
   - **Dispense**: one row per drug/bottle. Provide `Drug`, `Bottle/Kit ID`, `Tablets Dispensed`, `Dispensing Date`.
   - **Returns**: one row per bottle being returned. Provide `Drug`, `Bottle/Kit ID`, `Tablets Returned`, `Last Dose Date`.
3. Save once. The UI sends a `cycles` payload (per drug/bottle) to `PUT /api/subject-visits/:id/ip-accountability`.

The server writes/updates rows in `subject_drug_cycles`, ensuring atomic updates for all bottles.

## Data Model (Recap)
- `subject_drug_cycles`: primary table storing dispensed/returned counts, dosing, last dose date, computed compliance metrics.
- `subject_visits`: references cycles via `subject_id`/`visit_id`; legacy snapshot fields are maintained temporarily but no longer source of truth.
- `study_drugs`: catalog of drugs per study with `dosing_frequency` / `dose_per_day` metadata.

## Expected Dose Calculation
- The API derives `dose_per_day` from the drug configuration.
- `expected_taken` = (inclusive days between `dispensing_date` and `last_dose_date`) × `dose_per_day` (capped by dispensed count).
- `actual_taken` = `dispensed_count - returned_count` (computed column).
- `compliance_percentage` generated automatically and surfaced in UI/analytics.

## Viewing Results
- Visit detail shows compliance per drug (percent, tablets taken vs expected).
- Subject timelines render compliance history sourced from `subject_drug_cycles` views.
- Analytics dashboards aggregate per-drug and overall compliance metrics using the new view (`v_subject_drug_compliance`).

## Legacy Considerations
- Old `drug_compliance` rows exist only for historical reference. Do not write to it.
- Legacy single-bottle snapshot fields on `subject_visits` will be deprecated once all clients are migrated.

## Troubleshooting
- **Validation errors:** Ensure `last_dose_date` ≥ `dispensing_date` and returns don’t exceed outstanding tablets.
- **Missing drugs:** Add entries in Study Settings → Investigational Products; cycles require `drug_id` lookup.
- **Off-visit returns:** Use the quick action “Record IP Return” which posts to the same endpoint with `visit_id` optional.

## Next Enhancements (Future)
- Per-drug titration schedules (variable dosing frequency)
- Inventory linkage between IP bottles and lab kit assignments
- Compliance alerts integrated with lab kit Forecast/Alerts tabs
