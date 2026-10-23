-- cron.job_run_details: storico delle esecuzioni pg_cron, mai pulito (18.770 righe dal 26/08, 17 MB).
-- Pulizia approvata 2026-10-23: si tiene una settimana (basta per diagnosticare un job), il resto si cancella
-- ogni giorno alle 03:45 UTC, dopo la retention del monitoraggio (03:30) e analytics_prune (03:15).
-- net._http_response non serve: pg_net cancella già da solo le risposte dopo 6 ore (pg_net.ttl).
-- Idempotente: cron.schedule con lo stesso jobname aggiorna il job esistente.
-- Ripristino: select cron.unschedule('cron-run-details-retention-daily');

SELECT cron.schedule(
  'cron-run-details-retention-daily',
  '45 3 * * *',
  $cron$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';$cron$
);
