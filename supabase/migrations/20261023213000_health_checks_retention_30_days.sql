-- platform_health_checks: retention da 90 a 30 giorni (pulizia spazio DB, approvata 2026-10-22).
-- ~2.000 righe/giorno: 90 giorni ~45 MB, 30 giorni ~15 MB. Le altre tabelle restano invariate.
-- Backup delle righe rimosse: db-backups/2026-10-22/data.sql (locale, fuori da git).
-- Ripristino: rieseguire la funzione di 20260826210000_monitoring_retention.sql (interval '90 days').
CREATE OR REPLACE FUNCTION "public"."cleanup_monitoring_retention"()
    RETURNS TABLE("table_name" text, "deleted_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_health_deleted integer;
  v_incidents_deleted integer;
  v_error_log_deleted integer;
  v_site_events_deleted integer;
begin
  -- platform_health_checks: 30 giorni, append-only per design (nessuna riga
  -- 'open'/protetta da preservare oltre la finestra).
  delete from public.platform_health_checks
  where checked_at < now() - interval '30 days';
  get diagnostics v_health_deleted = row_count;

  -- platform_incidents: 365 giorni, SOLO status='resolved'. Un incidente
  -- 'open' non ha mai resolved_at valorizzato (CHECK constraint), quindi
  -- "resolved_at < cutoff" da solo e' gia' fail-safe — il filtro esplicito
  -- su status resta comunque come difesa in profondita' leggibile.
  delete from public.platform_incidents
  where status = 'resolved'
    and resolved_at < now() - interval '365 days';
  get diagnostics v_incidents_deleted = row_count;

  -- error_log: 90 giorni su created_at (stesso criterio gia' documentato
  -- nel commento della tabella, mai applicato finora).
  delete from public.error_log
  where created_at < now() - interval '90 days';
  get diagnostics v_error_log_deleted = row_count;

  -- site_events: 180 giorni su created_at.
  delete from public.site_events
  where created_at < now() - interval '180 days';
  get diagnostics v_site_events_deleted = row_count;

  return query
    select 'platform_health_checks'::text, v_health_deleted
    union all
    select 'platform_incidents'::text, v_incidents_deleted
    union all
    select 'error_log'::text, v_error_log_deleted
    union all
    select 'site_events'::text, v_site_events_deleted;
end;
$$;

ALTER FUNCTION "public"."cleanup_monitoring_retention"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."cleanup_monitoring_retention"() IS 'Retention automatica giornaliera (platform_health_checks 30gg, platform_incidents risolti 365gg, error_log 90gg, site_events 180gg). Mai un incidente aperto. Nessun DELETE eseguito dall''applicazione di questa migration: va invocata esplicitamente (cron o admin).';

-- Nessun accesso anon/authenticated diretto: questa funzione cancella dati
-- storici su 4 tabelle, non e' un'operazione da esporre a nessun ruolo
-- applicativo. Solo postgres/service_role possono eseguirla (il cron gira
-- come postgres by design in pg_cron su Supabase).
REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM "authenticated";
