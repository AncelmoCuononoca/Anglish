-- ============================================================
--  Security hardening — applied to production 2026-07-12
-- ============================================================
-- Fixes a critical privilege escalation and locks down SECURITY DEFINER
-- functions that PostgREST exposed to the public `anon`/`authenticated` roles
-- via /rest/v1/rpc/<name>. No application code calls these via .rpc(), so
-- revoking EXECUTE breaks nothing. Trigger/event-trigger functions keep firing
-- normally — Postgres does not check EXECUTE privilege for trigger execution.

-- CRITICAL: anyone could POST /rest/v1/rpc/set_admin_role with their own user_id
-- and gain role=admin in their JWT (→ read every profile's email / stripe id and
-- every booking's WhatsApp, and tamper with any account's access window).
REVOKE EXECUTE ON FUNCTION public.set_admin_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_admin_role(uuid) TO service_role;

-- IDOR / gamification tampering: any user could bump anyone's XP & streak.
REVOKE EXECUTE ON FUNCTION public.add_xp(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_xp(uuid, integer) TO service_role;

-- Leaderboard RPC bypassed RLS; unused via RPC.
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_leaderboard(integer) TO service_role;

-- Trigger functions: never meant to be callable directly via RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Pin search_path on the SECURITY DEFINER functions (prevents search_path
-- hijacking). All object references inside these functions are schema-qualified.
ALTER FUNCTION public.set_admin_role(uuid)     SET search_path = pg_catalog;
ALTER FUNCTION public.add_xp(uuid, integer)    SET search_path = pg_catalog;
ALTER FUNCTION public.get_leaderboard(integer) SET search_path = pg_catalog;

-- Least privilege: anon should not hold UPDATE on profiles.role. Note: anon also
-- has Supabase's default table-level GRANT ALL on public.profiles, which RLS
-- fully neutralizes (no anon policy matches), so this column revoke is belt-and-
-- braces. `authenticated` already lacks UPDATE on the role column, so an
-- escalated JWT still cannot rewrite its own role.
REVOKE UPDATE (role) ON public.profiles FROM anon;

-- ------------------------------------------------------------
-- Manual step (Supabase dashboard, cannot be done in SQL):
--   Authentication → Providers → Email → enable "Leaked password protection"
--   (checks new passwords against HaveIBeenPwned).
-- ------------------------------------------------------------
