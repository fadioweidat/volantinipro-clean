// FASE Centro Controllo — persistenza configurazione (scheduler versionato +
// config.toml verify_jwt). Source-text/contract tests (nessun DB live in
// CI, stesso approccio gia' in uso in gps_zombie_prevention.test.mjs /
// platform_monitoring_history_alerts.test.mjs) + pure-function checks su
// healthHistory.js (source='collector' only per l'uptime ufficiale).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { OFFICIAL_UPTIME_SOURCE, computeUptimeForWindow, UPTIME_WINDOWS_MS } from "../src/lib/monitoring/healthHistory.js";
import { ALERT_RULES, PROVIDER_REQUIREMENT } from "../src/lib/monitoring/alertRules.js";
import { normalizeCheckResults } from "../src/lib/monitoring/healthCollectorClient.js";

const configToml = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const schedulerMigration = readFileSync(new URL("../supabase/migrations/20260826180000_platform_health_collector_scheduler.sql", import.meta.url), "utf8");
const collectorSource = readFileSync(new URL("../supabase/functions/platform-health-collector/index.ts", import.meta.url), "utf8");

const NOW = new Date("2026-08-26T19:00:00.000Z");

// 1. collector config verify_jwt=false dichiarata
test("1. supabase/config.toml dichiara verify_jwt=false per platform-health-collector (config canonica versionata)", () => {
  const section = configToml.match(/\[functions\.platform-health-collector\][\s\S]*?(?=\n\[|\n*$)/);
  assert.ok(section, "sezione [functions.platform-health-collector] non trovata in config.toml");
  assert.match(section[0], /verify_jwt\s*=\s*false/);
});

// 2. migration scheduler non contiene secret hardcoded
test("2. La migration dello scheduler non contiene alcun valore letterale di secret, solo il nome del Vault secret", () => {
  // Nessun pattern tipico di JWT/apikey/service-role-key incollato come stringa.
  assert.doesNotMatch(schedulerMigration, /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
  assert.doesNotMatch(schedulerMigration, /sb_(secret|publishable)_[a-zA-Z0-9_-]+/);
  assert.doesNotMatch(schedulerMigration, /service_role_key\s*[:=]\s*['"]/i);
  // Il secret entra SOLO tramite un lookup a Vault per nome.
  assert.match(schedulerMigration, /vault\.decrypted_secrets WHERE name = 'platform_health_collector_secret'/);
  // La migration non crea/ruota mai il secret stesso (solo la INVOCAZIONE
  // reale, non un commento che spiega perche' non va fatto qui).
  assert.doesNotMatch(schedulerMigration, /SELECT\s+vault\.create_secret\(/i);
  assert.doesNotMatch(schedulerMigration, /PERFORM\s+vault\.create_secret\(/i);
});

// 3. cron name deterministico
test("3. Il nome del job cron e' deterministico e corrisponde esattamente a quello gia' live", () => {
  assert.match(schedulerMigration, /'platform-health-collector-every-5m'/);
});

// 4. schedule */5 * * * *
test("4. Lo schedule e' esattamente */5 * * * * (ogni 5 minuti)", () => {
  assert.match(schedulerMigration, /'\*\/5 \* \* \* \*'/);
});

// 5. Vault secret letto per nome
test("5. Il secret e' letto da Vault per NOME a runtime, mai passato come valore letterale nel comando del job", () => {
  const cronCommandMatch = schedulerMigration.match(/SELECT cron\.schedule\([\s\S]*?\);\s*$/);
  assert.ok(cronCommandMatch);
  assert.match(cronCommandMatch[0], /decrypted_secret FROM vault\.decrypted_secrets/);
});

// 6. migration idempotente / duplicate-safe
test("6. La migration e' idempotente: CREATE EXTENSION IF NOT EXISTS, cron.schedule() per nome (upsert), fail-closed se il secret manca", () => {
  assert.match(schedulerMigration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(schedulerMigration, /CREATE EXTENSION IF NOT EXISTS pg_net/);
  // Guardia fail-closed: nessun job schedulato se il secret Vault non esiste.
  assert.match(schedulerMigration, /IF NOT EXISTS \(\s*SELECT 1 FROM vault\.secrets WHERE name = 'platform_health_collector_secret'\s*\)/);
  assert.match(schedulerMigration, /RAISE EXCEPTION/);
});

test("6b. cron.schedule() e' chiamato con la forma a 3 argomenti (job_name, schedule, command): idempotente per nome in pg_cron >=1.4 (nessun DELETE/INSERT manuale necessario)", () => {
  assert.match(schedulerMigration, /SELECT cron\.schedule\(\s*\n\s*'platform-health-collector-every-5m',\s*\n\s*'\*\/5 \* \* \* \*',/);
});

// 7. provider opzionali non inclusi nel collector
test("7. Il collector (Edge Function) non controlla mai i provider opzionali: nessun check_name 'provider_*' nel suo ALERT_RULES/risultati", () => {
  assert.doesNotMatch(collectorSource, /provider_/);
  assert.doesNotMatch(collectorSource, /mapbox|googlePlaces|foursquare|resend|openai/i);
});

test("7b. Lato client, i provider sono tutti OPTIONAL oggi (nessun requirement inventato) e non alertable", () => {
  for (const name of ["mapbox", "googlePlaces", "foursquare", "resend", "openai"]) {
    assert.equal(PROVIDER_REQUIREMENT[name], "optional");
    assert.equal(ALERT_RULES[`provider_${name}`].alertable, false);
  }
});

// 8. uptime usa solo source='collector'
test("8. computeUptimeForWindow() usa esclusivamente source='collector' per l'uptime ufficiale", () => {
  assert.equal(OFFICIAL_UPTIME_SOURCE, "collector");
  const rows = [
    { status: "ok", source: "collector", checked_at: new Date(NOW.getTime() - 60000).toISOString() },
    { status: "ok", source: "collector", checked_at: new Date(NOW.getTime() - 120000).toISOString() },
    { status: "ok", source: "collector", checked_at: new Date(NOW.getTime() - 180000).toISOString() },
    { status: "fail", source: "manual", checked_at: new Date(NOW.getTime() - 30000).toISOString() },
  ];
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "OK");
  assert.equal(result.sampleCount, 3); // il fail 'manual' e' escluso
  assert.equal(result.uptimePercent, 100);
});

// 9. manual rows escluse da official uptime
test("9. 100 righe 'manual' anche tutte OK non producono MAI un uptime calcolato (restano escluse per costruzione)", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    status: "ok", source: "manual", checked_at: new Date(NOW.getTime() - i * 60000).toISOString(),
  }));
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.uptimePercent, null);
});

// Contratto aggiuntivo: normalizeCheckResults non produce mai check_name
// legati a provider quando configStatus non e' passato (percorso collector
// puro, senza il ramo browser/manual dei provider).
test("normalizeCheckResults() senza configStatus non produce mai righe provider_*", () => {
  const results = normalizeCheckResults({ health: { rows: [{ key: "database", status: "ok", responseTimeMs: 10, error: null }] } });
  assert.ok(results.every((r) => !r.checkName.startsWith("provider_")));
});
