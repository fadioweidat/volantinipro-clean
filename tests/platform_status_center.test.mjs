import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeFlowHealth } from "../src/lib/monitoring/platformFlows.js";
import { pingEdgeFunction } from "../src/lib/monitoring/platformHealth.js";
import { computeLastOperationalEvents } from "../src/lib/monitoring/platformEvents.js";
import { buildPlatformStatusReport } from "../src/lib/monitoring/platformReport.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const errorLogMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260825220000_error_log.sql");
const appRouterPath = path.join(__dirname, "..", "src", "app", "AppRouter.jsx");
const monitoringDir = path.join(__dirname, "..", "src", "lib", "monitoring");
const platformStatusPagePath = path.join(__dirname, "..", "src", "pages", "admin", "PlatformStatus.jsx");
const configStatusFnPath = path.join(__dirname, "..", "supabase", "functions", "config-status", "index.ts");

const NOW = new Date("2026-08-25T18:00:00.000Z");
const RECENT = "2026-08-25T17:00:00.000Z"; // 1h fa
const STALE = "2026-08-23T17:00:00.000Z"; // >24h fa

function errRow({ category, module = null, createdAt = RECENT }) {
  return { category, module, created_at: createdAt, message: "errore", severity: "error" };
}

// ---- Blocco 3: health dei flussi ----

test("gestione errori API: un errore submit_campaign recente marca il flusso 'Submit campagna' FAIL", () => {
  const flows = computeFlowHealth({ errorLogRows: [errRow({ category: "submit_campaign" })], now: NOW });
  const submit = flows.find((f) => f.key === "submit_campaign");
  assert.equal(submit.status, "fail");
  assert.match(submit.reason, /errore/i);
});

test("rendering PASS: nessun errore frontend per Step1 nelle ultime 24h => PASS", () => {
  const flows = computeFlowHealth({ errorLogRows: [], now: NOW });
  const step1 = flows.find((f) => f.key === "step1");
  assert.equal(step1.status, "pass");
});

test("rendering FAIL: un errore frontend con module 'step=2' marca SOLO Step 2, non Step 1/3/4", () => {
  const flows = computeFlowHealth({
    errorLogRows: [errRow({ category: "frontend", module: "/configuratore?step=2" })],
    now: NOW,
  });
  const byKey = Object.fromEntries(flows.map((f) => [f.key, f.status]));
  assert.equal(byKey.step2, "fail");
  assert.equal(byKey.step1, "pass");
  assert.equal(byKey.step3, "pass");
  assert.equal(byKey.step4, "pass");
});

test("non fingere PASS: login cliente senza nessun controllo automatico reale resta WARNING, mai PASS", () => {
  const flows = computeFlowHealth({ errorLogRows: [], now: NOW });
  const loginCustomer = flows.find((f) => f.key === "login_customer");
  assert.equal(loginCustomer.status, "warning");
  assert.notEqual(loginCustomer.status, "pass");
});

test("errori vecchi (>24h) non influenzano lo stato attuale del flusso", () => {
  const flows = computeFlowHealth({ errorLogRows: [errRow({ category: "submit_campaign", createdAt: STALE })], now: NOW });
  const submit = flows.find((f) => f.key === "submit_campaign");
  assert.notEqual(submit.status, "fail");
});

// HARDENING P2 — una sessione avviata senza GPS recente NON e' un guasto del
// backend GPS: gps_live diventa WARNING (non FAIL) e la sessione stale finisce
// in una riga WARNING separata. Il guasto backend vero vive solo nella riga
// "Driver/GPS backend" di runPlatformHealthCheck.
test("GPS Live: sessione avviata senza GPS recente => WARNING (mai FAIL: non e' un guasto backend)", () => {
  const flows = computeFlowHealth({
    deliverySessions: [{ id: "s1", status: "started" }],
    gpsPoints: [{ session_id: "s1", recorded_at: "2026-08-25T17:00:00.000Z" }], // 1h fa
    now: NOW,
  });
  const gps = flows.find((f) => f.key === "gps_live");
  assert.equal(gps.status, "warning");
  assert.notEqual(gps.status, "fail");
});

test("Sessioni GPS stale/abbandonate: una sessione started ferma da 1h => WARNING separato, mai chiusa", () => {
  const flows = computeFlowHealth({
    deliverySessions: [{ id: "s1", status: "started" }],
    gpsPoints: [{ session_id: "s1", recorded_at: "2026-08-25T17:00:00.000Z" }],
    now: NOW,
  });
  const stale = flows.find((f) => f.key === "gps_stale_sessions");
  assert.equal(stale.status, "warning");
  assert.match(stale.reason, /mai chiuse|abbandon/i);
});

test("GPS: ne' gps_live ne' gps_stale_sessions possono emettere 'fail' (il guasto backend vive solo in checkGpsBackend)", () => {
  const flows = computeFlowHealth({
    deliverySessions: [{ id: "a", status: "started" }, { id: "b", status: "started" }],
    gpsPoints: [],
    now: NOW,
  });
  for (const key of ["gps_live", "gps_stale_sessions"]) {
    assert.notEqual(flows.find((f) => f.key === key).status, "fail");
  }
});

test("GPS Live: sessione attiva con punti GPS recenti => PASS", () => {
  const flows = computeFlowHealth({
    deliverySessions: [{ id: "s1", status: "started" }],
    gpsPoints: [{ session_id: "s1", recorded_at: "2026-08-25T17:50:00.000Z" }], // 10 min fa
    now: NOW,
  });
  assert.equal(flows.find((f) => f.key === "gps_live").status, "pass");
});

test("GPS Live: nessuna sessione attiva => WARNING (non FAIL, non e' un guasto)", () => {
  const flows = computeFlowHealth({ deliverySessions: [], now: NOW });
  assert.equal(flows.find((f) => f.key === "gps_live").status, "warning");
});

// ---- Blocco 8: ultimi eventi operativi ----

test("zero-data state: nessun evento reale => tutti i campi null/non disponibile, mai un valore inventato", () => {
  const events = computeLastOperationalEvents({});
  assert.equal(events.lastCampaignCreated, null);
  assert.equal(events.lastQuoteCompleted, null);
  assert.equal(events.lastGpsReceived, null);
  assert.equal(events.lastEdgeFunctionError, null);
});

test("ultima campagna creata: sceglie la piu' recente tra piu' righe", () => {
  const events = computeLastOperationalEvents({
    campaigns: [
      { id: "a", createdAt: "2026-08-20T00:00:00.000Z", name: "Vecchia" },
      { id: "b", createdAt: "2026-08-25T00:00:00.000Z", name: "Recente" },
    ],
  });
  assert.equal(events.lastCampaignCreated.label, "Recente");
});

test("ultimo GPS ricevuto usa recorded_at, non created_at", () => {
  const events = computeLastOperationalEvents({
    gpsPoints: [{ recorded_at: "2026-08-25T10:00:00.000Z", created_at: "2099-01-01T00:00:00.000Z" }],
  });
  assert.equal(events.lastGpsReceived.at, "2026-08-25T10:00:00.000Z");
});

// ---- Blocco 7: report tecnico ----

test("report tecnico: stato generale ERRORE se almeno una riga di health e' in errore", () => {
  const report = buildPlatformStatusReport({
    health: { rows: [{ label: "Database", status: "error", statusLabel: "ERRORE", responseTimeMs: 50, error: "boom" }] },
    flows: [],
  });
  assert.equal(report.generalStatus, "ERRORE");
});

test("report tecnico: elenca solo i flussi non PASS in flowsWithIssues", () => {
  const report = buildPlatformStatusReport({
    health: { rows: [] },
    flows: [
      { key: "step1", label: "Step 1", status: "pass", reason: "ok", lastChecked: NOW.toISOString() },
      { key: "gps_live", label: "GPS Live", status: "fail", reason: "no data", lastChecked: NOW.toISOString() },
    ],
  });
  assert.equal(report.flowsWithIssues.length, 1);
  assert.equal(report.flowsWithIssues[0].label, "GPS Live");
});

test("report tecnico: nessun secret nel report (solo booleani provider, mai i valori)", () => {
  const report = buildPlatformStatusReport({
    health: { rows: [] },
    flows: [],
    providers: { mapbox: true, openai: false, resend: true },
  });
  assert.deepEqual(report.providersNotConfigured, ["openai"]);
  assert.equal(JSON.stringify(report).includes("sk-"), false);
});

// ---- Migration RLS (Blocco 2 + sicurezza) ----

test("RLS: la migration error_log consente INSERT pubblico limitato e SELECT/UPDATE solo agli admin", () => {
  const sql = fs.readFileSync(errorLogMigrationPath, "utf8");
  assert.match(sql, /CREATE POLICY "error_log_insert_anon" ON "public"\."error_log"\s+FOR INSERT TO "anon"/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*TO "anon"[^;]*FOR SELECT/s);
  assert.doesNotMatch(sql, /GRANT SELECT ON "public"\."error_log" TO "anon"/);
  assert.match(sql, /CREATE POLICY "error_log_admin_all" ON "public"\."error_log" TO "authenticated"/);
  assert.match(sql, /"profiles"\."role" = ANY \(ARRAY\['admin'::"text", 'super_admin'::"text"\]\)/);
  assert.match(sql, /ALTER TABLE "public"\."error_log" ENABLE ROW LEVEL SECURITY/);
  const createTableBlock = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf(");") + 2);
  assert.doesNotMatch(createTableBlock, /password|token|service_role/i);
  assert.match(sql, /CONSTRAINT "error_log_message_length_check" CHECK/);
});

// ---- Fix health check Edge Functions: REACHABLE vs UNREACHABLE ----
// pingEdgeFunction usa GET (browser-safe, nessun preflight CORS come
// method:"OPTIONS" richiederebbe) e classifica in base a "fetch ha
// ricevuto una risposta reale" (REACHABLE, qualunque status) vs "fetch ha
// lanciato un'eccezione o e' scaduto il timeout" (UNREACHABLE).

function withMockedFetch(impl, run) {
  const original = global.fetch;
  global.fetch = impl;
  return run().finally(() => { global.fetch = original; });
}

test("submit-campaign-request: risposta 500 (crash su GET, comportamento della funzione stessa) e' comunque REACHABLE", () => withMockedFetch(
  async () => ({ status: 500 }),
  async () => {
    const result = await pingEdgeFunction("submit-campaign-request");
    assert.equal(result.reachable, true);
    assert.equal(result.status, 500);
  }
));

test("ai-core: risposta 405 (metodo non supportato) e' REACHABLE", () => withMockedFetch(
  async () => ({ status: 405 }),
  async () => {
    const result = await pingEdgeFunction("ai-core");
    assert.equal(result.reachable, true);
    assert.equal(result.status, 405);
  }
));

test("admin-grant-access: risposta 401 (non autenticato) e' REACHABLE", () => withMockedFetch(
  async () => ({ status: 401 }),
  async () => {
    const result = await pingEdgeFunction("admin-grant-access");
    assert.equal(result.reachable, true);
    assert.equal(result.status, 401);
  }
));

test("403 e' REACHABLE (risposta ricevuta dal servizio, solo autorizzazione negata)", () => withMockedFetch(
  async () => ({ status: 403 }),
  async () => {
    const result = await pingEdgeFunction("admin-grant-access");
    assert.equal(result.reachable, true);
  }
));

test("404 (funzione non deployata sul gateway) e' UNREACHABLE", () => withMockedFetch(
  async () => ({ status: 404 }),
  async () => {
    const result = await pingEdgeFunction("funzione-inesistente");
    assert.equal(result.reachable, false);
    assert.match(result.error, /non deployata/i);
  }
));

test("network failure (fetch lancia un'eccezione) risulta UNREACHABLE", () => withMockedFetch(
  async () => { throw new TypeError("Failed to fetch"); },
  async () => {
    const result = await pingEdgeFunction("submit-campaign-request");
    assert.equal(result.reachable, false);
    assert.match(result.error, /failed to fetch/i);
  }
));

test("timeout (AbortError, es. rete che non risponde mai entro il limite) risulta UNREACHABLE con messaggio esplicito", () => withMockedFetch(
  // Simula direttamente cio' che accade quando l'AbortController interno
  // scatta (fetch rifiutata con un errore name="AbortError"): non serve
  // attendere il vero timeout di produzione per verificare che il ramo di
  // classificazione lo tratti correttamente come UNREACHABLE.
  async () => { throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" }); },
  async () => {
    const result = await pingEdgeFunction("submit-campaign-request");
    assert.equal(result.reachable, false);
    assert.match(result.error, /timeout/i);
  }
));

// ---- Sicurezza: pagina solo Admin, nessun secret nel frontend ----

test("pagina Admin accessibile solo Admin: PlatformStatus e' montata dentro lo stesso AdminGuard di tutte le altre pagine admin", () => {
  const source = fs.readFileSync(appRouterPath, "utf8");
  const guardOpen = source.indexOf("<AdminGuard");
  const guardClose = source.indexOf("</AdminGuard>");
  const routeLine = source.indexOf('page === "admin-status"');
  assert.ok(guardOpen >= 0 && guardClose > guardOpen, "AdminGuard block non trovato");
  assert.ok(routeLine > guardOpen && routeLine < guardClose, "admin-status deve essere renderizzato dentro AdminGuard");
});

test("nessun secret nel frontend: nessun file src/lib/monitoring o PlatformStatus.jsx referenzia SERVICE_ROLE", () => {
  const files = [
    ...fs.readdirSync(monitoringDir).filter((f) => f.endsWith(".js")).map((f) => path.join(monitoringDir, f)),
    platformStatusPagePath,
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(content, /SERVICE_ROLE/i, `${path.basename(file)} non deve referenziare la service-role key`);
  }
});

test("Edge Function config-status: verifica il ruolo admin server-side e non restituisce mai i valori dei secret, solo booleani", () => {
  const source = fs.readFileSync(configStatusFnPath, "utf8");
  assert.match(source, /profile\.role/);
  assert.match(source, /FORBIDDEN/);
  assert.doesNotMatch(source, /providers\s*:\s*\{[^}]*Deno\.env\.get\([^)]*\)\s*,/s);
  // La risposta espone solo boolEnv(...) (booleani), mai Deno.env.get(...) grezzo nel payload JSON finale.
  const responseBlock = source.slice(source.indexOf("return json({"));
  assert.doesNotMatch(responseBlock, /Deno\.env\.get/);
});
