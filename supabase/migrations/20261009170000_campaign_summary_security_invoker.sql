-- 20261009170000_campaign_summary_security_invoker.sql
--
-- Phase 3B.4-V. public.campaign_summary (campaigns LEFT JOIN LATERAL latest
-- quote LEFT JOIN campaign_analysis) is owned by postgres and has no
-- security_invoker, so it is evaluated with the owner's rights and bypasses
-- the RLS of all three tables. anon and authenticated hold SELECT (and every
-- other privilege) on it. Read-only Production audit, 2026-10-09: as anon the
-- view returns 104 of 104 campaigns (user_id, title, status, quote amounts,
-- analysis incl. raw_inputs), while public.campaigns returns 0. Any signed-in
-- customer reads every campaign the same way.
--
-- No Production code, edge function, SQL function, view or cron job reads the
-- view (repository + deployed sources + pg_catalog); pg_stat_statements since
-- 2026-09-16 shows only audit probes.
--
-- Fix (minimal; reversible; no data or definition change):
--   1. security_invoker = true: the view is evaluated with the caller's rights,
--      so the existing RLS of campaigns / quotes / campaign_analysis applies
--      (owners see only their own rows; service_role/postgres unchanged);
--   2. anon loses every privilege on the view (no legitimate anonymous use);
--   3. authenticated keeps SELECT only (the view is not updatable; the other
--      privileges are useless).
-- The view definition, owner, base tables and their policies are not touched.
-- Idempotent. Rollback:
-- supabase/migrations/rollback/20261009170000_campaign_summary_security_invoker.rollback.sql

alter view public.campaign_summary set (security_invoker = true);

revoke all on table public.campaign_summary from anon;
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.campaign_summary from authenticated;
