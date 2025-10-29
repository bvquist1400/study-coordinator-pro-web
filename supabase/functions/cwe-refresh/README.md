# CWET Refresh Edge Function

This Supabase Edge function listens for `cwe_events` Postgres notifications, batches affected studies, and calls the workload refresh API to regenerate snapshots.

## Environment Variables

- `BASE_URL` – base URL for the deployed Study Coordinator Pro web app (e.g., `https://app.example.com`).
- `SERVICE_ROLE_KEY` – Supabase service-role key used to authenticate against `/api/analytics/workload/refresh`.
- `BATCH_INTERVAL_MS` – optional debounce window (default 15000 ms) used to batch multiple events.

## Deployment

1. Ensure database migrations creating the `cwe_events` triggers and `study_workload_snapshots` table are applied.
2. Deploy the function via Supabase CLI: `supabase functions deploy cwe-refresh`.
3. Configure environment variables: `supabase secrets set --env-file supabase/functions/cwe-refresh/.env`.
4. Create a database trigger to call the function using `supabase functions invoke` or Supabase's webhook integration listening to the `cwe_events` channel.

## Local Testing

You can simulate an event by invoking the function directly:

```sh
supabase functions invoke cwe-refresh --data '{"record":{"table":"coordinator_metrics","event":"INSERT","study_id":"..."}}'
```

Check Supabase function logs for batching behavior and refresh results.
