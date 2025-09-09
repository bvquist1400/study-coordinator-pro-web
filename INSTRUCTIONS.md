# Project Instructions — Study Coordinator Pro Web

Last updated: 2025-09-06

This document is the concise, always-current guide for working on this repo. It complements `README.md` and the consolidated `CHECKLIST.md`.

## Environment
- Node 20+, npm 10+
- Next.js 15 (App Router)
- Supabase (Auth + Postgres)

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Tests: `npm test`

## Database Changes — Source of Truth Policy
When you change the database (tables, functions, triggers, RPCs):
- Add a migration in `migrations/` that is idempotent and reversible when possible.
- Update the matching files in `supabase_database_structure/` to reflect the post‑migration desired state (tables, functions, indexes, triggers). This folder is our declarative snapshot for schema parity.
- Keep names and definitions in sync across both. During reviews, we diff migrations against structure files.

Examples:
- Table change: edit `supabase_database_structure/<table>.sql` with new columns/constraints/indexes.
- Function/RPC change: edit `supabase_database_structure/functions_<name>.sql`.
- Trigger hooks: ensure trigger creation is represented either in table DDL or a dedicated function file when appropriate.

## Sections (Multi‑part Studies)
- Studies can have multiple sections (e.g., Part A Open Label, Part B Double‑Blind) with their own anchor dates and templates.
- Tables:
  - `study_sections`: per‑study sections with `code` (e.g., S1), `name`, `order_index`, `anchor_type`, optional overrides: `dosing_frequency`, `compliance_threshold`.
  - `subject_sections`: per‑subject assignment into a section with an `anchor_date`. At most one active per subject.
  - `visit_schedules`: now scoped by `section_id` and unique on `(section_id, visit_number)`.
  - `subject_visits`: references `subject_section_id`; optional `cycle_index` reserved for future use.
- Dosing logic: `calculate_expected_taken()` prefers section‑level `dosing_frequency`; falls back to study‑level.
- Enabling: by default a study has a single section (S1). Additional sections are added when creating the study if needed.
- UI: the SOE builder shows a section dropdown (ordered by `order_index`, labeled `code — name`) when a study has more than one section.
- API endpoints:
  - `GET/POST /api/study-sections`, `PUT/DELETE /api/study-sections/[id]`
  - `GET /api/visit-schedules?study_id=...&section_id=...`
  - `POST /api/visit-schedules` accepts `section_id` per row
  - `POST /api/subject-sections/transition` (close current, generate next section visits)

## Auth and RLS
- All API routes must call `authenticateUser(request)`.
- Study‑scoped routes must call `verifyStudyMembership(studyId, user.id)`.
- Prefer server endpoints for data that may be blocked by client RLS.

## Conventions
- Route params typing: follow the project pattern (`{ params: Promise<{ id: string }> }`).
- Error responses: `NextResponse.json({ error }, { status })`.
- Logging: `src/lib/logger.ts`, only `console.warn/error` in client code.

## Feature Flags and Safety
- Introduce new UI behind tabs or simple guards to avoid large build diffs.
- Add database migrations incrementally; keep UI tolerant of missing optional fields.

## Where Things Live
- Product/engineering checklist: `CHECKLIST.md`.
- Archived longform background: `docs/ARCHIVE.md`.
- Multi‑arm plan: `docs/multi-arm-timelines-plan.md`.
- Multi‑drug usage (current MVP): `docs/multi-drug-mvp.md`.
