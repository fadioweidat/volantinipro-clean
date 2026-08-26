-- FASE Centro Controllo — retention automatica sicura (Blocco D/F).
-- Crea SOLO la funzione di pulizia + il job pg_cron separato che la
-- richiama una volta al giorno. NON esegue alcun DELETE al momento
-- dell'applicazione di questa migration: la funzione va invocata (dal cron,
-- o manualmente da un admin) per avere effetto.
--
-- Colonne di retention verificate live sullo schema reale (information_schema,
-- non assunte):
--   platform_health_checks.checked_at   (timestamptz, gia' NOT NULL)
--   platform_incidents.resolved_at      (timestamptz, nullable — NULL per
--                                         costruzione quando status='open',
--                                         vedi CHECK platform_incidents_
--                                         resolved_consistency_check nella
--                                         migration che ha creato la tabella)
--   error_log.created_at                (timestamptz)
--   site_events.created_at              (timestamptz)
--
-- platform_incidents: la clausola WHERE status = 'resolved' e' la garanzia
-- primaria contro la cancellazione di un incidente aperto (mai possibile:
-- un incidente 'open' ha sempre resolved_at NULL per il CHECK constraint
-- gia' in produzione, quindi anche senza il filtro su status non
-- soddisferebbe mai "resolved_at < cutoff" — il filtro su status resta
-- comunque esplicito per chiarezza e difesa in profondita', non per
-- necessita' stretta).

-- SECURITY DEFINER giustificato: la funzione deve poter cancellare righe da
-- 4 tabelle la cui RLS (platform_health_checks/platform_incidents:
-- admin-only; error_log: admin-only oltre l'insert pubblico; site_events:
-- admin-only oltre l'insert pubblico) altrimenti richiederebbe che il
-- chiamante sia un admin autenticato — il cron gira invece come postgres/
-- service_role, che bypassa comunque la RLS, ma dichiarare SECURITY DEFINER
-- + search_path esplicito rende la funzione anche richiamabile in modo
-- controllato da un admin autenticato in futuro (es. da un pulsante "pulisci
-- ora" nel Centro Controllo), senza dover ri-concedere privilegi ampi.
-- Nessun accesso anon: vedi REVOKE/GRANT in fondo al file.
-- BATCHING (Blocco E): DELETE singolo per tabella, non a batch. Volume
-- stimato al regime attuale (collector ogni 5 minuti): ~2.000 righe/giorno
-- su platform_health_checks, il volume di gran lunga maggiore delle 4
-- tabelle — con retention a 90 giorni la tabella si stabilizza attorno a
-- ~180.000 righe, un DELETE su quell'ordine di grandezza (con indice su
-- checked_at gia' presente: platform_health_checks_checked_at_idx) e'
-- rapido e non giustifica la complessita' di un batching a lotti. Le altre
-- 3 tabelle hanno volumi ordini di grandezza inferiori. Se il volume
-- dovesse crescere significativamente in futuro (es. cadenza del collector
-- ridotta sotto i 5 minuti, o retention estesa), rivalutare con un batching
-- esplicito — non necessario oggi. La funzione e' comunque idempotente e
-- ri-eseguibile in sicurezza quante volte serve (ogni esecuzione cancella
-- solo cio' che e' realmente oltre la soglia in quel momento).
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
  -- platform_health_checks: 90 giorni, append-only per design (nessuna riga
  -- 'open'/protetta da preservare oltre la finestra).
  delete from public.platform_health_checks
  where checked_at < now() - interval '90 days';
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

COMMENT ON FUNCTION "public"."cleanup_monitoring_retention"() IS 'Retention automatica giornaliera (platform_health_checks 90gg, platform_incidents risolti 365gg, error_log 90gg, site_events 180gg). Mai un incidente aperto. Nessun DELETE eseguito dall''applicazione di questa migration: va invocata esplicitamente (cron o admin).';

-- Nessun accesso anon/authenticated diretto: questa funzione cancella dati
-- storici su 4 tabelle, non e' un'operazione da esporre a nessun ruolo
-- applicativo. Solo postgres/service_role possono eseguirla (il cron gira
-- come postgres by design in pg_cron su Supabase).
REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_monitoring_retention"() FROM "authenticated";

-- Job pg_cron SEPARATO dal collector (mai lo stesso jobname, mai la stessa
-- cadenza): una volta al giorno alle 03:30 UTC, orario a basso traffico.
-- Nessun HTTP/pg_net qui: la funzione e' richiamata DIRETTAMENTE via SQL
-- (cron.schedule esegue query SQL native), quindi nessun secret/Vault/
-- endpoint e' necessario per questo job — a differenza del collector, che
-- deve raggiungere una Edge Function via rete e quindi autenticarsi.
--
-- Idempotente: cron.schedule(job_name, schedule, command) con job_name
-- esplicito aggiorna un job esistente con lo stesso nome invece di
-- duplicarlo (stesso comportamento gia' verificato dal vivo per il
-- collector in 20260826180000_platform_health_collector_scheduler.sql).
SELECT cron.schedule(
  'platform-monitoring-retention-daily',
  '30 3 * * *',
  $cron$SELECT public.cleanup_monitoring_retention();$cron$
);
