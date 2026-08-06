begin;

-- DEPLOY-PLAN-3 — Production-safe GPS schema, step 3 of 4 (security/RLS).
-- Idempotent re-affirmation of the RLS/grant posture established by step 1,
-- separated into its own file per the ticket's requested structure. Running
-- this after step 1/2 is a no-op if they already set these correctly; it
-- exists so a reviewer can audit "security only" as one isolated diff.

alter table public.campaign_coverage_adjustments enable row level security;
alter table public.campaign_coverage_adjustments force row level security;
alter table public.campaign_coverage_adjustments_log enable row level security;
alter table public.campaign_coverage_adjustments_log force row level security;

-- campaign_zone_progress already has FORCE ROW LEVEL SECURITY on remote
-- (verified via pg_class.relforcerowsecurity = true) — re-affirmed here for
-- completeness, harmless if already set.
alter table public.campaign_zone_progress force row level security;

revoke all on table public.campaign_coverage_adjustments from anon;
revoke all on table public.campaign_coverage_adjustments from authenticated;
grant select on table public.campaign_coverage_adjustments to authenticated;

revoke all on table public.campaign_coverage_adjustments_log from anon;
revoke all on table public.campaign_coverage_adjustments_log from authenticated;
grant select on table public.campaign_coverage_adjustments_log to authenticated;

-- No PUBLIC/anon execute on any of the new SECURITY DEFINER RPCs — every
-- grant in step 2 already targets authenticated/service_role explicitly;
-- this block only guards against a future accidental PUBLIC grant drifting
-- back in (defensive, not expected to change anything today).
do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    where p.proname in (
      'admin_create_coverage_adjustment', 'admin_update_coverage_adjustment', 'admin_revoke_coverage_adjustment',
      'get_campaign_coverage_adjustments', 'calculate_campaign_final_coverage', 'calculate_zone_final_coverage',
      'admin_set_zone_manual_progress', 'admin_clear_zone_manual_progress', 'get_campaign_zone_progress',
      'sync_campaign_zone_progress_cache'
    )
  loop
    execute format('revoke all on function public.%I(%s) from public', v_fn.proname, v_fn.args);
  end loop;
end $$;

commit;
