-- FASE Centro Controllo — persistenza scheduler (Blocco C). PROPOSTA,
-- documenta/rende riproducibile ciò che è già live in produzione (applicato
-- manualmente in una fase precedente): pg_cron/pg_net abilitati, il job
-- 'platform-health-collector-every-5m' schedulato ogni 5 minuti, secret
-- letto da Supabase Vault a runtime. Idempotente per costruzione: puo'
-- essere rieseguita in sicurezza sull'ambiente gia' configurato senza
-- ricreare nulla di duplicato e SENZA toccare il valore del secret gia'
-- presente in Vault.
--
-- NESSUN SECRET IN QUESTO FILE: ne' il valore del secret Vault
-- ('platform_health_collector_secret', creato manualmente via
-- vault.create_secret() in una fase precedente — questa migration non lo
-- crea ne' lo ruota, lo referenzia SOLO per nome), ne' alcuna service-role
-- key. Il cron job stesso legge il secret a runtime tramite
-- vault.decrypted_secrets — il testo del comando persistito in cron.job
-- contiene solo quella query, mai un valore letterale (verificato dal vivo:
-- select command from cron.job non espone mai il secret).
--
-- URL della Edge Function: l'endpoint https://<project-ref>.supabase.co/
-- functions/v1/platform-health-collector NON e' un segreto (stesso host
-- pubblico gia' presente in VITE_SUPABASE_URL, spedito al browser in ogni
-- pagina) — e' l'unico modo praticabile per un cron job SQL di chiamare una
-- Edge Function specifica: pg_net non ha un meccanismo per risolvere l'URL
-- del progetto da una impostazione Postgres generica in questo ambiente
-- (nessuna GUC app.settings.supabase_url configurata), quindi resta
-- letterale nel comando, come gia' avviene nell'installazione live.

-- Idempotente: CREATE EXTENSION IF NOT EXISTS non fallisce se gia' presente
-- (verificato dal vivo: entrambe le extension erano assenti prima
-- dell'attivazione di questa fase, ora presenti).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Fail-closed: se il secret Vault non esiste ancora (es. su un ambiente mai
-- inizializzato da questa fase), la migration si FERMA con un errore
-- esplicito invece di schedulare comunque un job che chiamerebbe la Edge
-- Function con un header vuoto/NULL per sempre ogni 5 minuti — nessun job
-- "silenziosamente rotto" viene mai creato. Il secret stesso NON viene mai
-- creato o modificato qui: la sua creazione resta un'azione amministrativa
-- separata ed esplicita (vault.create_secret(), gia' eseguita manualmente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'platform_health_collector_secret'
  ) THEN
    RAISE EXCEPTION 'platform_health_collector_secret non trovato in Vault: crearlo esplicitamente (vault.create_secret) PRIMA di applicare questa migration. Nessun job schedulato senza un secret reale.';
  END IF;
END;
$$;

-- cron.schedule(job_name, schedule, command) con job_name esplicito e'
-- idempotente per costruzione in pg_cron >= 1.4 (installato: 1.6.4,
-- verificato dal vivo su questo progetto): se un job con questo jobname
-- esiste gia', la chiamata AGGIORNA schedule/command invece di crearne un
-- secondo — mai un duplicato, mai serve un controllo manuale
-- select/delete-prima-di-insert.
SELECT cron.schedule(
  'platform-health-collector-every-5m',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mqkelrsvksrzrpmbstvd.supabase.co/functions/v1/platform-health-collector',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-collector-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'platform_health_collector_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
