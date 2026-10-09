-- 20261009160000_campaign_summary_view_lockdown.sql
--
-- Production (read-only audit, 2026-10-09): view public.campaign_summary
-- (campaigns LEFT JOIN LATERAL latest quote LEFT JOIN campaign_analysis) is
-- owned by postgres without security_invoker, so it reads its base tables with
-- the owner's rights and RLS on campaigns / quotes / campaign_analysis is not
-- applied. anon and authenticated hold arwdDxtm on it (baseline GRANT ALL).
-- As anon, in a read-only transaction: campaign_summary 104 rows,
-- campaigns 0, quotes 0, campaign_analysis 0.
--
-- No caller needs it: no reference in src/ or supabase/functions at the
-- Production SHA 047a764, no function or view depends on it, and
-- pg_stat_statements (since 2026-09-16) shows no reads by authenticated or
-- service_role, only the audit's own anon probes.
--
-- Fix (minimal; reversible; no data, column or other object touched):
--   1. revoke every privilege on the view from anon and authenticated
--      (service_role and postgres keep theirs);
--   2. defence in depth: security_invoker = true, so that any future grant
--      (or a recreate under the public default privileges, which grant ALL to
--      anon/authenticated) evaluates the base tables' RLS as the caller.
-- Idempotent. Rollback:
-- supabase/migrations/rollback/20261009160000_campaign_summary_view_lockdown.rollback.sql

revoke all on table public.campaign_summary from anon, authenticated;

alter view public.campaign_summary set (security_invoker = true);
