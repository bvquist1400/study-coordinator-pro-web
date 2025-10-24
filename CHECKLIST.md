# Consolidated Engineering Checklist — Study Coordinator Pro Web

Last updated: 2025-09-06

## Status Summary
- Scope: Consolidates items from `claude_checklist.md`, `codex_ENGINEERING_CHECKLIST.md`, `INSTRUCTIONS.md` (IP plan), and `IP_ACCOUNTABILITY_SYSTEM.md`.
- Goal: Single, prioritized checklist with what’s done vs pending. Originals removed.

## Sections (Multi‑part Studies) — Implemented
- Docs: `docs/sections-quickstart.md`
- Schema: `study_sections`, `subject_sections`; `section_id` on `visit_schedules`; `subject_section_id` on `subject_visits`.
- API: `GET/POST /api/study-sections`, `PUT/DELETE /api/study-sections/[id]`; `GET/POST /api/visit-schedules` (section-aware); `POST /api/subject-sections/transition`.
- UI: SOE builder section dropdown + add; Study Settings → Sections management; Subject transition modal.
- Dosing: `calculate_expected_taken()` prefers section dosing frequency.
- Guardrails: hide/disable transition when study has a single section.

## Upcoming: Multi-Arm Support (superset)
- Plan: `docs/multi-arm-timelines-plan.md`
- Scope: arm templates, per-arm anchors, transitions, and reporting (maps cleanly to Sections).


## Quick Start
- Install deps: `npm ci` (or `npm install`)
- Env vars in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Optional: `LOG_REDACT`, `LOG_TO_SERVICE`, `LOG_SAMPLE_RATE`, `LOG_MAX_PAYLOAD`
- Dev server: `npm run dev`
- Build: `npm run build` → Start: `npm start`
- Lint: `npm run lint`
- Tests: `npm test` | `npm run test:watch` | `npm run test:coverage`
- Database setup (local):
  - `psql <conn> -f setup-database.sql`
  - `psql <conn> -f database-schema.sql`
  - Apply migrations under `migrations/` as needed (e.g., `migrations/20250905_add_functions_ip_batch_and_expected.sql`).

## 🔴 Critical — Fix Now
- [x] Replace `confirm()`/`alert()` usages with accessible UI
  - Files: `src/app/members/page.tsx`, `src/app/lab-kits/bulk-import/page.tsx`
  - Why: Accessibility/security; standardize feedback via modals/toasts.

- [x] Server-side validation for bulk import
  - Files: `src/app/lab-kits/bulk-import/page.tsx` + API route
  - Why: Defense in depth beyond client validation.

- [x] Unsafe casting cleanup in Studies/Dashboard
  - Files: `src/app/studies/page.tsx` (`protocol_version`, `dosing_frequency`), `src/app/dashboard/page.tsx` (unused state)
  - Why: Type safety; reduce runtime risk.

- [x] Route param typing consistency (Next 15)
  - Scope: All API route handlers use `{ params: { id: string } }`; no `await params` pattern remains.

## 🟠 High — Next
- [ ] Enable multi-drug (MVP)
  - Do: Keep the per-drug IP section in the visit modal, ensure one row per study drug with aggregate tablet counts, and route saves through a single transactional call to persist `subject_drug_cycles`; set study dosing to BID for your test study.
  - Docs: `docs/multi-drug-mvp.md`
  - Status: MVP supported; section-level dosing override now respected.
- [ ] Standardize error handling (no alert/console only)
  - Files: `src/app/members/page.tsx`, `src/app/visits/page.tsx`, others noted below
  - Do: Centralized error state + toast; consistent `NextResponse.json({ error }, { status })`.

- [ ] Dashboard performance cleanup
  - Files: `src/app/dashboard/page.tsx`
  - Do: Split large `useEffect` blocks; parallelize queries; remove direct DOM tweaks in favor of CSS/classes.

- [ ] Extract duplicated loading logic to hooks
  - Files: `src/app/studies/page.tsx`, `src/app/compliance/page.tsx`, `src/app/visits/page.tsx`
  - Do: Create `useStudies()`/`useLocalStorageViewMode()` helpers.

- [ ] Accessibility for Analytics tabs
  - Files: `src/app/analytics/page.tsx`
  - Do: Add `role="tab"`, `aria-selected`, keyboard support, accessible icons.

## 🟡 Medium — DX and Consistency
- [ ] Clean up unnecessary re-renders and effects
  - Files: `src/app/subjects/page.tsx` (deps), `src/app/visits/page.tsx` (localStorage logic → hook)

- [ ] Improve error context preservation
  - Files: `src/app/lab-kits/bulk-import/page.tsx`

- [ ] Type annotations and safer assertions
  - Files: `src/app/page.tsx` (session typing), `src/app/compliance/page.tsx` (filtered studies)

## 🟢 Low — Quality and Polish
- [ ] Implement or hide stubbed exports
  - Files: `src/app/analytics/page.tsx`

- [ ] SPA navigation for Lab Kits
  - Files: `src/app/lab-kits/page.tsx` (`window.location.href` → `router.push`)

- [ ] Dark theme skeleton colors
  - Files: `src/app/compliance/page.tsx`

- [ ] Consider code-splitting large landing page
  - Files: `src/app/page.tsx`

## IP Compliance Plan — Status
- ✅ Per-drug cycles model in use
  - Writes require `cycles` (per-drug) via `PUT /api/subject-visits/[id]/ip-accountability`; legacy single-bottle formats removed.
  - Reads: per-visit/per-drug via `subject_drug_cycles` (view: `v_subject_drug_compliance`).
- ✅ Atomic multi-bottle RPC (legacy path) — deprecated
  - `public.save_visit_ip_batch` retained for compatibility; app no longer calls it.

- ✅ Server-side inclusive date math function
  - DB: `public.calculate_expected_taken()` exists (inclusive days × dose_per_day).
  - Trigger: Present in structure (`supabase_database_structure/drug_compliance.sql`).
  - [ ] Migration parity: Ensure trigger is created in migrations if not already.

- [ ] UI single-drug simplification
  - Do: Hide drug selector when study has exactly one drug; auto-assign per bottle in UI.

- [ ] Validation rules in UI/API
  - Do: Non-negative counts; returns ≤ outstanding; `start_date ≤ last_dose_date`; clear error states on missing required fields.

- [ ] Phase 2 (later): Multi-drug support
  - Do: Introduce `study_drugs`, support per-bottle drug selection when >1; compute per-drug and overall compliance.

## Completed Work (From Engineering Checklist)
- ✅ Subject DELETE authorization parity
- ✅ Harden definer function privileges for IP save (least privilege)
- ✅ Unified route auth pattern with helpers
- ✅ Subjects metrics endpoint N+1 removal
- ✅ UTC-safe date utilities and usage in analytics/visits
- ✅ Replace `as unknown as never` with typed DTOs
- ✅ Build health: typecheck/lint sanity; exclude tests from prod type-check
- ✅ Logging hygiene and redaction; client log forwarding toggles
- ✅ RLS: site memberships read/write policies
- ✅ Jest alignment with `next/jest`; removed `ts-jest`
- ✅ Consolidated stray migrations; README overhaul
- ✅ Initial API integration tests (subjects) and date/time util tests; tightened lint rules

Note: Re-validated via file presence and references; app now uses per-drug cycles path in API route.

## File-Specific To-Dos (Collapsed Summary)
- Members: replace `confirm()`, standardize error handling, extract `getToken` util.
- Lab Kits Bulk Import: replace `alert()`, add server validation, improve error context.
- Studies: remove unused state, fix unsafe casts, extract loaders.
- Dashboard: remove unused state, replace DOM manipulation, split effects, parallelize queries.
- Compliance: fix unsafe assertions, dark theme skeletons, extract `loadStudies`.
- Analytics: ARIA/tab semantics, implement or hide export buttons, memoize tab content.
- Subjects: cleanup after function removal, fix re-renders, simplify conditionals.
- Visits: localStorage → hook, consolidate try/catch, review silent error handling.

## Verification (Per Change)
- [ ] Tests updated or added (unit/integration as applicable)
- [ ] Typecheck and lint clean (`npm run lint`)
- [ ] Dev sanity pass (auth flow + key screens)
- [ ] No secrets in code/logs; logs redacted
- [ ] Migrations idempotent; structure parity maintained
 - [ ] SOE builder shows section dropdown only when >1 section; Subject card shows Transition only when >1 section in study

## Notes
- Schema “source of truth” is in `supabase_database_structure/`. Keep migrations in sync.
 - Column added: `ip_compliance_calc_required` on `visit_schedules` and `subject_visits` (backfilled from SOE `procedures` when legacy flag absent). Structure files updated.
- IP docs (“IP Accountability System Documentation”) moved into this checklist as actionable items; future enhancements tracked in backlog below.
- Lint hygiene backlog captured in `docs/lint-hygiene-backlog.md`; schedule cleanup pass before the next release hardening cycle.

## Developer Conventions
- Route params: use `{ params: { id: string } }` in API handlers; do not `await params`.
- Auth: call `authenticateUser(request)` then `verifyStudyMembership(studyId, user.id)` for protected routes.
- Supabase DTOs: define typed payloads for `.insert/.update`; avoid `as unknown as never`.
- Dates: use `src/lib/date-utils.ts` for UTC‑safe parse/format/diffs; avoid `new Date('YYYY-MM-DD')` local parsing.
- Errors: return `NextResponse.json({ error }, { status })` with consistent status codes.
- Logging: prefer `src/lib/logger.ts`; honor `LOG_REDACT`, `LOG_TO_SERVICE`, `LOG_SAMPLE_RATE`, `LOG_MAX_PAYLOAD`; never log tokens/emails/subject numbers/accession numbers/IP IDs.
- IP RPC: for IP accountability, call `save_visit_ip_batch` (atomic); do not loop per bottle server-side.
- DB changes: propose in chat, update `supabase_database_structure/*` files, then add a matching migration under `migrations/`; keep both in parity.

## Testing Tips
- Test runner: `next/jest` on Jest 30 (no `ts-jest`).
- Mock Next server in Node env when needed:
  ```ts
  jest.mock('next/server', () => ({
    NextResponse: { json: (body: any, init?: { status?: number }) => ({ status: init?.status || 200, json: async () => body }) },
  }))
  ```
- Components: mock `@/lib/supabase/client` and stub `fetch` for client code.
- API routes: cover auth failures (401), membership checks (403), not found (404), and happy paths; use admin client where server-side is intended.
- Dates: include UTC edge cases (midnight, DST boundaries) for analytics/compliance.
- Hygiene: run `npm run lint` and typecheck locally; ensure tests don’t rely on local time parsing.

## Backlog — Future Enhancements
- Custom dosing support (decimal dose frequencies)
- Compliance thresholds per study with surfaced UI warnings
- Dose timing tracking for adherence analysis
- Bulk return operations (closeout)
- Integration APIs to external EDC
- Advanced reporting/dashboards; alerts
- Mobile-friendly data entry flows

## Workload Forecasting — Planned
- Add coordinator management (capacity, leave windows, study focus) with admin-only UI.
- Store per-visit effort estimates in SOE templates and monthly operational overhead entries.
- Build a forecasting service that aggregates visit plans, overhead, and availability into multi-month load projections.
- Deliver long-horizon dashboards (capacity timeline, study outlook, alert grid) sourced from the forecasting data.
- Provide a feasibility scenario builder to simulate new study impact before assignment.
