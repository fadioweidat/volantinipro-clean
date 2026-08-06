-- DEPLOY-PLAN-3 — Production-safe GPS schema, step 4 of 4 (post-migration verification).
-- NOT a schema migration: contains only read-only SELECT statements. Not
-- meant to be applied via `supabase db push` as a numbered migration in the
-- normal sense — run manually (`supabase db query --linked -f ...` or via
-- psql) immediately after steps 1-3 to confirm the expected end state.
-- Safe to run any number of times, changes nothing.

-- 1) Objects exist
select 'campaign_coverage_adjustments' as object, to_regclass('public.campaign_coverage_adjustments') is not null as exists
union all select 'campaign_coverage_adjustments_log', to_regclass('public.campaign_coverage_adjustments_log') is not null
union all select 'calculate_zone_final_coverage()', exists(select 1 from pg_proc where proname = 'calculate_zone_final_coverage')
union all select 'calculate_campaign_final_coverage()', exists(select 1 from pg_proc where proname = 'calculate_campaign_final_coverage')
union all select 'admin_create_coverage_adjustment()', exists(select 1 from pg_proc where proname = 'admin_create_coverage_adjustment')
union all select 'sync trigger', exists(
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'campaign_coverage_adjustments' and t.tgname = 'campaign_coverage_adjustments_sync_zone_cache'
);

-- 2) effective_percent is a plain column, single writer, no duplicate trigger
select column_name, is_generated
from information_schema.columns
where table_schema = 'public' and table_name = 'campaign_zone_progress' and column_name = 'effective_percent';

select tgname, count(*) as occurrences
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'campaign_zone_progress' and not t.tgisinternal
group by tgname
having count(*) > 1; -- expect ZERO rows: no trigger should be duplicated

-- 3) admin_set_zone_manual_progress has the new 6-arg signature, old 3-arg gone
select pg_get_function_identity_arguments(oid) as args
from pg_proc where proname = 'admin_set_zone_manual_progress';

-- 4) gps_tracking_points / delivery_sessions row counts unchanged by this
--    chain (compare manually against the pre-migration count recorded in
--    REMOTE_PRODUCTION_MIGRATION_MATRIX.md: 421 / 39)
select 'gps_tracking_points' as t, count(*) as n from public.gps_tracking_points
union all select 'delivery_sessions', count(*) from public.delivery_sessions
union all select 'campaign_zone_progress', count(*) from public.campaign_zone_progress
union all select 'campaign_coverage_adjustments', count(*) from public.campaign_coverage_adjustments;

-- 5) RLS forced on the new tables
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('campaign_coverage_adjustments', 'campaign_coverage_adjustments_log', 'campaign_zone_progress');
