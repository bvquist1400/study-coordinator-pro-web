Supabase Database Structure
===========================

Purpose
- This folder contains the current source-of-truth SQL definitions for our Supabase schema: tables, indexes, triggers, generated columns, policies, and helper functions.
- Files here are human-maintained snapshots meant to reflect the latest agreed design. They should always match what migrations produce in each environment.

Sections/Arms
- Studies may define multiple sections (e.g., multi-part protocols). See `study_sections.sql` and `subject_sections.sql`.
- `visit_schedules.sql` now includes `section_id` and is unique on `(section_id, visit_number)`; existing studies default to a single section `S1`.
- `subject_visits.sql` includes `subject_section_id` (and optional `cycle_index`) for section-aware scheduling.
- `functions_calculate_expected_taken.sql` prefers section-level `dosing_frequency` when present.

Workflow for Database Changes
- Propose: Before changing the DB, review the relevant SQL file(s) here and propose your change in chat (include rationale and the exact SQL/DDL you intend to apply).
- Approve: Wait for sign-off. Clarify RLS, backfill, and migration impacts as needed.
- Apply:
  - Add or update a migration under `migrations/` with executable SQL to make the change.
  - Update the corresponding SQL file(s) in this folder so they reflect the new, final schema (post-migration state).
- Verify: Run the migration in the appropriate environment(s). Validate DDL effects, indexes, triggers, and RLS behavior.
- Keep in Sync: If follow-up tweaks are made, repeat the same process and keep this folder synchronized with reality.

Guidelines
- Idempotency: Where possible, use `IF NOT EXISTS` for indexes and guards for triggers when capturing structure in these files.
- Naming: Prefer descriptive names and consistent prefixes (e.g., `idx_<table>_<cols>`, `trg_<table>_<action>`, `fn_<purpose>`).
- RLS: Document intended access patterns when adding/altering policies; verify joins/views remain safe under RLS.
- Generated Columns: Capture the full expressions so downstream reads don’t re-implement logic inconsistently.
- Triggers & Functions: Keep trigger bodies in separate function definitions to allow safe `CREATE OR REPLACE` updates.

Testing Changes
- Local: Apply migrations to a local or staging Supabase project first. Validate inserts/updates and any expected side-effects (triggers, generated columns).
- Performance: Confirm relevant indexes exist (and are used) for common queries. Add indexes with `IF NOT EXISTS` guards in both migration and structure files.
- Backfill: If a schema change requires data migration, include the backfill in the migration and describe it in commit notes or the PR description.

Seeding
- If a feature requires initial reference data (e.g., per-study configuration), add a seed migration in `migrations/` and document the intent here.
- Keep seed scripts idempotent (use `ON CONFLICT` or `WHERE NOT EXISTS`).

Environment Notes
- Dev/Staging/Prod schemas should converge. If environment-specific differences exist, document them clearly in the migration and within the affected SQL file here (with comments).

Questions
- Not sure which file to edit or how a change impacts RLS or analytics? Ask in chat before editing. We’ll outline the change, get approval, then update both the migration and this folder.
