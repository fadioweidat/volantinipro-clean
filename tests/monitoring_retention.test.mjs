// FASE Centro Controllo — retention automatica sicura. Source-text/contract
// tests sulla migration (nessun DB live in CI, stesso approccio gia' in uso
// nel resto del progetto per le migration SQL).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260826210000_monitoring_retention.sql", import.meta.url), "utf8");
const collectorSchedulerMigration = readFileSync(new URL("../supabase/migrations/20260826180000_platform_health_collector_scheduler.sql", import.meta.url), "utf8");

const fnBody = migration.slice(migration.indexOf("AS $$"), migration.indexOf("$$;\n\nALTER FUNCTION"));

// 1. retention health = 90d
test("1. platform_health_checks: retention 90 giorni su checked_at", () => {
  assert.match(fnBody, /delete from public\.platform_health_checks\s*\n\s*where checked_at < now\(\) - interval '90 days';/);
});

// 2. incidents = 365d
test("2. platform_incidents: retention 365 giorni su resolved_at (colonna reale verificata, non assunta)", () => {
  assert.match(fnBody, /delete from public\.platform_incidents\s*\n\s*where status = 'resolved'\s*\n\s*and resolved_at < now\(\) - interval '365 days';/);
});

// 3. incidenti aperti mai eliminati
test("3. Il DELETE su platform_incidents e' vincolato a status='resolved': un incidente 'open' non puo' mai essere cancellato da questa funzione", () => {
  const incidentsDeleteBlock = fnBody.match(/delete from public\.platform_incidents[\s\S]*?get diagnostics v_incidents_deleted = row_count;/)[0];
  assert.match(incidentsDeleteBlock, /status = 'resolved'/);
  assert.doesNotMatch(incidentsDeleteBlock, /status = 'open'/);
});

// 4. error_log = 90d
test("4. error_log: retention 90 giorni su created_at", () => {
  assert.match(fnBody, /delete from public\.error_log\s*\n\s*where created_at < now\(\) - interval '90 days';/);
});

// 5. site_events = 180d
test("5. site_events: retention 180 giorni su created_at", () => {
  assert.match(fnBody, /delete from public\.site_events\s*\n\s*where created_at < now\(\) - interval '180 days';/);
});

// 6. cron name deterministico
test("6. Il job di retention ha un nome deterministico distinto dal collector", () => {
  assert.match(migration, /'platform-monitoring-retention-daily'/);
  assert.doesNotMatch(migration, /'platform-health-collector-every-5m'/);
});

// 7. schedule 30 3 * * *
test("7. Lo schedule del job di retention e' esattamente '30 3 * * *' (03:30 UTC, una volta al giorno)", () => {
  assert.match(migration, /'30 3 \* \* \*'/);
  assert.doesNotMatch(migration, /'\*\/5 \* \* \* \*'/);
});

// 8. nessun secret/token nella migration
test("8. Nessun secret/token/Vault lookup nella migration di retention: il job chiama la funzione SQL direttamente, nessun HTTP", () => {
  assert.doesNotMatch(migration, /vault\.decrypted_secrets/);
  assert.doesNotMatch(migration, /net\.http_post/);
  assert.doesNotMatch(migration, /x-collector-secret/);
  assert.doesNotMatch(migration, /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
  assert.match(migration, /SELECT public\.cleanup_monitoring_retention\(\);/);
});

// 9. nessun grant anon
test("9. Nessun GRANT/policy per 'anon' o 'authenticated' sulla funzione di retention: REVOKE espliciti presenti", () => {
  assert.doesNotMatch(migration, /GRANT[^;]*TO "anon"/);
  assert.doesNotMatch(migration, /GRANT[^;]*TO "authenticated"/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."cleanup_monitoring_retention"\(\) FROM "anon"/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."cleanup_monitoring_retention"\(\) FROM "authenticated"/);
  assert.match(migration, /REVOKE ALL ON FUNCTION "public"\."cleanup_monitoring_retention"\(\) FROM PUBLIC/);
});

// 10. collector cron non modificato
test("10. La migration di retention non tocca/ridefinisce il job del collector (file separato, nessun cron.unschedule/alter sul job esistente)", () => {
  assert.doesNotMatch(migration, /platform-health-collector-every-5m/);
  assert.doesNotMatch(migration, /cron\.unschedule/);
  assert.doesNotMatch(migration, /cron\.alter_job/);
  // Il file dello scheduler del collector (fase precedente) resta intatto,
  // separato, mai riferito da questa migration.
  assert.match(collectorSchedulerMigration, /'platform-health-collector-every-5m'/);
});

// Contratti aggiuntivi: search_path esplicito, SECURITY DEFINER giustificato,
// funzione idempotente (CREATE OR REPLACE), ritorna conteggi.
test("search_path esplicito sulla funzione SECURITY DEFINER (stesso pattern gia' usato per gps_recover_abandoned_session)", () => {
  assert.match(migration, /SET "search_path" TO 'public'/);
});

test("cron.schedule() per il job di retention usa la forma a 3 argomenti (job_name esplicito), idempotente per nome come il collector", () => {
  assert.match(migration, /SELECT cron\.schedule\(\s*\n\s*'platform-monitoring-retention-daily',\s*\n\s*'30 3 \* \* \*',/);
});

test("La funzione ritorna i conteggi eliminati per tabella (table_name, deleted_count), nessun valore silenzioso", () => {
  assert.match(migration, /RETURNS TABLE\("table_name" text, "deleted_count" integer\)/);
  assert.match(fnBody, /get diagnostics v_health_deleted = row_count;/);
  assert.match(fnBody, /get diagnostics v_incidents_deleted = row_count;/);
  assert.match(fnBody, /get diagnostics v_error_log_deleted = row_count;/);
  assert.match(fnBody, /get diagnostics v_site_events_deleted = row_count;/);
});
