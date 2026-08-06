begin;

-- DEPLOY-PLAN-3 — Conditional SECURITY DEFINER search_path hardening.
--
-- Renumbered/rewritten from supabase/migrations/20260806000004_harden_security_definer_search_path.sql.
-- That file assumed all 4 flagged functions exist on the target database.
-- Verified via direct read-only pg_catalog query on 2026-08-06:
--   - get_map_sectors(text, double precision, double precision, double precision): EXISTS, search_path unset.
--   - upsert_gtfs_stops_batch(jsonb): EXISTS, search_path unset.
--   - upsert_omi_zones_batch(jsonb): EXISTS, search_path unset.
--   - get_municipalities_in_radius(...): DOES NOT EXIST on the remote database
--     (0 rows for any argument signature) — applying an unconditional
--     ALTER FUNCTION on it, as the original file does, would fail outright.
--
-- Every statement below is wrapped in a DO block that checks pg_proc first:
-- if the function is missing, it is logged via RAISE NOTICE and skipped —
-- never creates a placeholder function, never fails the migration.

do $$
declare
  v_oid oid;
begin
  select oid into v_oid from pg_proc where proname = 'get_map_sectors'
    and pg_get_function_identity_arguments(oid) = 'p_service_type text, p_center_lat double precision, p_center_lng double precision, p_radius_km double precision';
  if v_oid is not null then
    execute 'alter function public.get_map_sectors(text, double precision, double precision, double precision) set search_path = public, pg_temp';
    execute 'revoke execute on function public.get_map_sectors(text, double precision, double precision, double precision) from public';
    execute 'grant execute on function public.get_map_sectors(text, double precision, double precision, double precision) to anon, authenticated, service_role';
    raise notice 'get_map_sectors: search_path fissato e privilegi minimi applicati';
  else
    raise notice 'get_map_sectors: firma attesa non trovata, nessuna azione eseguita (funzione assente o firma diversa)';
  end if;
end $$;

do $$
declare
  v_oid oid;
begin
  select oid into v_oid from pg_proc where proname = 'get_municipalities_in_radius';
  if v_oid is not null then
    execute format('alter function public.get_municipalities_in_radius(%s) set search_path = public, pg_temp', pg_get_function_identity_arguments(v_oid));
    execute format('revoke execute on function public.get_municipalities_in_radius(%s) from public', pg_get_function_identity_arguments(v_oid));
    execute format('grant execute on function public.get_municipalities_in_radius(%s) to anon, authenticated, service_role', pg_get_function_identity_arguments(v_oid));
    raise notice 'get_municipalities_in_radius: search_path fissato e privilegi minimi applicati';
  else
    raise notice 'get_municipalities_in_radius: funzione ASSENTE sul database di destinazione — confermato via audit 2026-08-06. Nessuna funzione placeholder creata. Registrare come "funzione assente" e indagare separatamente se la RPC 003_add_spatial_rpc.sql sia stata applicata sotto un nome/firma diversa (stesso sospetto di collisione di versione della serie 001-003, vedi REMOTE_PRODUCTION_MIGRATION_MATRIX.md).';
  end if;
end $$;

do $$
declare
  v_oid oid;
begin
  select oid into v_oid from pg_proc where proname = 'upsert_gtfs_stops_batch' and pg_get_function_identity_arguments(oid) = 'rows jsonb';
  if v_oid is not null then
    execute 'alter function public.upsert_gtfs_stops_batch(jsonb) set search_path = public, pg_temp';
    execute 'revoke execute on function public.upsert_gtfs_stops_batch(jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.upsert_gtfs_stops_batch(jsonb) to service_role';
    raise notice 'upsert_gtfs_stops_batch: search_path fissato e privilegi minimi applicati';
  else
    raise notice 'upsert_gtfs_stops_batch: firma attesa non trovata, nessuna azione eseguita';
  end if;
end $$;

do $$
declare
  v_oid oid;
begin
  select oid into v_oid from pg_proc where proname = 'upsert_omi_zones_batch' and pg_get_function_identity_arguments(oid) = 'rows jsonb';
  if v_oid is not null then
    execute 'alter function public.upsert_omi_zones_batch(jsonb) set search_path = public, pg_temp';
    execute 'revoke execute on function public.upsert_omi_zones_batch(jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.upsert_omi_zones_batch(jsonb) to service_role';
    raise notice 'upsert_omi_zones_batch: search_path fissato e privilegi minimi applicati';
  else
    raise notice 'upsert_omi_zones_batch: firma attesa non trovata, nessuna azione eseguita';
  end if;
end $$;

commit;
