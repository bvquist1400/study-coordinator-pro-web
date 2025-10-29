# CWET Refresh Edge Function

This Supabase Edge function listens for `cwe_events` notifications, batches affected studies, and calls the workload refresh API to regenerate cached snapshots.

## Environment Variables

- `BASE_URL` – base URL for the deployed Study Coordinator Pro web app.
- `SERVICE_ROLE_KEY` – Supabase service-role key used when calling `/api/analytics/workload/refresh`.
- `BATCH_INTERVAL_MS` – optional debounce window in milliseconds (default 15000).

## Deployment Steps

1. Copy `.env.example` → `.env`, populate values.
2. Deploy the function: `supabase functions deploy cwe-refresh`.
3. Set secrets via CLI: `supabase secrets set --env-file supabase/functions/cwe-refresh/.env`.
4. In Supabase Dashboard, add a webhook/listener for the `cwe_events` channel pointing to this function.

## Local Testing

Invoke locally with a sample payload:

```sh
supabase functions invoke cwe-refresh --data '{"record":{"table":"coordinator_metrics","event":"INSERT","study_id":"..."}}'
```
