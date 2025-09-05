Study Coordinator Pro — Web

Opinionated Next.js app for study/site coordination with visits, IP accountability, and analytics. This README focuses on getting a contributor productive quickly.

Links

- INSTRUCTIONS: `INSTRUCTIONS.md`
- Testing Guide: `TESTING.md`
- Engineering Checklist: `codex_ENGINEERING_CHECKLIST.md`

Prerequisites

- Node 20+ and npm 10+
- Supabase project (self-hosted or cloud)

Environment

- Copy `.env.local` and fill values. Required keys (examples):
  - `NEXT_PUBLIC_SUPABASE_URL`: https://<project>.supabase.co
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key
  - `SUPABASE_SERVICE_ROLE_KEY`: service role (server only)
  - `LOG_REDACT`: on|off (default on in prod)
  - `LOG_TO_SERVICE`: on|off (default on in prod)
  - `LOG_SAMPLE_RATE`: 0..1 (default 1)
  - Optional: `LOG_MAX_PAYLOAD`, feature flags

Install

- `npm ci` (preferred) or `npm install`

Database

- Bootstrap schema: `setup-database.sql`
- Full schema reference: `database-schema.sql`
- Local tweaks and fixes (idempotent): files under `migrations/`
  - Example order:
    1) `migrations/20240901_add_ip_fields_migration.sql`
    2) `migrations/20240901_add_return_ip_id_field.sql`

Run

- Dev: `npm run dev` (Turbopack)
- Build: `npm run build`
- Start: `npm start`

Scripts

- Lint: `npm run lint`
- Tests: `npm test` | `npm run test:watch` | `npm run test:coverage`
- Data fix/diagnostics: `scripts/*` (see filenames)

Testing

- Jest 30 with `next/jest` and `jsdom` env.
- Tests live under `src/__tests__/`.
- See `TESTING.md` for scenarios and tips.

Key App Areas

- API routes: `src/app/api/**` (uniform auth/membership, UTC-safe date handling)
- Lib: `src/lib/**` (`supabase` clients, date utils, logger with redaction)
- Components/Pages: `src/app/**`, `src/components/**`

Auth

- Server routes use a Supabase Admin client and verify either:
  - Site membership via `site_members`, or
  - Legacy ownership via `studies.user_id`

IP Accountability

- Endpoints under:
  - `src/app/api/subject-visits/[id]/ip-accountability/route.ts`
  - Data model: `drug_compliance`, fields on `subject_visits`

Deployment

- Next.js 15 App Router; deploy via Vercel or your platform of choice.
- Ensure env vars set for runtime; configure Supabase URL/keys.

Notes

- Logs redact sensitive fields by default in production. Toggle with `LOG_REDACT`.
- Date handling prefers UTC-safe utilities to avoid off-by-one errors.
