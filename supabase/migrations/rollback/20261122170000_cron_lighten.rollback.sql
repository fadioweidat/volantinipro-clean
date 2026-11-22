-- 20261122170000_cron_lighten.rollback
-- Database piu' leggero (approvato da Fadi il 2026-11-22). Backup: db-backups/2026-11-22-cron-lighten/

-- Riporta i 4 job e la funzione di pulizia allo stato di prima.
select cron.alter_job(job_id := 7, schedule := '30 seconds', active := true);
select cron.alter_job(job_id := 8, schedule := '0 * * * *', active := true);
select cron.alter_job(job_id := 1, schedule := '*/5 * * * *', active := true);
select cron.alter_job(job_id := 5, schedule := '15 * * * *', active := true);

CREATE OR REPLACE FUNCTION public.cleanup_monitoring_retention()
 RETURNS TABLE(table_name text, deleted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- Solo la chat (se torna in uso):
--   select cron.alter_job(job_id := 7, active := true);
--   select cron.alter_job(job_id := 8, active := true);
