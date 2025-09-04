# IP/Drug Compliance Redesign

Status: Proposal (ready for implementation)

## Context

Current IP accountability captures dispensing and returns in the visit details view and stores durable data in `drug_compliance` while also writing legacy snapshot fields on `subject_visits`. The save path issues multiple per‑bottle queries and mixes sources of truth, making it brittle and hard to extend.

## Problems Observed

- Multiple round trips, no single transaction: per‑bottle loops can partially succeed and create race conditions.
- Mixed sources of truth: `subject_visits` has denormalized IP snapshot fields that can drift from `drug_compliance`.
- Limited modeling: one row per bottle + unique `(subject_id, ip_id)` complicates partial returns, re‑issues, corrections.
- Under‑specified expected dose: no explicit dosing plan (QD/BID/TID) to properly compute `expected_taken`.
- Query burden: analytics reconcile snapshot fields vs. durable rows.

## Goals

- One source of truth for IP actions, with atomic writes and a complete audit trail.
- Clean, scalable modeling of multi‑bottle, partial returns, off‑visit returns, and corrections.
- Server‑side computation of compliance using protocol dosing, avoiding client math drift.
- Backward‑compatible reads during migration, then sunset legacy snapshots.

## Proposed Architecture

### Option A (Recommended): Event Model

Record each IP action as an event; derive compliance from events.

Table: `drug_events`

- `id UUID PK`
- `subject_id UUID` (FK subjects)
- `user_id UUID` (FK auth.users)
- `visit_id UUID NULL` (FK subject_visits)
- `ip_id TEXT` (bottle/kit identifier)
- `event_type TEXT CHECK IN ('dispensed','returned')`
- `count INTEGER` (positive integer)
- `event_date DATE` (dispensing date or last dose date for returns)
- `notes TEXT NULL`
- `created_at TIMESTAMPTZ DEFAULT now()`

Indexes:

- `(subject_id, ip_id, event_date)`
- `(visit_id)`
- `(event_type, event_date)`

Derived View: `drug_compliance_view`

- Groups events by subject + ip_id (and optionally by cycle) to compute:
  - `dispensed_count = SUM(count WHERE event_type='dispensed')`
  - `returned_count = SUM(count WHERE event_type='returned')`
  - `actual_taken = dispensed_count - returned_count`
  - `dispensing_date = MIN(event_date WHERE dispensed)`
  - `ip_last_dose_date = MAX(event_date WHERE returned)`
  - `expected_taken = days_between(dispensing_date, ip_last_dose_date) * dose_per_day`
  - `compliance_percentage`, `is_compliant` (>= 80%, cap > 100% separately in analytics)

Pros:

- Append‑only audit trail; easy to handle partial returns and corrections.
- Atomic writes; simple client payload.
- Backfilling and recomputing compliance is straightforward.

### Option B: Cycle Model (Keep single row per issue)

Table: `drug_cycles` (can be a reworked `drug_compliance`)

- `id UUID PK`
- `subject_id`, `user_id`, `visit_id NULL`, `ip_id`
- `dispensing_date DATE`, `dispensed_count INT`
- `ip_last_dose_date DATE NULL`, `returned_count INT DEFAULT 0`
- `dose_per_day NUMERIC NULL`
- `expected_taken NUMERIC NULL`
- `actual_taken GENERATED (dispensed_count - returned_count)`
- `compliance_percentage GENERATED`, `is_compliant GENERATED`
- Unique: `(subject_id, ip_id, dispensing_date)`

Pros:

- Fewer rows, direct read model; OK if bottle IDs are never reused across cycles.

## Dosing + Expected Taken

- Store dosing metadata once and reuse in computation:
  - Study: `dosing_frequency` with derived `dose_per_day` (QD=1, BID=2, TID=3, QID=4, weekly/custom as needed).
  - Optional subject override for titrations/deviations.
- Define date math precisely (inclusive/exclusive) to avoid off‑by‑one.

## API Contract (Unified)

Endpoint: `PUT /api/subject-visits/:id/ip-accountability`

Payload:

```json
{
  "dispensed_bottles": [
    { "ip_id": "B123", "count": 30, "start_date": "2025-09-01" }
  ],
  "returned_bottles": [
    { "ip_id": "B123", "count": 4, "last_dose_date": "2025-09-25" }
  ]
}
```

Behavior:

- If `visit_id` is present (from route), events link to that visit.
- If called outside a visit (quick return), allow `visit_id` NULL or create an “Unscheduled – IP Return” visit as policy.
- Server validates: counts non‑negative, cannot return more than dispensed minus already returned, dates sane.
- Server computes expected taken using dosing metadata.
- Returns updated visit + compliance snapshot for UI.

## UI/UX

- Visit Detail Modal: Keep two clear sections on the same screen
  - Dispense: add bottles (ip_id, count, start_date)
  - Return: select prior ip_id, returned_count, last_dose_date
  - Submit once; server records all in one transaction.

- Quick Action: “Record IP Return”
  - Available on Subject and Lab Kits pages.
  - Minimal modal to log returns outside of a scheduled visit; optional link to a visit.

- Subject Visits: Render compliance values from the derived view/table; stop reading legacy snapshots once migration completes.

## Database Changes

Common to both options:

- Deprecate legacy IP snapshot fields on `subject_visits`:
  - `ip_dispensed`, `ip_returned`, `ip_id`, `return_ip_id`, `ip_start_date`, `ip_last_dose_date`
  - Keep `drug_dispensing_required` and notes.
- Keep compatibility triggers temporarily if needed to populate snapshots for old UIs.

Option A (events): create `drug_events` + `drug_compliance_view`.

Option B (cycles): adjust `drug_compliance` to allow multiple cycles per ip via `(subject_id, ip_id, dispensing_date)`; add `dose_per_day`.

## Migration Plan

1) Introduce new schema alongside existing

- Create events table + view (Option A), or adjust `drug_compliance` (Option B).
- Backfill from current rows:
  - Option A: emit two events per row (dispensed with `dispensing_date`, returned with `ip_last_dose_date`).
  - Option B: enforce new unique key, set `dose_per_day` from study.

2) Switch writes

- Update `/api/subject-visits/[id]/ip-accountability` to call one RPC/transaction with arrays; remove per‑bottle loops.
- Maintain legacy snapshots via trigger during the transition.

3) Switch reads

- UI & analytics source compliance from the new view/table.
- Stop referencing legacy snapshot fields.

4) Cleanup

- Drop compatibility triggers and legacy snapshot columns from `subject_visits`.
- Remove transitional code from API.

## Security & RLS

- Ensure RLS policies allow users to manage own study/site data.
- Events model: row‑level policy on `subject_id`/site membership; JOIN safety for the view.

## Indexing

- Events: `(subject_id, ip_id, event_date)`, `(visit_id)`, `(event_type, event_date)`.
- Cycles: `(subject_id, ip_id, dispensing_date)`, `(assessment_date)` for reporting.

## Validation Rules

- No negative counts; returned_count cannot exceed outstanding.
- `start_date <= last_dose_date` when both present.
- Optionally disallow returns before any dispense event.

## Analytics Impacts

- Compliance alerts: flag < 80% and > 100% (overuse) as non‑compliant; cap > 100 for averages.
- Timing compliance remains based on `is_within_window`; exclude NULLs from denominators.

## Rollout & Risks

- Low‑risk rollout by running models in parallel; cut over reads, then drop snapshots.
- Risks: incorrect backfill, gaps in dosing metadata; mitigate by verifying a few subjects end‑to‑end on staging.

## Open Questions

- Do we require every return to be associated with a visit (policy)?
- Do we need subject‑level dosing overrides (titrations)?
- Should we split cycles when the same `ip_id` is re‑issued?

