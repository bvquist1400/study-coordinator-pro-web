Study Coordinator Pro — Web

Opinionated Next.js app for study/site coordination with visits, IP accountability, and analytics. This README focuses on getting a contributor productive quickly.

Recent Changes

- **Lab Kit Management**: Enhanced inventory system with intelligent forecasting, shipment tracking, and alert management. Supports multi-kit studies with configurable buffers and deficit tracking.
- **Lab Kit Ordering**: New order workflow with pending order tracking, automatic deficit coverage, and "Mark Received" → inventory entry flow.
- **Shipment Status**: Added `delivered` status to lab kit shipments with corresponding migration and UI updates.

Links

- INSTRUCTIONS: `INSTRUCTIONS.md`
- Testing Guide: `TESTING.md`
- Engineering Checklist: `CHECKLIST.md`

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
    3) `migrations/20250917_add_delivery_days_settings.sql`

Run

- Dev: `npm run dev` (Turbopack)
- Build: `npm run build`
- Start: `npm start`

Scripts

- Lint: `npm run lint`
- Type check: `npm run typecheck`
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

Visits UX Highlights

- All Studies: Visits page defaults to showing all accessible studies. Use the study dropdown to filter; scheduling is disabled when "All Studies" is selected.
- Completion & Delete: Visit Details modal includes “Mark Complete” (computes timing) and “Delete Visit”.
- Timing Rules: `is_within_window` and `days_from_scheduled` are computed only for `completed` visits. `cancelled`/`missed` visits clear timing and do not count towards timing compliance.
- Calendar: Daily cells omit cancelled visits. Timeline shows Actual Date only for completed visits.

Sections (Multi‑part Studies)

- SOE is section-aware. In the SOE builder, use the Section dropdown to switch and maintain separate visit templates per section.
- Create sections when adding a study (Enable Sections) or later in Study Settings → Sections block.
- Subject transitions: use the Transition action on a subject to close current section, set a new anchor date, and generate the next section’s visits.
- Endpoints:
  - `GET/POST /api/study-sections`, `PUT/DELETE /api/study-sections/[id]`
  - `POST /api/subject-sections/transition`

Auth

- Server routes use a Supabase Admin client and verify either:
  - Site membership via `site_members`, or
  - Legacy ownership via `studies.user_id`

IP Compliance

- UI: Visit Details shows "IP Compliance Calculation" with per-drug entry (Start date, total dispensed, returned, last dose date) with a prior-visit date suggestion.
- Writes: `PUT /api/subject-visits/[id]/ip-accountability` requires `cycles` (per-drug) and updates `subject_drug_cycles`. Legacy single-bottle formats are removed.
- Reads:
  - Per-visit, per-drug cycles: `GET /api/subject-visits/[id]/drug-cycles`
  - Subject-level per-visit table (Drug Compliance tab): `GET /api/subjects/[id]/drug-cycles`
- Data model: `subject_drug_cycles` (view: `v_subject_drug_compliance`). Legacy bottle-centric paths are deprecated.
- Study Drugs: manage via Edit/Add Study UIs; APIs under `src/app/api/study-drugs/**`.

Lab Kits

- Status set includes `delivered`. Use the idempotent migration in `migrations/20250911_add_delivered_status_lab_kits.sql` to align environments, and ensure `supabase_database_structure/lab_kits.sql` stays in sync.
- Full-featured inventory management with forecasting, shipment tracking, and automated alerts. See `docs/lab-kit-management-review.md` for comprehensive system analysis and optimization recommendations.

Deployment

- Next.js 15 App Router; deploy via Vercel or your platform of choice.
- Ensure env vars set for runtime; configure Supabase URL/keys.

Notes

- Logs redact sensitive fields by default in production. Toggle with `LOG_REDACT`.
- Date handling prefers UTC-safe utilities to avoid off-by-one errors.
 - SOE: label "IP Compliance Calculation" indicates compliance capture required for that visit.
