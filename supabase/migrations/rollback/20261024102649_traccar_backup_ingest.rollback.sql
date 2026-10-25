-- ATTENZIONE: termina con ROLLBACK = prova a vuoto. Per ripristinare davvero sostituire ROLLBACK con COMMIT.
-- Rollback of 20261024102649_traccar_backup_ingest.sql / VolantiniPro PR #16
-- Ripristino strutturale proposto. NON applicato. Di default termina con ROLLBACK.
-- Solo la sessione database, da integration dopo il merge e con OK esplicito,
-- puo' trasformarlo in una migration compensativa con COMMIT.
-- PRIMA: disabilitare il ricevitore Traccar, fermare i client, chiudere le sole
-- sessioni Piano B e salvare i mapping dispositivi se occorre conservarli.
-- Non usare questo script per chiudere sessioni native o cancellare punti GPS.
-- Rimuove anche l'indice anti-duplicati. Conserva le tre colonne nullable,
-- tutti i punti GPS, sessioni e audit. Non modifica la cronologia migration.
-- Nessun CASCADE: nuove dipendenze non previste devono interrompere il ripristino.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '5s';

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.delivery_sessions
    WHERE metadata->>'source' = 'traccar_admin_backup'
      AND status IN ('started','paused')
  ) THEN
    RAISE EXCEPTION 'STOP: chiudere prima le sessioni Piano B attive';
  END IF;
  IF (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.gps_tracking_points'::regclass
        AND attname IN ('source','source_event_id','source_metadata')
        AND NOT attisdropped) <> 3
    OR EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'public.gps_tracking_points'::regclass
        AND attname IN ('source','source_event_id','source_metadata')
        AND NOT attisdropped AND attnotnull
    ) THEN
    RAISE EXCEPTION 'STOP: attese tre colonne GPS presenti e nullable; nessun ALTER automatico';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.traccar_admin_control(text,uuid,uuid,text,text,integer,uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.traccar_ingest_point(text,text,timestamptz,float8,float8,float8,float8,float8,float8,float8,boolean) RESTRICT;
DROP FUNCTION IF EXISTS traccar_private.admin_control(text,uuid,uuid,text,text,integer,uuid) RESTRICT;
DROP TABLE IF EXISTS public.traccar_devices RESTRICT;
DROP SCHEMA IF EXISTS traccar_private RESTRICT;
DROP INDEX IF EXISTS public.gps_tracking_points_traccar_event_uidx RESTRICT;

DO $verify$
BEGIN
  IF to_regclass('public.traccar_devices') IS NOT NULL
    OR to_regnamespace('traccar_private') IS NOT NULL
    OR to_regclass('public.gps_tracking_points_traccar_event_uidx') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('traccar_admin_control','traccar_ingest_point')
    ) THEN
    RAISE EXCEPTION 'STOP: oggetti Traccar non rimossi completamente';
  END IF;
END
$verify$;
NOTIFY pgrst, 'reload schema';
-- Restano source, source_event_id, source_metadata: non sono cancellati o svuotati.
-- L'eliminazione di traccar_devices perde mapping/hash/finestre, non i punti GPS.
ROLLBACK;
