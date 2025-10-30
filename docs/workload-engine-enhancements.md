# Workload Engine Enhancements

## Per-study Note Persistence Blueprint

- **Goal:** Preserve granular weekly context for each coordinator/study pairing so inline log defaults reflect past entries instead of evenly splitting rolling totals.
- **Data shape:** Introduce a new table (e.g. `coordinator_metrics_notes`) keyed by `coordinator_id`, `study_id`, and `week_start` to store structured breakdowns (`meetings_hours`, `screening_hours`, `query_hours`, `notes`).
- **Capture flow:** When submitting the inline log, persist both the aggregate payload (existing `/api/cwe/metrics` call) and the per-study rows in a new edge endpoint (`/api/cwe/metrics/breakdown`). Use a transaction so both records stay in sync.
- **Pre-fill logic:** On load, fetch the most recent breakdown row per assignment. Populate the inline table with exact historical values and surface a “carried forward from last week” banner when fields are reused without edits.
- **Analysis opportunities:** Expose a Supabase view to roll up per-study coordinator hours across weeks, enabling saturation charts in the Overview and bridging into CWET capacity planning dashboards.
- **Backward compatibility:** If breakdown data is missing (migration period), continue falling back to proportional splits to avoid blocking submissions.

## Implementation Notes — October 30, 2025

- ✅ Supabase migration `20260115_add_coordinator_metrics_notes.sql` added the `coordinator_metrics_notes` table plus the `save_coordinator_metrics_with_breakdown` RPC so aggregate metrics and per-study breakdowns stay in sync.
- ✅ `/api/cwe/metrics` now reads and writes the detailed breakdown, and the Workload Engine inline log prefills exact values from the latest submission instead of evenly distributing totals.
- ⚠️ Follow-up: expose historical trend views that surface the breakdown data (e.g., per-study coordinator load charts) once consumption patterns are defined.
