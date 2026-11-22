-- 20261122170000_cron_lighten
-- Database piu' leggero (approvato da Fadi il 2026-11-22). Backup: db-backups/2026-11-22-cron-lighten/

-- Stato atteso prima: job 1 '*/5 * * * *', job 5 '15 * * * *', job 7 '30 seconds', job 8 '0 * * * *', tutti attivi.
do $$
begin
  if (select count(*) from cron.job where (jobid, jobname, schedule, active) in (
        (1, 'platform-health-collector-every-5m', '*/5 * * * *', true),
        (5, 'error-log-auto-resolve-hourly', '15 * * * *', true),
        (7, 'chat-realtime-outbox', '30 seconds', true),
        (8, 'chat-realtime-outbox-housekeeping', '0 * * * *', true))) <> 4 then
    raise exception 'STATO_CRON_INATTESO';
  end if;
  if exists (select 1 from public.chat_realtime_outbox) then
    raise exception 'OUTBOX_NON_VUOTO';
  end if;
end $$;

-- 1. Chat non usata dal 2026-10-04: invio realtime e pulizia spenti.
select cron.alter_job(job_id := 7, active := false);
select cron.alter_job(job_id := 8, active := false);

-- 2. Controllo salute ogni 30 minuti (nome del job invariato: alter_job non rinomina).
select cron.alter_job(job_id := 1, schedule := '*/30 * * * *');

-- 3. Chiusura automatica errori una volta al giorno (03:15 UTC).
select cron.alter_job(job_id := 5, schedule := '15 3 * * *');

-- 2b. Storico controllo salute 7 giorni (marcatori di manutenzione 30 giorni).
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
  -- platform_health_checks: 7 giorni (2026-11-22, database piu' leggero).
  -- I marcatori di manutenzione (maintenance_daily_*/maintenance_monthly_*)
  -- restano 30 giorni: il collector rilegge il marcatore del mese precedente.
  delete from public.platform_health_checks
  where (check_name not like 'maintenance_%' and checked_at < now() - interval '7 days')
     or (check_name like 'maintenance_%' and checked_at < now() - interval '30 days');
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
