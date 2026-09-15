-- RECONSTRUCTED FILE — see "INVESTIGATE 5 REMOTE-ONLY SUPABASE MIGRATIONS"
-- reconciliation ticket (2026-09-15). Applied directly to production 57
-- seconds after 20260831153621_coverage_adjustments_batch.sql (already
-- committed in this repo), name "coverage_batch_trigger_coalesce_fix" per
-- supabase_migrations.schema_migrations. No file for it ever existed here.
--
-- Unlike the VP1 files, this reconstruction is NOT speculative: comparing
-- the already-committed 20260831153621 migration's
-- campaign_coverage_adjustments_sync_trigger() body against the CURRENT
-- live definition (read-only introspection) shows exactly one change —
-- the eager `perform sync_campaign_zone_progress_cache(new.zone_id,
-- coalesce(new.updated_by, new.created_by))` call (the source of this
-- version's name) was replaced with a lazy "mark the zone cache stale"
-- insert/upsert into campaign_zone_progress. That table already exists
-- (created by 20260821211000_remote_baseline.sql) — this file only
-- replaces the trigger function, matching production exactly.
begin;

create or replace function public.campaign_coverage_adjustments_sync_trigger()
returns trigger
  language plpgsql security definer set search_path to ''
as $function$
begin
  if pg_catalog.current_setting('app.coverage_batch_mode', true) = '1' then
    return new;
  end if;
  if new.zone_id is not null then
    insert into public.campaign_zone_progress (campaign_zone_id, campaign_id, source, stale_since)
    values (new.zone_id, new.campaign_id, 'geometric', now())
    on conflict (campaign_zone_id) do update set stale_since = now();
  end if;
  return new;
end;
$function$;
alter function public.campaign_coverage_adjustments_sync_trigger() owner to postgres;

commit;
