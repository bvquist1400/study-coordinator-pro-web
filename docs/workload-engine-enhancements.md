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

## Visit-Level Coordinator Assignments (January 31, 2026)

- ✅ Added migrations `20260130_add_visit_schedule_coordinators.sql` and `20260131_add_subject_visit_coordinators.sql` to store coordinator assignments on both visit templates and scheduled subject visits (with RLS + `updated_at` trigger).
- ✅ New service-role endpoint `/api/subject-visits/coordinators` supports GET (list assignments for a subject) and POST (bulk assign coordinators to selected visits). Timeline bulk actions and visit detail pickers now flow through this API.
- ✅ `SubjectVisitTimelineTable` consumes the service data so coordinator chips persist across refreshes; schedule modal exposes the same multi-select for new visits to keep the data loop closed.
- ✅ Added `/api/coordinators` + `/members` integration notes to ensure study assignments remain the single source of truth—the timeline only offers coordinators that are active on the study.
- ⚠️ Follow-up: surface assignment history in SOE builder when visit weights ship, and extend visit notifications so assigned coordinators receive reminders.

## Breakdown Analytics Rollout

- ✅ **Phase 1 — Data contract:** Added the weekly rollup view (`v_coordinator_metrics_breakdown_weekly`), extended `/api/analytics/workload?includeBreakdown=true`, and covered the grouping helper with unit tests.
- ✅ **Phase 2 — UI surfaces:** `/workload` now offers a per-study stacked-area view with study selector + summary stats, and `/studies/[id]/workload` surfaces a matching weekly table with averages/notes for the selected study.
- ✅ **Phase 3 — Visual guardrails:** Playwright component test `tests/visual/per-study-breakdown.spec.tsx` now snapshots the stacked area chart (`npm run test:visual`). Future work: extend coverage to the coordinator load table once layouts stabilize.
- ✅ **Phase 4 — Coordinator input polish:** Added top-level total-hour fields (meetings stay aggregate) with an even “Spread across studies” action so coordinators can log weekly screening/query totals without hand-calculating splits. Jest coverage exercises the new workflow.

### Breakdown QA Checklist

1. Seed or submit a coordinator metrics entry that includes per-study breakdown rows (≥2 studies recommended for stacked comparison).
2. Hit `/api/analytics/workload?includeBreakdown=true&force=true` with a service token and verify the response contains `breakdown.weeks` with the expected hour totals.
3. Open `/workload`:
   - Confirm the “Per-study breakdown” card is visible for the seeded study.
   - Hover the stacked area chart to validate tooltips show meeting/screening/query hour splits and note counts.
4. Navigate to `/studies/[id]/workload`:
   - Check the “Per-study breakdown history” table lists the recent week, totals, and note counts.
   - Validate the summary cards (average weekly hours, latest week) match the API response.
5. Run `npm run test:visual -- --update-snapshots` after intentional UI tweaks to refresh the baseline screenshot.
6. Use the “Spread across studies” button after entering screening/query totals to verify the per-study table populates evenly (meeting hours remain in the summary field).
7. Clear the data (or use a study without breakdown entries) to confirm both UI surfaces hide gracefully.

## Upcoming Work

- **Realtime automation listener:** remains blocked on Supabase broadcast → Edge bindings; once live, phase out the scheduled `/api/cron/cwe-refresh` job after two weeks of clean realtime runs.
- **Link visit intensity weights to SOE visits:** hook the SOE builder into the `visit_weights` table so the forecast chart uses the configured weight per visit type instead of today’s defaults.
- **SOE coordinator assignments:** explore surfacing coordinator pickers on visit rows so planned visits can map to responsible coordinators and weekly logs can pre-fill without manual lookup.
