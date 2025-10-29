# cwe-refresh Edge Function

This Supabase Edge function listens for Postgres `cwe_events`, batches any impacted study IDs, and calls the workload refresh API to rebuild cached snapshots.

## Environment Variables

| Variable            | Description                                                          |
|---------------------|----------------------------------------------------------------------|
| `BASE_URL`          | Base URL of the deployed Study Coordinator Pro web app.              |
| `SERVICE_ROLE_KEY`  | Supabase service-role key used to authenticate refresh requests.     |
| `BATCH_INTERVAL_MS` | Optional debounce window (ms) before flushing queued study refreshes.

Copy `.env.example` → `.env` and fill these values before deploying.

## Deployment

1. `cd supabase/functions/cwe-refresh`
2. Deploy the function: `supabase functions deploy cwe-refresh`
3. Set secrets: `supabase secrets set --env-file supabase/functions/cwe-refresh/.env`
4. In Supabase Dashboard, register a webhook/listener on the `cwe_events` channel targeting this function.

## Testing

Invoke manually with a sample payload:

```bash
supabase functions invoke cwe-refresh --data '{"record":{"table":"coordinator_metrics","event":"INSERT","study_id":"00000000-0000-0000-0000-000000000000"}}'
```
