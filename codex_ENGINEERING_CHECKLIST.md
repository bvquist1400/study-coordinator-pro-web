# Engineering Checklist (Prioritized)

Purpose: Working checklist for critical fixes, security hardening, and quality improvements. Items are ordered by priority. Check off once implemented and validated.

Last updated: 2025-09-01

## Critical — Fix Now

- [x] Subject DELETE authorization parity
  - Why: DELETE in subjects bypasses membership checks; risk of unauthorized deletions.
  - Files: `src/app/api/subjects/[id]/route.ts`
  - Do: Before deletion, verify site membership/ownership (mirror GET/PUT logic).
  - Done when: Attempted delete by non‑member returns 403; owner/member succeeds; tests added.

- [x] Harden `save_visit_with_ip_transaction` privileges
  - Why: Function is `SECURITY DEFINER` without EXECUTE restrictions; principle of least privilege.
  - Files: `migrations/save_visit_with_ip_function.sql` (new migration to alter privileges)
  - Do: REVOKE EXECUTE FROM PUBLIC; GRANT EXECUTE to service role; set `search_path` to `public, pg_temp`.
  - Done when: Privileges reflect least privilege; regression test script can still run via service role.

- [x] Validate Next.js route param typing
  - Why: Ensure we follow framework expectations. In Next 15, `params` is a Promise in typed route handlers.
  - Files: multiple:
    - `src/app/api/subject-visits/[id]/route.ts`
    - `src/app/api/subject-visits/[id]/ip-accountability/route.ts`
    - `src/app/api/lab-kits/[id]/route.ts`
    - `src/app/api/subjects/[id]/route.ts`
    - `src/app/api/studies/[id]/route.ts`
  - Do: Change signatures to `{ params: { id: string } }`; remove `await params`.
  - Done when: Typecheck passes; handlers work in dev.

- [x] Verify `cookies()` usage in server Supabase client
  - Why: Confirm correct API shape for current Next version.
  - Files: `src/lib/supabase/server.ts`
  - Do: Keep `await cookies()` (Next 15 typed cookies is async); no change required.
  - Done when: Typecheck/validator expectations align; auth callback continues working.

## High Priority — Next

- [x] Refactor subjects metrics endpoint to remove N+1 queries
  - Why: Performance; multiple round trips per subject.
  - Files: `src/app/api/subjects/route.ts` (GET with `include_metrics=true`)
  - Do: Preload all `visit_schedules` per study; fetch all visits in one query; group in memory by subject.
  - Done when: Endpoint executes in O(1) queries per study; behavior unchanged.

- [x] Standardize auth across routes
  - Why: Reduce duplication/inconsistency; fewer drift bugs.
  - Files: API routes under `src/app/api/**`
  - Do: Use `authenticateUser` and `verifyStudyMembership` helpers uniformly; centralize repeated patterns. (Started in `subjects` GET)
  - Done when: All routes follow the same auth pattern and return consistent 401/403/404.

- [x] Unified date handling (UTC‑safe)
  - Why: Avoid off‑by‑one issues with `new Date('YYYY-MM-DD')` in local time.
  - Files: analytics routes and visit update logic
  - Do: Add date utilities (parse/format/date diff in UTC); replace direct Date parses where appropriate.
  - Done when: Analytics and visit calculations are timezone‑robust; tests cover edge cases.

- [x] Replace `as unknown as never` update casts with typed payloads
  - Why: Hides shape errors; weakens type safety.
  - Files: study/visit/kit routes using Supabase `.update/.insert`
  - Do: Define DTO types per route; narrow objects before passing to Supabase.
  - Done when: No `unknown as never` remains; type safety enforced.

## Build Health

- [x] Exclude tests from production type-check (`tsconfig.json`)
- [x] Restore strict Next build checks (no TS/ESLint ignores)

- [x] Logging hygiene and redaction
  - Why: Prevent accidental PII/token leakage in logs.
  - Files: `src/lib/logger.ts`, `/api/logs`, `eslint.config.mjs`
  - Do: Redact tokens/emails/ids from context; cap payload size; add sampling/toggle by env; discourage `console.log` via ESLint; replace noisy server logs with structured logger.
  - Done when: Sensitive fields redacted; dev logs unaffected; `/api/logs` re-redacts; `LOG_TO_SERVICE` and `LOG_SAMPLE_RATE` respected.

- [x] RLS policies for site memberships (defense in depth)
  - Why: Some client fallbacks query Supabase directly; current RLS focuses on `user_id` ownership.
  - Files: `migrations/20240902_rls_site_members.sql`
  - Do: Add read/write policies permitting site members to read; restrict writes to owners; server role bypass intact.
  - Done when: Direct client reads (sites, memberships, studies) work for members; unauthorized access denied by RLS.

## Medium Priority — DX and Consistency

- [x] Jest/ts-jest alignment
  - Why: `jest@30` with `ts-jest@29` mismatch; not used with `next/jest` anyway.
  - Files: `package.json`
  - Do: Remove `ts-jest` or upgrade to `^30` if actually needed.
  - Done when: Clean install; tests run green.

- [x] Consolidate stray migrations
  - Why: Two standalone SQL files in repo root cause confusion.
  - Files: `migrations/20240901_add_ip_fields_migration.sql`, `migrations/20240901_add_return_ip_id_field.sql`
  - Do: Move into `migrations/` with proper numbering/commentary or remove if obsolete.
  - Done when: Single source of truth for schema changes.

- [x] README overhaul
  - Why: Current README is stock Next.js; onboarding friction.
  - Files: `README.md`
  - Do: Document env vars, Supabase setup, scripts, testing, deploy, and link to `INSTRUCTIONS.md`, `TESTING.md`.
  - Done when: New contributor can run app end‑to‑end.

## Nice to Have — Iterative Improvements

- [x] API integration tests for critical routes
  - Why: Guard against regressions in auth/membership/business logic.
  - Files: `src/__tests__/api/subjects-id.route.test.ts`
  - Do: Add tests for studies/subjects/subject‑visits/lab‑kits endpoints (GET/POST/PUT/DELETE happy + failure paths). Started with subjects GET by id.

- [x] Add date/time utility unit tests
  - Why: Ensure UTC math correctness and durability.

- [x] Minor lint rules tightening
  - Why: Catch subtle bugs without blocking useful patterns.
  - Files: `eslint.config.mjs`

## Verification Checklist (per change)

- [ ] Unit/integration tests added or updated
- [ ] Typecheck and lint clean (`npm run lint`)
- [ ] Dev server sanity pass (auth flow, key screens)
- [ ] No secrets in code or logs
- [ ] Migrations idempotent and documented

---

References (for convenience):
- Subject delete gap: `src/app/api/subjects/[id]/route.ts`
- Definer function: `migrations/save_visit_with_ip_function.sql`
- Route params typing: various `[id]/route.ts` files
- Supabase cookies: `src/lib/supabase/server.ts`
- N+1 subjects metrics: `src/app/api/subjects/route.ts`
