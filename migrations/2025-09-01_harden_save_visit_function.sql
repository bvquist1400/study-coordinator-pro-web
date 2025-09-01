-- Migration: Harden privileges for save_visit_with_ip_transaction
-- Purpose: Apply least-privilege execution for SECURITY DEFINER function

-- Ensure function exists before altering (will error if missing; order this after creation migration)

-- Restrict execution to service role only
REVOKE ALL ON FUNCTION public.save_visit_with_ip_transaction(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_visit_with_ip_transaction(uuid, uuid, jsonb) TO service_role;

-- Set a safe search_path to limit definer context
ALTER FUNCTION public.save_visit_with_ip_transaction(uuid, uuid, jsonb)
  SET search_path = public, pg_temp;

-- Note: Supabase service role (used by server-side admin client) retains execute privileges.

