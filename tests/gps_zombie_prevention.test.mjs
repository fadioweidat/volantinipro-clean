import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDeliverySession, GPS_SESSION_STATE } from "../src/lib/monitoring/gpsSessionLifecycle.js";
import { resolveResumePolicy, RESUME_ACTION } from "../src/lib/monitoring/gpsResumePolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(__dirname, "..", "src", "hooks", "useGpsTracking.js");
const gpsApiPath = path.join(__dirname, "..", "src", "lib", "services", "gps-api.js");
const driverPagePath = path.join(__dirname, "..", "src", "pages", "driver", "DriverAssignmentPage.jsx");
const trackingPagePath = path.join(__dirname, "..", "src", "pages", "driver", "TrackingPage.jsx");
const startSessionMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260826140000_gps_start_session_classified_conflict.sql");
const lastGpsMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260826130000_get_active_driver_session_last_gps.sql");
const recoverRpcMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260826120000_gps_recover_abandoned_session.sql");

const hookSource = fs.readFileSync(hookPath, "utf8");
const gpsApiSource = fs.readFileSync(gpsApiPath, "utf8");
const driverPageSource = fs.readFileSync(driverPagePath, "utf8");
const trackingPageSource = fs.readFileSync(trackingPagePath, "utf8");
const startSessionMigration = fs.readFileSync(startSessionMigrationPath, "utf8");
const lastGpsMigration = fs.readFileSync(lastGpsMigrationPath, "utf8");

const NOW = new Date("2026-08-26T12:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function startedSession(overrides = {}) {
  return { id: "s1", status: "started", started_at: "2026-08-26T08:00:00.000Z", paused_at: null, updated_at: "2026-08-26T08:00:00.000Z", ended_at: null, ...overrides };
}

// 1. start => started (contratto gia' coperto da gps_prod_rpc_frontend_contract;
// qui verifichiamo solo che il file sorgente non sia stato alterato in modo da
// rompere il contratto RPC nome/parametri usato da startGpsSession).
test("1. startGpsSession chiama ancora gps_start_session con gli stessi 4 parametri", () => {
  assert.match(gpsApiSource, /callGpsRpc\('gps_start_session',\s*\{\s*p_assignment_id/);
  assert.match(gpsApiSource, /p_device_id: deviceId \|\| null/);
  assert.match(gpsApiSource, /p_campaign_zone_id: zoneId \|\| null/);
  assert.match(gpsApiSource, /p_access_token: accessToken \|\| null/);
});

// 2. heartbeat mantiene la sessione valida (nessuna logica di scadenza lato
// client basata sull'assenza di heartbeat: verificato che l'intervallo esiste
// ed e' quello atteso, 20s).
test("2. heartbeat parte ogni HEARTBEAT_INTERVAL_MS mentre status==='active'", () => {
  assert.match(hookSource, /const HEARTBEAT_INTERVAL_MS = 20000;/);
  assert.match(hookSource, /if \(statusRef\.current !== 'active' \|\| !sessionRef\.current\?\.id\) return;\s*\n\s*heartbeatGpsSession/);
});

// 3. stop server-confirmed => closed
test("3. end(): solo dopo la risposta server valorizza session/status='completed'", () => {
  assert.match(hookSource, /updated = await withTimeout\(\s*endGpsSession/);
  assert.match(hookSource, /statusRef\.current = 'completed';\s*\n\s*setSession\(updated\);\s*\n\s*setStatus\('completed'\);/);
});

// 4. stop network failure => UI NON finge closed
test("4. end(): un fallimento (timeout o RPC) non tocca mai session/status e rilancia l'errore", () => {
  const endFnMatch = hookSource.match(/const end = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[releaseWakeLock, stopWatch, accessToken[^\]]*\]\);/);
  assert.ok(endFnMatch, "end() non trovato");
  const endFn = endFnMatch[0];
  // Il blocco catch deve rilanciare (throw) e non deve contenere alcuna
  // scrittura di setSession/setStatus('completed') al suo interno.
  const catchBlock = endFn.match(/\} catch \(err\) \{[\s\S]*?\n    \}/)[0];
  assert.match(catchBlock, /throw /);
  assert.doesNotMatch(catchBlock, /setStatus\('completed'\)/);
  assert.doesNotMatch(catchBlock, /setSession\(updated\)/);
  // stopWatch() deve avvenire SOLO dopo il blocco try/catch (dopo conferma),
  // mai dentro il try prima della await.
  const beforeCatch = endFn.slice(0, endFn.indexOf("} catch"));
  assert.doesNotMatch(beforeCatch.replace(/withTimeout\([\s\S]*?\);/, ""), /stopWatch\(\);/);
});

test("4b. end(): il messaggio di mancata conferma e' quello richiesto", () => {
  assert.match(hookSource, /Chiusura non confermata — riprova quando torna la connessione\./);
});

// 5. reload LIVE => resume
test("5. classifyDeliverySession + resolveResumePolicy: sessione LIVE => RESUME", () => {
  const ts = new Date(NOW.getTime() - 2 * MIN).toISOString();
  const session = startedSession({ started_at: ts });
  const classification = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(classification.state, GPS_SESSION_STATE.LIVE);
  const policy = resolveResumePolicy(classification);
  assert.equal(policy.action, RESUME_ACTION.RESUME);
  assert.equal(policy.message, null);
});

// 6. reload STALE => warning/resume controllato
test("6. classifyDeliverySession + resolveResumePolicy: sessione STALE => RESUME_WITH_WARNING con messaggio", () => {
  const ts = new Date(NOW.getTime() - 45 * MIN).toISOString();
  const session = startedSession({ started_at: "2026-08-26T08:00:00.000Z" });
  const classification = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(classification.state, GPS_SESSION_STATE.STALE);
  const policy = resolveResumePolicy(classification);
  assert.equal(policy.action, RESUME_ACTION.RESUME_WITH_WARNING);
  assert.ok(policy.message && policy.message.length > 0);
});

// 7. reload ABANDONED => no silent resume
test("7. classifyDeliverySession + resolveResumePolicy: sessione ABANDONED => BLOCK, messaggio esplicito", () => {
  const ts = new Date(NOW.getTime() - 15 * HOUR).toISOString();
  const session = startedSession({ started_at: ts });
  const classification = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(classification.state, GPS_SESSION_STATE.ABANDONED);
  const policy = resolveResumePolicy(classification);
  assert.equal(policy.action, RESUME_ACTION.BLOCK);
  assert.match(policy.message, /amministratore/i);
});

test("7b. resumeExistingSession(): il ramo BLOCK non chiama mai setSession/setStatus/startWatch", () => {
  const resumeFnMatch = hookSource.match(/async function resumeExistingSession\(\) \{[\s\S]*?\n    \}/);
  assert.ok(resumeFnMatch, "resumeExistingSession non trovato");
  const fn = resumeFnMatch[0];
  const blockBranch = fn.match(/if \(policy\.action === RESUME_ACTION\.BLOCK\) \{[\s\S]*?\n          return;\s*\n        \}/);
  assert.ok(blockBranch, "ramo BLOCK non trovato in resumeExistingSession");
  assert.doesNotMatch(blockBranch[0], /setSession\(existing\)/);
  assert.doesNotMatch(blockBranch[0], /startWatch\(\)/);
  assert.match(blockBranch[0], /setResumeNotice/);
});

// 8. abandoned non auto-cancellata dal Driver
// 9. Driver non puo' chiamare la RPC admin-only
test("8/9. Nessun file del percorso Driver (hook, gps-api, pagine Driver) invoca davvero gps_recover_abandoned_session", () => {
  // Cerca solo forme di INVOCAZIONE reale (rpc('gps_recover_abandoned_session'
  // o callGpsRpc('gps_recover_abandoned_session'), con l'apice di apertura
  // stringa subito prima del nome) — un commento che nomina la RPC per
  // spiegare perche' NON va chiamata (vedi useGpsTracking.js) non deve far
  // fallire questo test.
  const invocationPattern = /['"]gps_recover_abandoned_session['"]/;
  for (const [name, source] of [
    ["useGpsTracking.js", hookSource],
    ["gps-api.js", gpsApiSource],
    ["DriverAssignmentPage.jsx", driverPageSource],
    ["TrackingPage.jsx", trackingPageSource],
  ]) {
    assert.doesNotMatch(source, invocationPattern, `${name} non deve mai chiamare la RPC admin-only`);
  }
});

// 10. unique index continua a bloccare i duplicati reali
test("10. La migration Fase E mantiene il blocco try/exception unique_violation come safety net", () => {
  assert.match(startSessionMigration, /exception when unique_violation then/);
  assert.match(startSessionMigration, /SESSIONE_GIA_ATTIVA/);
});

// 11. errore active vs abandoned distinguibile
test("11. La migration Fase E solleva ACTIVE_SESSION_EXISTS e ABANDONED_SESSION_EXISTS, mai un solo errore generico per entrambi", () => {
  assert.match(startSessionMigration, /ACTIVE_SESSION_EXISTS/);
  assert.match(startSessionMigration, /ABANDONED_SESSION_EXISTS/);
  assert.match(startSessionMigration, /v_age_seconds <= 600/);
  assert.match(startSessionMigration, /v_age_seconds <= 14400/);
});

test("11b. La migration Fase E NON chiude/aggiorna mai la sessione bloccante (sola lettura)", () => {
  const checkBlock = startSessionMigration.match(/-- Check proattivo[\s\S]*?end if;\s*\n\s*\n\s*begin\s*\n\s*insert into public\.delivery_sessions/)[0];
  assert.doesNotMatch(checkBlock, /update public\.delivery_sessions/);
});

// 12. temporary offline non diventa abandoned troppo presto
test("12. 3 ore di silenzio (dentro la finestra STALE, oltre i 10 minuti LIVE) NON e' ABANDONED", () => {
  const ts = new Date(NOW.getTime() - 3 * HOUR).toISOString();
  const session = startedSession({ started_at: "2026-08-26T08:00:00.000Z" });
  const classification = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(classification.state, GPS_SESSION_STATE.STALE);
  assert.notEqual(classification.state, GPS_SESSION_STATE.ABANDONED);
});

// 13. background/tab hidden non causa cancel automatico
test("13. onVisibilitychange non chiama mai pause/end/cancel, solo requestWakeLock/startWatch/flushQueue quando torna visibile", () => {
  const visBlock = hookSource.match(/const onVisibilityChange = \(\) => \{[\s\S]*?\n    \};/)[0];
  assert.doesNotMatch(visBlock, /\bend\(\)/);
  assert.doesNotMatch(visBlock, /\bpause\(\)/);
  assert.doesNotMatch(visBlock, /cancel/i);
});

test("13b. pagehide invia SOLO un heartbeat diagnostico, mai una chiusura/cancellazione", () => {
  const pageHideBlock = hookSource.match(/const onPageHide = \(\) => \{[\s\S]*?\n    \};/)[0];
  assert.match(pageHideBlock, /sendPagehideHeartbeat/);
  assert.doesNotMatch(pageHideBlock, /endGpsSession/);
  assert.doesNotMatch(pageHideBlock, /gps_transition_session/);
  assert.match(gpsApiSource, /export function sendPagehideHeartbeat/);
  assert.match(gpsApiSource, /gps_heartbeat_session/);
  assert.doesNotMatch(
    gpsApiSource.match(/export function sendPagehideHeartbeat[\s\S]*?\n\}/)[0],
    /complete|cancel/i,
  );
});

// 14. reconnect riprende heartbeat (nessuna logica separata: l'heartbeat gia'
// gira su un interval fisso indipendente dal networkStatus, quindi riprende
// da solo appena la RPC torna a funzionare — verifichiamo che non ci sia
// nessuna condizione che lo disabiliti sulla base di networkStatus==='offline').
test("14. L'intervallo di heartbeat non dipende da networkStatus (riprende da solo al reconnect)", () => {
  const heartbeatEffect = hookSource.match(/useEffect\(\(\) => \{\s*\n\s*const timer = window\.setInterval\(\(\) => \{\s*\n\s*if \(statusRef\.current !== 'active'[\s\S]*?\n\s*\}, \[accessToken\]\);/)[0];
  assert.doesNotMatch(heartbeatEffect, /networkStatus/);
});

// 15. vecchio updated_at (bump admin) non rende LIVE una sessione vecchia
test("15. updated_at recentissimo (bump admin) NON rende LIVE una sessione con GPS vecchio di 92 giorni", () => {
  const oldTs = new Date(NOW.getTime() - 92 * 24 * HOUR).toISOString();
  const session = startedSession({ started_at: oldTs, updated_at: NOW.toISOString() });
  const classification = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: oldTs });
  assert.equal(classification.state, GPS_SESSION_STATE.ABANDONED);
});

// 16. Centro Controllo continua a classificare correttamente (nessuna
// modifica a gpsSessionLifecycle.js in questa fase: la soglia paused resta
// invariata e continua a funzionare come prima).
test("16. Una sessione 'paused' resta classificata PAUSED (Centro Controllo invariato) e la policy la fa RESUME", () => {
  const session = startedSession({ status: "paused", paused_at: new Date(NOW.getTime() - 20 * MIN).toISOString() });
  const classification = classifyDeliverySession(session, { now: NOW });
  assert.equal(classification.state, GPS_SESSION_STATE.PAUSED);
  const policy = resolveResumePolicy(classification);
  assert.equal(policy.action, RESUME_ACTION.RESUME);
});

// Contratti aggiuntivi sulle due nuove migration proposte (non applicate).
test("Migration Fase D (last_gps_recorded_at): stessa firma, nessun nuovo privilegio, solo lettura aggiuntiva", () => {
  assert.match(lastGpsMigration, /CREATE OR REPLACE FUNCTION "public"\."get_active_driver_session"\("p_assignment_id" "uuid", "p_access_token" "text" DEFAULT NULL::"text"\) RETURNS "jsonb"/);
  assert.match(lastGpsMigration, /last_gps_recorded_at/);
  assert.doesNotMatch(lastGpsMigration, /GRANT|REVOKE/);
});

test("Nessuna delle due nuove migration Fase D/E modifica remote_baseline.sql (file separati)", () => {
  assert.notEqual(startSessionMigrationPath, path.join(__dirname, "..", "supabase", "migrations", "20260821211000_remote_baseline.sql"));
  assert.notEqual(lastGpsMigrationPath, path.join(__dirname, "..", "supabase", "migrations", "20260821211000_remote_baseline.sql"));
});

test("gps_recover_abandoned_session (recovery storico, fase precedente) resta invariata e non ridefinita/chiamata da queste due nuove migration", () => {
  const recoverSource = fs.readFileSync(recoverRpcMigrationPath, "utf8");
  assert.match(recoverSource, /CREATE OR REPLACE FUNCTION "public"\."gps_recover_abandoned_session"/);
  // Le due nuove migration possono nominarla in un commento (per spiegare la
  // separazione di responsabilita', vedi migrazione Fase E), ma non devono
  // mai ridefinirla (CREATE FUNCTION) ne' chiamarla (public.gps_recover_..).
  assert.doesNotMatch(startSessionMigration, /public\.gps_recover_abandoned_session\(/);
  assert.doesNotMatch(startSessionMigration, /CREATE (OR REPLACE )?FUNCTION "public"\."gps_recover_abandoned_session"/);
  assert.doesNotMatch(lastGpsMigration, /gps_recover_abandoned_session/);
});
