# cwe-refresh Edge Function

This Supabase Edge function listens for Postgres `cwe_events`, batches any impacted study IDs, and calls the workload refresh API to rebuild cached snapshots.

## Environment Variables

| Variable            | Description                                                                      |
|---------------------|----------------------------------------------------------------------------------|
| `BASE_URL`          | Base URL of the deployed Study Coordinator Pro web app.                          |
| `SERVICE_ROLE_KEY`  | Supabase service-role key used to authenticate refresh requests and REST calls.  |
| `SUPABASE_URL`      | Supabase project URL; used to resolve coordinator assignments via REST.          |
| `BATCH_INTERVAL_MS` | Optional debounce window (ms) before flushing queued study refreshes.            |

Copy `.env.example` → `.env` and fill these values before deploying.

## Deployment

1. `cd supabase/functions/cwe-refresh`
2. Deploy the function: `supabase functions deploy cwe-refresh`
3. Set secrets: `supabase secrets set --env-file supabase/functions/cwe-refresh/.env`
4. Attach the `cwe_events` broadcast channel to this function via Supabase dashboard/CLI once the listener tooling is available (currently pending; manual refresh works via direct invoke).

## Testing

Invoke manually with a sample payload:

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/cwe-refresh' \
  -H 'Authorization: Bearer '"$SERVICE_ROLE_KEY"'' \
  -H 'Content-Type: application/json' \
  -d '{"record":{"table":"coordinator_metrics","event":"INSERT","coordinator_id":"00000000-0000-0000-0000-000000000000"}}'
```

Replace `<project-ref>` and IDs with real values. A 200 response with `{ "ok": true, "queued": [...] }` confirms the function processed the event; check `study_workload_snapshots` for a fresh `computed_at`.
