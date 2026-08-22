begin;

-- FINAL-PRE-DEPLOY-FIXES — harden the 4 SECURITY DEFINER functions found by
-- FINAL_PRE_DEPLOY_AUDIT_REPORT.md with no fixed search_path:
--   get_map_sectors, get_municipalities_in_radius (both called by the client,
--   confirmed via network logs in Step 2), upsert_gtfs_stops_batch,
--   upsert_omi_zones_batch (import-only, service_role).
--
-- Following the existing "reconcile_*" convention in this repository
-- (e.g. 20260731000001_reconcile_jwt_is_admin_profiles_role.sql): the
-- original migrations (003, 009, 010, 011) are not rewritten — they may
-- already be applied elsewhere — this migration only ALTERs the already
-- live functions. No functional/SQL body change, no signature change.
--
-- Neither function contains dynamic SQL (grep verified: no EXECUTE/format()
-- in their defining migrations), so the only risk this closes is
-- search_path hijacking (a SECURITY DEFINER function with no fixed
-- search_path resolves unqualified identifiers against whatever search_path
-- the CALLING session has set, not the definer's).

alter function public.get_map_sectors(text, double precision, double precision, double precision)
  set search_path = public, pg_temp;

alter function public.get_municipalities_in_radius(double precision, double precision, double precision)
  set search_path = public, pg_temp;

alter function public.upsert_gtfs_stops_batch(jsonb)
  set search_path = public, pg_temp;

alter function public.upsert_omi_zones_batch(jsonb)
  set search_path = public, pg_temp;

-- Privilegi minimi: nessuna delle quattro aveva mai un proacl esplicito
-- (nessuna riga in pg_proc.proacl), quindi ereditavano il default Postgres
-- "EXECUTE to PUBLIC" per qualunque funzione appena creata. Sostituito con
-- grant espliciti solo ai ruoli che le usano davvero.

-- get_map_sectors / get_municipalities_in_radius: lette dal client (visitatori
-- anonimi in Step 2 inclusi, stesso pattern di analysis-istat/get_nil_breakdown_in_radius).
revoke execute on function public.get_map_sectors(text, double precision, double precision, double precision) from public;
grant execute on function public.get_map_sectors(text, double precision, double precision, double precision)
  to anon, authenticated, service_role;

revoke execute on function public.get_municipalities_in_radius(double precision, double precision, double precision) from public;
grant execute on function public.get_municipalities_in_radius(double precision, double precision, double precision)
  to anon, authenticated, service_role;

-- upsert_gtfs_stops_batch / upsert_omi_zones_batch: solo script di import
-- (chiave service_role, mai chiamati dal client) — nessun accesso anon/authenticated.
revoke execute on function public.upsert_gtfs_stops_batch(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_gtfs_stops_batch(jsonb) to service_role;

revoke execute on function public.upsert_omi_zones_batch(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_omi_zones_batch(jsonb) to service_role;

commit;
