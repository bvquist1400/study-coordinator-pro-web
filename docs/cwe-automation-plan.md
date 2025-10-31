# CWE Automation Plan

## 1. Objectives
- Eliminate manual refresh steps after visit completions or weekly coordinator submissions.
- Keep workload analytics (`/api/analytics/workload`) aligned with the latest operational inputs without requiring users to reopen dashboards.
- Provide auditable state transitions for automatically applied multiplier adjustments.

## 2. Trigger Points
- **Visit completion** (`subject_visits.status = 'completed'`): see `src/app/api/subject-visits/[id]/route.ts:86`.
- **Visit scheduling updates** (date/status changes that impact `cwe_forecast_4w`).
- **Coordinator metrics submissions** (`coordinator_metrics` upserts via `src/app/api/cwe/metrics/route.ts:113`).
- **Study coordinator assignment changes** (`study_coordinators` CRUD in `src/app/api/study-coordinators/**`, now driven by the `/members` coordinator assignment UI).

## 3. Proposed Automation Hooks
1. **Postgres trigger → NOTIFY channel**
   - Tables: `subject_visits`, `coordinator_metrics`, `study_coordinators`.
   - Emit payload `{ table, event, primary_keys }`.
   - Enables downstream listeners without heavy logic in SQL.

2. **Supabase Edge Function `cwe-refresh`**
   - Consumes the `cwe_events` channel.
   - Batches impacted study IDs and calls `/api/analytics/workload/refresh` with a service-role token.
   - Debounced window (default 15s) prevents redundant recomputes when multiple updates land together.

3. **Cache Invalidation Layer**
   - Introduce `study_workload_snapshots` table to store per-study JSON cached response.
   - Endpoint `/api/analytics/workload` now checks snapshot TTL (default 5 minutes) before recalculating.
   - `refresh` endpoint performs recalculation using existing logic, storing snapshot + timestamp.

4. **Nightly Cron (Vercel)**
   - `/api/cron/cwe-backfill` runs nightly (03:00 UTC) to:
     - Rebuild all snapshots (safety net, verified Oct 29 run logs).
     - Detect stale assignments vs. coordinator metrics (report gaps).

## 4. Data and Safety Considerations
- **Idempotency:** refresh endpoint should accept optional `force=true` to bypass cache.
- **Backpressure:** if multiple events arrive quickly, batch updates by study (Edge function holds queue for 30s window).
- **Observability:** log to existing `logger` with `context: { studyId, trigger, source }`.
- **Failure handling:** on refresh failure, leave snapshot untouched and enqueue retry (Edge function uses exponential backoff).

## 5. Implementation Steps
1. ✅ Created SQL migration for NOTIFY triggers (`migrations/20251027_cwe_event_triggers.sql`) emitting compact JSON payloads via `pg_notify('cwe_events', ...)`.
2. ✅ Scaffolded and documented the `cwe-refresh` Edge function deployment (Supabase CLI).
3. ✅ Added `study_workload_snapshots` table + TypeScript types (`migrations/20251027_add_workload_snapshots.sql` applied Oct 29, 2025).
4. ✅ `/api/analytics/workload` now reads/writes the snapshot layer while retaining live calc fallback.
5. ✅ `refresh` handler reuses shared computation and is callable by the Edge function (manual invoke verified Oct 29, 2025).
6. ✅ Vercel cron job + endpoint for nightly rebuild live at 03:00 UTC (logs monitored).
7. ✅ Rollout documented in `CWET_Framework.md` and this runbook.
8. ✅ Slack webhook alerting wired into `/api/cron/cwe-backfill` and `/api/cron/cwe-refresh` (set `CWE_CRON_ALERT_WEBHOOK_URL`) so failures page the team.

## 6. Open Questions
- Do we need per-coordinator personal dashboards cached separately?
- Should meeting points adjustments persist back to `studies` or remain derived?
- How to surface automation failures to end users—banner vs. silent retry?

## 7. Immediate Next Tasks

- Escalate with Supabase or wait for UI/CLI support to attach the `cwe_events` broadcast channel to `cwe-refresh` (listener pending; manual invoke + cron cover interim). **Update — Jan2026:** The Edge function now resolves impacted studies for coordinator events via REST, so once the broadcast binding unblocks, no additional code changes should be needed.
- Continue monitoring nightly `/api/cron/cwe-backfill` runs and alert on failures; extend reporting if error rate >0.
- Plan to disable `/api/cron/cwe-refresh` once the Supabase broadcast binding is reliable for all three trigger sources (visits, metrics, assignments). Keep the cron configured as a fallback until we have two weeks of clean realtime runs.
- Link visit intensity weights directly to SOE visit templates so forecast math reflects the configured weight per visit type.
- Prototype visit-level coordinator assignments in the SOE builder so each planned visit can map to a responsible coordinator when workflows require it.

## 8. Deployment Checklist
1. **Edge Function**
   - ✅ `cd supabase/functions/cwe-refresh`
   - ✅ Copied `.env.example` → `.env`, set `BASE_URL`, `SERVICE_ROLE_KEY`, `BATCH_INTERVAL_MS?`.
   - ✅ `supabase functions deploy cwe-refresh`.
   - ✅ `supabase secrets set --env-file supabase/functions/cwe-refresh/.env`.
   - ⚠️ Pending: register broadcast listener `cwe_events → cwe-refresh` (blocked until Supabase exposes listener tooling for this project).
2. **Nightly Cron**
   - `/api/cron/cwe-backfill` endpoint refreshes all studies (accepts `x-cron-secret` or `Authorization: Bearer` header). Successfully executed Oct 29 manual run (200 status).
   - Vercel `vercel.json` example:
     ```json
     {
       "crons": [
         {
           "path": "/api/cron/cwe-backfill",
           "schedule": "0 3 * * *"
         }
       ]
     }
     ```
   - Configure environment variable `CRON_SECRET` and require it in the cron handler.
3. **Monitoring**
   - Track succeeded vs. failed refreshes via Supabase function logs.
   - Extend `/api/analytics/workload` response metadata to feed automation dashboards.
   - Set `CWE_CRON_ALERT_WEBHOOK_URL` (or fallback `CWE_ALERT_WEBHOOK_URL` / `SLACK_WEBHOOK_URL`) so cron failures raise Slack alerts automatically.

## 9. Runbook — Manual Snapshot Refresh
- Verify latest snapshot timestamp:
  ```sql
  select study_id, computed_at, expires_at
  from study_workload_snapshots
  where study_id = '<study-id>';
  ```
- Trigger refresh on demand:
  ```bash
  curl -X POST 'https://leszzfzjloftinknohen.supabase.co/functions/v1/cwe-refresh' \
    -H 'Authorization: Bearer '"$SERVICE_ROLE_KEY"'' \
    -H 'Content-Type: application/json' \
    -d '{"record":{"table":"coordinator_metrics","event":"INSERT","study_id":"<study-id>"}}'
  ```
- 200 response with `{ "ok": true, "queued": [...] }` indicates success; re-run the SQL to confirm `computed_at` advanced. Leave a note in ops channel if refresh fails so the edge-function logs can be reviewed.