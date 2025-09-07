# Multi-Arm/Phase Support Plan

Last updated: 2025-09-06

## Goals
- Support studies with multiple phases/arms, each with its own visit template and anchor logic.
- Allow subjects to exit an arm early and transition to another arm using a different anchor date.
- Preserve auditability for schedule generation, transitions, and policy decisions.

## Data Model
- study_arms (new): id, study_id, name, code, description, anchor_type (enrollment|randomization|switch_date|event_date), anchor_day (0|1), dosing_frequency, is_active, created_at.
- arm_visit_templates (new): id, study_arm_id, visit_number, visit_name, timing_value, timing_unit (days|weeks|months), window_before, window_after, required_flags JSONB, version, is_active.
- subject_arm_assignments (new): id, subject_id, study_arm_id, anchor_date, anchor_reason (enum), started_at, ended_at, end_reason (enum), notes, created_by, created_at.
- subject_visits (extend): subject_arm_assignment_id, arm_visit_template_id (nullable for legacy), plus existing fields; future visits tie to the assignment.
- Optional legacy view to present a single-arm compatible shape for older UI/API until cutover.

## Scheduling Engine
- Anchor resolution: derive `anchor_date` from each arm’s `anchor_type` (e.g., enrollment/consent, randomization, explicit switch date).
- Generation: materialize visits from `arm_visit_templates` into `subject_visits` for a given `subject_arm_assignment_id`; compute scheduled dates/windows using arm’s `anchor_day`.
- Regeneration: do not alter completed visits; on template version change or protocol amendment, regenerate only future, not-completed visits; record template `version` used.
- Overlap rules: at most one active arm assignment per subject per study. Enforce via exclusion constraint or require admin override with audit trail.

## Arm Transitions
- RPC `transition_subject_arm(p_subject_id, p_from_assignment_id, p_to_study_arm_id, p_new_anchor_date, p_policy JSONB)`:
  - Close current assignment (`ended_at`, `end_reason`, `notes`).
  - Cancel or retain future planned visits based on policy (e.g., `cancel_all_after_transition: true`).
  - Create new `subject_arm_assignment` with `anchor_date`; generate visits for the new arm.
  - Optionally carry forward open tasks and log protocol deviations.
- Policy knobs: handling of future visits (cancel|keep|mark not-applicable), visit numbering (restart vs. global), window recalculation (always by new anchor), IP continuity flags.
- Audit trail: actor, timestamp, from/to arms, reason, affected visit IDs.

## API/Backend
- Supabase RPCs:
  - create_subject_arm_assignment(...) returns uuid
  - generate_subject_visits_for_assignment(p_assignment_id) returns void
  - transition_subject_arm(...) returns record { new_assignment_id uuid, canceled_visit_count int }
  - list_study_arms(p_study_id), list_arm_visit_templates(p_study_arm_id)
- RLS/Policies: restrict by study membership; ensure arm templates and assignments are scoped to `study_id`.
- Expected doses: update `calculate_expected_taken()` to prefer arm-level `dosing_frequency`, fallback to study-level.
- App touchpoints:
  - src/lib/visit-calculator.ts: accept `anchor_day` and `anchor_date` per assignment.
  - src/lib/compliance-calculator.ts: compute per arm when applicable.
  - src/lib/ip-accountability.ts: lookups constrained to the visit’s assignment.
  - src/lib/api/auth.ts: arm-aware checks where study-scoped logic is used.
  - src/components/*: pass `subject_arm_assignment_id` where visits are manipulated.

## UI/UX
- Subject timeline segmented by arm with clear visual boundaries and a transition marker on switch date.
- Transition wizard: select target arm, set anchor date, choose policy (cancel/keep visits), add notes/reason; preview affected visits before confirmation.
- Visit lists: filter by arm or group by arm segments; warn when scheduling outside window relative to the arm’s anchor.
- Lab kits: require arm + visit template context when assigning kits to avoid cross-arm mismatches.
- Audit history: show transitions and automatically canceled visits with reasons.

## Migrations & Backfill
1) Schema: add `study_arms`, `arm_visit_templates`, `subject_arm_assignments`; extend `subject_visits`; add indexes and (optional) exclusion constraint to prevent overlapping active assignments per subject/study.
2) Defaults: for each `study`, create a default arm and move any existing visit schedule definitions into `arm_visit_templates`; set `anchor_type`/`anchor_day` from current baseline logic.
3) Backfill subjects: create one `subject_arm_assignment` per subject using existing baseline/randomization as anchor; update existing `subject_visits` to reference the created assignment/template rows.
4) API/UI: ship arm-aware endpoints and UI; keep legacy views temporarily for compatibility.
5) Cleanup: remove legacy-only fields after cutover.

## Compliance & IP
- Dosing frequency: use arm-level `dosing_frequency` when set; fallback to study-level. Extend `calculate_expected_taken()` accordingly.
- Cross-arm continuity: on transition, close out open IP if policy dictates; validate returns against prior arm only when bottle and dates are consistent.
- Deviations: flag early exits or missed visits at transition time for audit and reporting.

## Reporting
- Add arm and assignment dimensions to all subject/visit/compliance reports; breakdown KPIs by arm and transitions.
- Subject flow: CONSORT-style counts per arm (entered, completed, early exit, transitioned) with reasons.

## Security & Audit
- RLS scoped by `study_id` for arms, templates, and assignments.
- arm_transitions_audit: record policy, actor, reasons, and visit deltas.
- Prefer soft-delete/status flags on visits; retain referential integrity.

## Testing
- DB: unit tests for schedule generation, transition RPC behavior, overlap constraints, expected dose calculation, and regeneration policies.
- FE: visit calculator unit tests for different anchor types; transition wizard flows; timeline segmentation.
- E2E: arm setup → subject assignment → visit generation → transition → verify cancellations/new schedule; IP continuity validation.

## Rollout
- Opt-in per study; existing single-arm studies operate via a default arm.
- Staging dry-run migration/backfill; validate counts for subjects, visits, kits.
- Dual-run: maintain legacy views/APIs for 1–2 releases during client switch-over.
- Monitoring: logs/metrics on transitions and generation; alert on overlaps or failures.

## Open Questions
- Anchor types: confirm full set (enrollment, randomization, drug_start, event-based custom date).
- Overlap policy: hard prevent vs. admin override? If override, define audit shape.
- Visit carry-over: any visits that must persist across arms, or always cancel on switch?
- IP continuity: should bottles cross arms when protocol allows? Default behavior?
- Template versioning: cadence of amendments and migration strategy for live subjects.

## Next Steps (for implementation)
1) Add schema migration for `study_arms`, `arm_visit_templates`, `subject_arm_assignments`, and `subject_visits` extensions (+ indexes/constraints).
2) Implement RPCs: `create_subject_arm_assignment`, `generate_subject_visits_for_assignment`, `transition_subject_arm`.
3) Update `calculate_expected_taken()` to be arm-aware (prefer arm dosing).
4) Update `src/lib/visit-calculator.ts` and related modules to accept assignment anchor inputs.
5) Ship minimal UI for arm CRUD, subject assignment, and transition wizard.
6) Backfill script/migration for existing studies/subjects; enable default-arm compatibility view.
7) Tests (DB + FE + E2E) and rollout behind a per-study feature flag.

