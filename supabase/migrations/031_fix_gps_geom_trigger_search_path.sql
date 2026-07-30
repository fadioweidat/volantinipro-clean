begin;

-- GPS PHASE 5 — Fix PostGIS Trigger Search Path.
--
-- Causa esatta (verificata in sola lettura su produzione il 2026-07-30 via
-- supabase db dump --schema-only + query read-only su pg_proc/pg_extension):
-- set_gps_tracking_point_geom() non ha search_path esplicito e chiama
-- ST_SetSRID/ST_MakePoint senza qualificare lo schema. Quando il trigger
-- (BEFORE INSERT OR UPDATE OF lat, lng su gps_tracking_points) viene
-- attivato durante l'esecuzione di gps_insert_point() — che imposta
-- search_path='' per hardening, come tutte le RPC GPS riconciliate in
-- GPS PHASE 4 — il search_path vuoto si propaga al trigger (le funzioni
-- senza una propria clausola SET ereditano il search_path attivo nel
-- contesto chiamante) e ST_MakePoint non viene risolta: l'INSERT del
-- punto GPS fallisce con "function st_makepoint(...) does not exist".
-- Riprodotto in isolamento durante GPS PHASE 4 con un test minimale
-- indipendente dalla RPC (SET LOCAL search_path TO ''; INSERT ...).
--
-- L'estensione PostGIS in produzione e' installata nello schema "public"
-- (verificato via query read-only: pg_extension.extnamespace = public,
-- st_makepoint anch'essa in public, versione 3.3.7) — non "extensions"
-- come nell'esempio generico del ticket. Fix: search_path esplicito e
-- sicuro sulla funzione trigger, piu' le due chiamate PostGIS
-- schema-qualified con public., cosi' la funzione risolve correttamente
-- indipendentemente dal search_path del chiamante.
--
-- Scope: sostituisce SOLO set_gps_tracking_point_geom(). CREATE OR REPLACE
-- preserva OID, owner e ACL esistenti (nessun GRANT/REVOKE necessario o
-- eseguito: restano ALL a anon/authenticated/service_role, identici a
-- produzione). Nessuna tabella ricreata, nessun dato toccato, nessuna RLS
-- toccata, nessuna delle RPC GPS riconciliate in GPS PHASE 4 modificata.
--
-- Altri trigger con lo stesso pattern strutturale (nessun search_path
-- esplicito, chiamate ST_* non qualificate) esistono ma sono fuori scope:
-- sync_address_points_geom, sync_gtfs_stop_geom, sync_poi_cache_geom
-- servono il dominio territoriale/POI/GTFS (Step 1-4), non il tracking
-- GPS, e nessun chiamante noto li invoca con search_path=''. Non toccati.

create or replace function public.set_gps_tracking_point_geom()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.geom := public.ST_SetSRID(public.ST_MakePoint(new.lng, new.lat), 4326);
  return new;
end;
$$;

commit;
