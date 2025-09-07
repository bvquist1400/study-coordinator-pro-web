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

