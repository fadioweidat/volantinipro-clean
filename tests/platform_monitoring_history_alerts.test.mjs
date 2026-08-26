// FASE Centro Controllo — Alert automatici + storico uptime/health.
// Convenzioni riusate: pure-function tests dirette, source-text/contract
// tests via readFileSync per SQL/edge function (no DB live in CI, stesso
// approccio di gps_zombie_prevention.test.mjs / auth_login_health_check.test.mjs).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { evaluateIncidentTransition, INCIDENT_ACTION } from "../src/lib/monitoring/incidentEngine.js";
import { ALERT_RULES, DEFAULT_ALERT_RULE, PROVIDER_REQUIREMENT, resolveAlertRule } from "../src/lib/monitoring/alertRules.js";
import { computeUptimeForWindow, computeUptimeSummary, computeResponseTimePercentiles, estimateDowntimeMs, UPTIME_WINDOWS_MS, MIN_SAMPLES_FOR_UPTIME, OFFICIAL_UPTIME_SOURCE } from "../src/lib/monitoring/healthHistory.js";
import { normalizeCheckResults, recordHealthAndIncidents, sanitizeCheckMessage } from "../src/lib/monitoring/healthCollectorClient.js";

const healthChecksMigrationPath = new URL("../supabase/migrations/20260826150000_platform_health_checks.sql", import.meta.url);
const incidentsMigrationPath = new URL("../supabase/migrations/20260826151000_platform_incidents.sql", import.meta.url);
const healthChecksMigration = readFileSync(healthChecksMigrationPath, "utf8");
const incidentsMigration = readFileSync(incidentsMigrationPath, "utf8");
const collectorSource = readFileSync(new URL("../supabase/functions/platform-health-collector/index.ts", import.meta.url), "utf8");
const platformStatusSource = readFileSync(new URL("../src/pages/admin/PlatformStatus.jsx", import.meta.url), "utf8");

const NOW = new Date("2026-08-26T12:00:00.000Z");
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// source di default 'collector': la maggior parte dei test di uptime
// sotto vuole simulare la raccolta periodica ufficiale. I test che vogliono
// simulare check manuali passano esplicitamente source:'manual'.
function row(status, minutesAgo, extra = {}) {
  return { status, checked_at: new Date(NOW.getTime() - minutesAgo * MIN).toISOString(), response_time_ms: null, source: "collector", ...extra };
}
function manualRow(status, minutesAgo, extra = {}) {
  return row(status, minutesAgo, { source: "manual", ...extra });
}

// ---------------------------------------------------------------------------
// 1/2/3 — recordHealthAndIncidents(): scrittura + sanitizzazione
// ---------------------------------------------------------------------------

test("1. health OK salvato: una riga status='ok' viene passata a insertHealthChecks", async () => {
  const inserted = [];
  await recordHealthAndIncidents({
    health: { rows: [{ key: "database", status: "ok", responseTimeMs: 42, error: null }] },
    insertHealthChecks: async (rows) => inserted.push(...rows),
    getRecentChecks: async () => [{ status: "ok" }],
    getOpenIncident: async () => null,
    insertIncident: async () => {},
    updateIncident: async () => {},
    now: NOW,
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].check_name, "database");
  assert.equal(inserted[0].status, "ok");
  assert.equal(inserted[0].response_time_ms, 42);
});

test("2. health FAIL salvato: status='error' viene mappato a 'fail' e passato a insertHealthChecks", async () => {
  const inserted = [];
  await recordHealthAndIncidents({
    health: { rows: [{ key: "supabase", status: "error", responseTimeMs: null, error: "HTTP 500" }] },
    insertHealthChecks: async (rows) => inserted.push(...rows),
    getRecentChecks: async () => [{ status: "fail" }],
    getOpenIncident: async () => null,
    insertIncident: async () => {},
    updateIncident: async () => {},
    now: NOW,
  });
  assert.equal(inserted[0].status, "fail");
  assert.equal(inserted[0].error_message, "HTTP 500");
});

test("3. token/PII non salvati: un JWT-like o 'apikey=' nel messaggio di errore viene redatto prima dell'insert", () => {
  const jwtLike = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const sanitized = sanitizeCheckMessage(`Errore fetch: apikey=${jwtLike} rifiutata`);
  assert.doesNotMatch(sanitized, /eyJ[a-zA-Z0-9_-]{10,}/);
  assert.doesNotMatch(sanitized, /apikey=/);
  assert.match(sanitized, /\[redacted\]/);
});

test("3b. normalizeCheckResults(): mai auth CONTRACT ne' auth REAL LOGIN evidence tra i risultati persistibili", () => {
  const results = normalizeCheckResults({
    authHealth: {
      infrastructure: { status: "OK", responseTimeMs: 10, error: null },
      clientContract: { status: "PASS", checks: [] },
      adminContract: { status: "PASS", checks: [], liveProbe: { status: "ok", responseTimeMs: 5, error: null } },
      clientRealLogin: { status: "OK_RECENT", reason: "test" },
      adminRealLogin: { status: "NO_RECENT_EVIDENCE", reason: "test" },
    },
  });
  const names = results.map((r) => r.checkName);
  assert.ok(names.includes("auth_infrastructure"));
  assert.ok(names.includes("auth_admin_role_probe"));
  assert.doesNotMatch(names.join(","), /contract/i);
  assert.doesNotMatch(names.join(","), /real_login/i);
});

// ---------------------------------------------------------------------------
// 4-13 — incidentEngine: apertura/aggiornamento/risoluzione
// ---------------------------------------------------------------------------

const CRITICAL_RULE = { alertable: true, severity: "critical", consecutiveFailuresBeforeOpen: 2, consecutiveSuccessesBeforeResolve: 2 };

test("4. primo FAIL non apre incident se soglia=2", () => {
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: CRITICAL_RULE,
    recentResults: [{ status: "fail", checkedAt: NOW.toISOString() }],
    existingIncident: null,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.NONE);
});

test("5. secondo FAIL consecutivo apre incident", () => {
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: CRITICAL_RULE,
    recentResults: [{ status: "fail" }, { status: "fail" }],
    existingIncident: null,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.OPEN);
  assert.equal(decision.incident.severity, "critical");
  assert.equal(decision.incident.occurrence_count, 2);
});

test("6. incident già aperto viene aggiornato (mai 'open' di nuovo)", () => {
  const existing = { id: "i1", occurrence_count: 2, check_name: "database" };
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: CRITICAL_RULE,
    recentResults: [{ status: "fail" }],
    existingIncident: existing,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.UPDATE);
  assert.equal(decision.patch.occurrence_count, 3);
});

test("7. non crea duplicati: con un incidente esistente l'azione non e' MAI 'open'", () => {
  const existing = { id: "i1", occurrence_count: 5, check_name: "database" };
  for (const status of ["fail", "warning", "ok"]) {
    const decision = evaluateIncidentTransition({
      checkName: "database",
      rule: CRITICAL_RULE,
      recentResults: [{ status }],
      existingIncident: existing,
      now: NOW,
    });
    assert.notEqual(decision.action, INCIDENT_ACTION.OPEN);
  }
});

test("8. successo singolo non risolve se soglia successi=2", () => {
  const existing = { id: "i1", occurrence_count: 3, check_name: "database" };
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: CRITICAL_RULE,
    recentResults: [{ status: "ok" }],
    existingIncident: existing,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.UPDATE);
  assert.equal(decision.patch.consecutive_successes, 1);
});

test("9. secondo successo consecutivo risolve l'incidente", () => {
  const existing = { id: "i1", occurrence_count: 3, check_name: "database" };
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: CRITICAL_RULE,
    recentResults: [{ status: "ok" }, { status: "ok" }],
    existingIncident: existing,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.RESOLVE);
});

test("10. resolved_at corretto (== now, mai un valore storico inventato)", () => {
  const existing = { id: "i1", occurrence_count: 3, check_name: "database" };
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: CRITICAL_RULE,
    recentResults: [{ status: "ok" }, { status: "ok" }],
    existingIncident: existing,
    now: NOW,
  });
  assert.equal(decision.patch.resolved_at, NOW.toISOString());
  assert.equal(decision.patch.status, "resolved");
});

test("11. warning non diventa critical: la severity e' assegnata solo all'apertura, mai toccata da un update", () => {
  const existing = { id: "i1", occurrence_count: 3, check_name: "gps_backend", severity: "warning" };
  const decision = evaluateIncidentTransition({
    checkName: "gps_backend",
    rule: ALERT_RULES.gps_backend,
    recentResults: [{ status: "fail" }],
    existingIncident: existing,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.UPDATE);
  assert.ok(!("severity" in decision.patch), "l'update non deve mai includere 'severity'");
});

test("12. non-alertable check non apre incident, indipendentemente dai fallimenti", () => {
  const decision = evaluateIncidentTransition({
    checkName: "qualunque_check_non_mappato",
    rule: DEFAULT_ALERT_RULE,
    recentResults: [{ status: "fail" }, { status: "fail" }, { status: "fail" }],
    existingIncident: null,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.NONE);
  assert.equal(DEFAULT_ALERT_RULE.alertable, false);
});

// ---------------------------------------------------------------------------
// 13/14 — separazione HEALTH CHECK da FLOW STATUS / AUTH EVIDENCE
// ---------------------------------------------------------------------------

test("13. no GPS session non apre incident: 'gps_live' (flow) non e' in ALERT_RULES e non e' alertable per default", () => {
  assert.equal(ALERT_RULES.gps_live, undefined);
  assert.equal(resolveAlertRule("gps_live").alertable, false);
});

test("14. no recent login non apre critical incident: nessun check_name derivato da auth REAL LOGIN evidence e' in ALERT_RULES", () => {
  for (const key of Object.keys(ALERT_RULES)) {
    assert.doesNotMatch(key, /real_login/i);
  }
  assert.equal(resolveAlertRule("auth_client_real_login").alertable, false);
  assert.equal(resolveAlertRule("auth_admin_real_login").alertable, false);
});

// ---------------------------------------------------------------------------
// Provider non configurato => status 'warning' nella riga persistita, MAI
// un incidente automatico se il provider e' OPTIONAL (Resend, oggi, e'
// intenzionalmente non configurato — vedi PROVIDER_REQUIREMENT).
// ---------------------------------------------------------------------------

test("provider non configurato => status 'warning' nella riga persistita (mai 'fail')", () => {
  const results = normalizeCheckResults({
    configStatus: { available: true, providers: { resend: false, mapbox: true } },
  });
  const resend = results.find((r) => r.checkName === "provider_resend");
  const mapbox = results.find((r) => r.checkName === "provider_mapbox");
  assert.equal(resend.status, "warning");
  assert.equal(mapbox.status, "ok");
});

// ---------------------------------------------------------------------------
// 5. optional provider not configured => no incident
// ---------------------------------------------------------------------------
test("5. Resend (OPTIONAL, non configurato intenzionalmente oggi) non apre mai un incidente: rule.alertable=false", () => {
  assert.equal(PROVIDER_REQUIREMENT.resend, "optional");
  const rule = resolveAlertRule("provider_resend");
  assert.equal(rule.alertable, false);
  const decision = evaluateIncidentTransition({
    checkName: "provider_resend",
    rule,
    recentResults: [{ status: "warning" }, { status: "warning" }, { status: "warning" }],
    existingIncident: null,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.NONE);
});

test("5b. Tutti e 5 i provider oggi noti sono classificati optional (evidenza da codice, nessun requirement inventato)", () => {
  for (const name of ["mapbox", "googlePlaces", "foursquare", "resend", "openai"]) {
    assert.equal(PROVIDER_REQUIREMENT[name], "optional");
    assert.equal(resolveAlertRule(`provider_${name}`).alertable, false);
  }
});

// ---------------------------------------------------------------------------
// 6. required provider not configured => warning (verifica del meccanismo,
// non di un caso reale oggi: nessun provider e' required oggi, ma la
// classificazione deve funzionare se un giorno lo diventasse davvero).
// ---------------------------------------------------------------------------
test("6. Un ipotetico provider REQUIRED non configurato apre un incidente WARNING dopo la soglia (meccanismo, non un caso reale oggi)", () => {
  // resolveAlertRule('provider_x') per un provider sconosciuto ricade su
  // DEFAULT_ALERT_RULE (non alertable) — qui verifichiamo direttamente il
  // ramo REQUIRED della funzione interna tramite ALERT_RULES giacche'
  // nessuna chiave 'required' esiste oggi in PROVIDER_REQUIREMENT: il
  // meccanismo e' verificato costruendo la regola richiesta esplicitamente.
  const requiredRule = { alertable: true, severity: "warning", consecutiveFailuresBeforeOpen: 1, consecutiveSuccessesBeforeResolve: 1 };
  const decision = evaluateIncidentTransition({
    checkName: "provider_ipotetico_required",
    rule: requiredRule,
    recentResults: [{ status: "warning" }],
    existingIncident: null,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.OPEN);
  assert.equal(decision.incident.severity, "warning");
});

// ---------------------------------------------------------------------------
// 7. concurrent same failure => un solo open incident (race sull'apertura)
// ---------------------------------------------------------------------------
test("7 (concurrency). Due esecuzioni concorrenti che tentano di aprire lo stesso incidente: la seconda insert fallisce con 23505 e recordHealthAndIncidents aggiorna invece di duplicare", async () => {
  let insertAttempts = 0;
  let updateCalls = 0;
  const existingAfterRace = { id: "race-1", check_name: "database", occurrence_count: 2 };
  await recordHealthAndIncidents({
    health: { rows: [{ key: "database", status: "error", responseTimeMs: null, error: "HTTP 500" }] },
    insertHealthChecks: async () => {},
    getRecentChecks: async () => [{ status: "fail" }, { status: "fail" }],
    // Nessun incidente open visto dalla PRIMA lettura (simula la race: un
    // altro processo lo crea nel frattempo, tra la lettura e l'insert).
    getOpenIncident: async () => (insertAttempts > 0 ? existingAfterRace : null),
    insertIncident: async () => {
      insertAttempts += 1;
      return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    },
    updateIncident: async (id, patch) => {
      updateCalls += 1;
      assert.equal(id, "race-1");
      assert.equal(patch.occurrence_count, 3);
    },
    now: NOW,
  });
  assert.equal(insertAttempts, 1);
  assert.equal(updateCalls, 1);
});

// ---------------------------------------------------------------------------
// 8. failure dopo resolved => nuova riga incidente (mai la vecchia riaperta)
// ---------------------------------------------------------------------------
test("8. Un nuovo fallimento dopo che l'incidente precedente e' 'resolved' apre un NUOVO incidente (getOpenIncident non trova piu' nulla, quindi action='open', mai un update sulla riga risolta)", () => {
  // existingIncident=null simula esattamente questo: una riga 'resolved'
  // non e' piu' 'open', quindi non viene mai restituita da getOpenIncident
  // e non puo' mai essere l'existingIncident passato qui.
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: { alertable: true, severity: "critical", consecutiveFailuresBeforeOpen: 2, consecutiveSuccessesBeforeResolve: 2 },
    recentResults: [{ status: "fail" }, { status: "fail" }],
    existingIncident: null,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.OPEN);
  assert.ok(!("id" in decision.incident), "un nuovo incidente non ha mai un id proprio: sara' una INSERT, mai una UPDATE su una riga esistente");
});

// ---------------------------------------------------------------------------
// 9. consecutive_successes reset su nuovo failure
// ---------------------------------------------------------------------------
test("9. consecutive_successes torna a 0 non appena arriva un nuovo fallimento, anche dopo dei successi parziali", () => {
  const existing = { id: "i1", occurrence_count: 4, check_name: "database" };
  const decision = evaluateIncidentTransition({
    checkName: "database",
    rule: { alertable: true, severity: "critical", consecutiveFailuresBeforeOpen: 2, consecutiveSuccessesBeforeResolve: 3 },
    recentResults: [{ status: "fail" }, { status: "ok" }], // 1 successo, poi di nuovo fail
    existingIncident: existing,
    now: NOW,
  });
  assert.equal(decision.action, INCIDENT_ACTION.UPDATE);
  assert.equal(decision.patch.consecutive_successes, 0);
});

// ---------------------------------------------------------------------------
// 10/11/12 — RLS: anon e authenticated non-admin non leggono/scrivono
// ---------------------------------------------------------------------------
test("10. anon non può leggere ne' scrivere platform_health_checks: nessun GRANT/policy per 'anon'", () => {
  assert.doesNotMatch(healthChecksMigration, /GRANT[^;]*TO "anon"/);
  assert.doesNotMatch(healthChecksMigration, /CREATE POLICY[^;]*TO "anon"/);
  assert.match(healthChecksMigration, /REVOKE ALL ON "public"\."platform_health_checks" FROM "anon"/);
});

test("11. anon non può leggere ne' scrivere platform_incidents: nessun GRANT/policy per 'anon'", () => {
  assert.doesNotMatch(incidentsMigration, /GRANT[^;]*TO "anon"/);
  assert.doesNotMatch(incidentsMigration, /CREATE POLICY[^;]*TO "anon"/);
  assert.match(incidentsMigration, /REVOKE ALL ON "public"\."platform_incidents" FROM "anon"/);
});

test("12. un authenticated NON admin non può leggere platform_incidents: l'unica policy per 'authenticated' richiede profiles.role admin/super_admin sia in USING che in WITH CHECK", () => {
  const policyMatch = incidentsMigration.match(/CREATE POLICY "platform_incidents_admin_all"[\s\S]*?WITH CHECK \(\([\s\S]*?\)\)\);/);
  assert.ok(policyMatch, "policy platform_incidents_admin_all non trovata");
  const policy = policyMatch[0];
  assert.match(policy, /USING \(\(EXISTS/);
  assert.match(policy, /WITH CHECK \(\(EXISTS/);
  assert.match(policy, /"role" = ANY \(ARRAY\['admin'::"text", 'super_admin'::"text"\]\)/);
  // Nessuna seconda policy per 'authenticated' che bypassi questo controllo.
  const authenticatedPolicies = [...incidentsMigration.matchAll(/CREATE POLICY "[^"]+" ON "public"\."platform_incidents" TO "authenticated"/g)];
  assert.equal(authenticatedPolicies.length, 1);
});

// ---------------------------------------------------------------------------
// 15. migration filenames not future-dated
// ---------------------------------------------------------------------------
test("15. I nomi dei due nuovi file di migration non sono datati nel futuro rispetto al 2026-08-26 (data reale corrente del progetto)", () => {
  const PROJECT_TODAY = new Date("2026-08-26T23:59:59.999Z").getTime();
  for (const url of [healthChecksMigrationPath, incidentsMigrationPath]) {
    const filename = url.pathname.split("/").pop();
    const match = filename.match(/^(\d{14})_/);
    assert.ok(match, `${filename} deve iniziare con un timestamp a 14 cifre`);
    const [, ts] = match;
    const isoLike = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
    const parsed = new Date(isoLike).getTime();
    assert.ok(Number.isFinite(parsed), `${filename}: timestamp non valido`);
    assert.ok(parsed <= PROJECT_TODAY, `${filename} e' datato nel futuro (${isoLike})`);
  }
});

test("15b. Nessuna collisione con migration esistenti: le due nuove versioni non coincidono con nessun altro file gia' presente", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const existing = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const newNames = ["20260826150000_platform_health_checks.sql", "20260826151000_platform_incidents.sql"];
  for (const name of newNames) {
    const occurrences = existing.filter((f) => f === name).length;
    assert.equal(occurrences, 1, `${name} deve comparire esattamente una volta nella cartella migrations`);
  }
});

// ---------------------------------------------------------------------------
// MANUAL != SCHEDULED — l'uptime ufficiale conta SOLO source='collector'
// ---------------------------------------------------------------------------

test("7.1. 100 check manuali OK + 0 collector => INSUFFICIENT_DATA (i check manuali non contano mai per l'uptime ufficiale)", () => {
  const rows = Array.from({ length: 100 }, (_, i) => manualRow("ok", i));
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.sampleCount, 0);
});

test("7.2. 2 check collector (sotto MIN_SAMPLES_FOR_UPTIME=3) => INSUFFICIENT_DATA", () => {
  const rows = [row("ok", 10), row("ok", 20)];
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.sampleCount, 2);
});

test("7.3. 3 check collector => uptime calcolabile (OK), anche con 100 check manuali mescolati che restano esclusi", () => {
  const rows = [
    ...Array.from({ length: 100 }, (_, i) => manualRow("ok", i)),
    row("ok", 5),
    row("ok", 10),
    row("fail", 15),
  ];
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "OK");
  assert.equal(result.sampleCount, 3);
  assert.equal(OFFICIAL_UPTIME_SOURCE, "collector");
});

test("7.4. computeUptimeSummary(): resta INSUFFICIENT_DATA su tutte e 3 le finestre finche' il collector non ha prodotto abbastanza campioni", () => {
  const rows = Array.from({ length: 50 }, (_, i) => manualRow("ok", i * 10));
  const summary = computeUptimeSummary(rows, NOW);
  for (const win of Object.values(summary)) assert.equal(win.status, "INSUFFICIENT_DATA");
});

test("estimateDowntimeMs(): ignora i gap tra check manuali, considera solo i gap tra check collector", () => {
  const manualOnly = [manualRow("fail", 60), manualRow("ok", 30)];
  assert.equal(estimateDowntimeMs(manualOnly), 0);
});

// ---------------------------------------------------------------------------
// 16-21 — healthHistory: uptime/percentili
// ---------------------------------------------------------------------------

test("16. uptime 24h corretto: 4 ok + 1 fail nelle ultime 24h => 80%", () => {
  const rows = [row("ok", 60), row("ok", 120), row("ok", 180), row("ok", 240), row("fail", 300)];
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "OK");
  assert.equal(result.sampleCount, 5);
  assert.equal(result.uptimePercent, 80);
  assert.equal(result.failCount, 1);
});

test("16b. BUG REALE trovato nello smoke test live: una singola esecuzione del collector che produce 7 righe (stesso checked_at) resta INSUFFICIENT_DATA, mai un 100% su un solo run", () => {
  const sameRun = new Date(NOW.getTime() - 5 * MIN).toISOString();
  const rows = ["analytics", "auth_admin_role_probe", "auth_infrastructure", "database", "edge_functions", "gps_backend", "supabase"]
    .map((name) => ({ status: "ok", checked_at: sameRun, source: "collector", check_name: name }));
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.executionCount, 1);
  assert.equal(result.sampleCount, 7);
  assert.equal(result.uptimePercent, null);
});

test("17. uptime 7d corretto: campioni fuori dalla finestra 24h ma dentro i 7d vengono inclusi solo nella finestra 7d", () => {
  const rows = [row("ok", 30), row("ok", 60), row("fail", 3 * 24 * 60)]; // 3 giorni fa
  const win24 = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  const win7d = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["7d"], NOW);
  assert.equal(win24.status, "INSUFFICIENT_DATA"); // solo 2 campioni nelle 24h
  assert.equal(win7d.status, "OK");
  assert.equal(win7d.sampleCount, 3);
});

test("18. no data => INSUFFICIENT_DATA (mai un 100%/0% costruito su 1-2 campioni)", () => {
  const rows = [row("ok", 10), row("ok", 20)]; // solo 2, sotto MIN_SAMPLES_FOR_UPTIME
  assert.equal(MIN_SAMPLES_FOR_UPTIME, 3);
  const result = computeUptimeForWindow(rows, UPTIME_WINDOWS_MS["24h"], NOW);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.uptimePercent, null);
});

test("18b. computeUptimeSummary(): restituisce le 3 finestre richieste (24h/7d/30d)", () => {
  const summary = computeUptimeSummary([], NOW);
  assert.deepEqual(Object.keys(summary).sort(), ["24h", "30d", "7d"]);
  for (const win of Object.values(summary)) assert.equal(win.status, "INSUFFICIENT_DATA");
});

test("19. p50 corretto su un campione noto (5 esecuzioni distinte, sopra la soglia)", () => {
  const rows = [100, 200, 300, 400, 500].map((ms, i) => ({ response_time_ms: ms, checked_at: new Date(NOW.getTime() - i * MIN).toISOString() }));
  const result = computeResponseTimePercentiles(rows);
  assert.equal(result.status, "OK");
  assert.equal(result.p50, 300);
});

test("20. p95 corretto su un campione noto (20 esecuzioni distinte)", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ response_time_ms: (i + 1) * 10, checked_at: new Date(NOW.getTime() - i * MIN).toISOString() }));
  const result = computeResponseTimePercentiles(rows);
  assert.equal(result.p95, 190);
});

test("21. response_time null gestito: righe senza response_time_ms vengono escluse dal calcolo, non trattate come 0", () => {
  const rows = [
    { response_time_ms: 100, checked_at: new Date(NOW.getTime() - 1 * MIN).toISOString() },
    { response_time_ms: null, checked_at: new Date(NOW.getTime() - 2 * MIN).toISOString() },
    { response_time_ms: 200, checked_at: new Date(NOW.getTime() - 3 * MIN).toISOString() },
    { response_time_ms: undefined, checked_at: new Date(NOW.getTime() - 4 * MIN).toISOString() },
  ];
  const result = computeResponseTimePercentiles(rows);
  assert.equal(result.sampleCount, 2);
});

test("21c. computeResponseTimePercentiles(): 7 valori dalla STESSA esecuzione (stesso checked_at) restano INSUFFICIENT_DATA (replica il bug reale trovato nello smoke test live: un solo collector run non e' 7 osservazioni indipendenti)", () => {
  const sameRun = new Date(NOW.getTime() - 5 * MIN).toISOString();
  const rows = [333, 411, 730, 2778, 2838, 2840, 2845].map((ms) => ({ response_time_ms: ms, checked_at: sameRun }));
  const result = computeResponseTimePercentiles(rows);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.executionCount, 1);
  assert.equal(result.sampleCount, 7);
});

test("21b. estimateDowntimeMs(): righe con response_time_ms null non causano un'eccezione", () => {
  const rows = [row("fail", 60, { response_time_ms: null }), row("ok", 30, { response_time_ms: null })];
  assert.doesNotThrow(() => estimateDowntimeMs(rows));
});

// ---------------------------------------------------------------------------
// 22 — un check storico non modifica lo stato LIVE gia' mostrato
// ---------------------------------------------------------------------------

test("22. recordHealthAndIncidents() non muta gli oggetti health/authHealth passati (lo stato live resta quello gia' calcolato altrove)", async () => {
  const health = { rows: [{ key: "database", status: "ok", responseTimeMs: 10, error: null }] };
  const healthSnapshot = JSON.parse(JSON.stringify(health));
  await recordHealthAndIncidents({
    health,
    insertHealthChecks: async () => {},
    getRecentChecks: async () => [{ status: "ok" }],
    getOpenIncident: async () => null,
    insertIncident: async () => {},
    updateIncident: async () => {},
    now: NOW,
  });
  assert.deepEqual(health, healthSnapshot);
});

test("22b. PlatformStatus.jsx: setHealth/setAuthHealth (stato live) vengono chiamati PRIMA di recordHealthAndIncidents (lo storico non puo' sovrascrivere lo stato live)", () => {
  const idxSetHealth = platformStatusSource.indexOf("setHealth(healthResult)");
  const idxRecord = platformStatusSource.indexOf("recordHealthAndIncidents(");
  assert.ok(idxSetHealth > 0 && idxRecord > 0);
  assert.ok(idxSetHealth < idxRecord, "setHealth deve avvenire prima della registrazione storico/incidenti");
});

// ---------------------------------------------------------------------------
// 23-26 — RLS/grants contract sulle due nuove migration
// ---------------------------------------------------------------------------

test("23. platform_health_checks / platform_incidents: RLS admin-only via profiles.role (stesso pattern di error_log)", () => {
  for (const sql of [healthChecksMigration, incidentsMigration]) {
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /profiles"\."role"\s*=\s*ANY \(ARRAY\['admin'::"text", 'super_admin'::"text"\]\)/);
  }
});

test("24. collector write autorizzato: la nuova Edge Function richiede un secret dedicato (mai anonima, mai una password/JWT utente)", () => {
  assert.match(collectorSource, /PLATFORM_HEALTH_COLLECTOR_SECRET/);
  assert.match(collectorSource, /providedSecret !== expectedSecret/);
  assert.match(collectorSource, /return json\(\{ error: "UNAUTHORIZED" \}, 401\)/);
});

test("25. anon non legge incidenti: REVOKE ALL FROM anon presente, nessuna policy anon nella migration platform_incidents", () => {
  assert.match(incidentsMigration, /REVOKE ALL ON "public"\."platform_incidents" FROM "anon"/);
  assert.doesNotMatch(incidentsMigration, /TO "anon"/);
});

test("26. anon non scrive health history: REVOKE ALL FROM anon presente, nessuna policy anon nella migration platform_health_checks", () => {
  assert.match(healthChecksMigration, /REVOKE ALL ON "public"\."platform_health_checks" FROM "anon"/);
  assert.doesNotMatch(healthChecksMigration, /TO "anon"/);
});

// ---------------------------------------------------------------------------
// 27 — nessuno scheduler necessario per eseguire questi test in locale
// ---------------------------------------------------------------------------

test("27. scheduler non necessario per test locale: tutte le funzioni pure sono chiamabili senza rete/DB/cron", () => {
  // Se una qualunque delle funzioni pure sopra avesse richiesto una
  // connessione di rete reale, i test 4-21 sarebbero gia' falliti/andati in
  // timeout: qui verifichiamo esplicitamente che nessun modulo del motore
  // referenzi pg_cron/scheduler/deploy.
  const engineSources = [
    readFileSync(new URL("../src/lib/monitoring/incidentEngine.js", import.meta.url), "utf8"),
    readFileSync(new URL("../src/lib/monitoring/alertRules.js", import.meta.url), "utf8"),
    readFileSync(new URL("../src/lib/monitoring/healthHistory.js", import.meta.url), "utf8"),
  ];
  for (const src of engineSources) {
    assert.doesNotMatch(src, /pg_cron|cron\.schedule|supabase functions deploy/i);
  }
});

// ---------------------------------------------------------------------------
// 28 — errori del collector non rompono il sito pubblico
// ---------------------------------------------------------------------------

test("28. il collector cattura ogni errore in un try/catch e risponde sempre con una Response, mai un'eccezione non gestita", () => {
  assert.match(collectorSource, /catch \(err: any\) \{[\s\S]*?INTERNAL_ERROR[\s\S]*?\}/);
  // Nessun riferimento a Step1-4/pagine pubbliche: il collector e' un
  // processo interamente separato dal traffico utente reale.
  assert.doesNotMatch(collectorSource, /Step1|Step2|Step3|Step4|volantinipro-final/);
});

test("28b. PlatformStatus.jsx: la registrazione storico/incidenti e' avvolta in try/catch, un suo fallimento non deve impedire di vedere lo stato live gia' calcolato", () => {
  const recordBlock = platformStatusSource.match(/try \{\s*\n\s*await recordHealthAndIncidents\([\s\S]*?\n\s*\} catch \{/);
  assert.ok(recordBlock, "recordHealthAndIncidents deve essere chiamato dentro un try/catch dedicato");
});
