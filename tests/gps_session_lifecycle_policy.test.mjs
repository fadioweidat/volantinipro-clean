import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDeliverySession, summarizeDeliverySessions, GPS_SESSION_STATE } from "../src/lib/monitoring/gpsSessionLifecycle.js";
import { computeFlowHealth } from "../src/lib/monitoring/platformFlows.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselineMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260821211000_remote_baseline.sql");
const recoverRpcMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260826120000_gps_recover_abandoned_session.sql");

const NOW = new Date("2026-08-26T12:00:00.000Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function startedSession(overrides = {}) {
  return { id: "s1", status: "started", started_at: "2026-08-26T08:00:00.000Z", paused_at: null, updated_at: "2026-08-26T08:00:00.000Z", ended_at: null, ...overrides };
}

// 1. started + GPS recente => LIVE
test("started + GPS recente (2 minuti fa) => LIVE", () => {
  const session = startedSession({ updated_at: new Date(NOW.getTime() - 2 * MIN).toISOString() });
  const lastGps = new Date(NOW.getTime() - 2 * MIN).toISOString();
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: lastGps });
  assert.equal(result.state, GPS_SESSION_STATE.LIVE);
});

// 2. started + GPS vecchio (ma non enorme) => STALE
test("started + ultima attivita' 45 minuti fa => STALE (non ABANDONED, non LIVE)", () => {
  const ts = new Date(NOW.getTime() - 45 * MIN).toISOString();
  const session = startedSession({ updated_at: ts });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(result.state, GPS_SESSION_STATE.STALE);
});

// 3. started + nessun GPS appena avviata => non zombie prematuramente
test("started + nessun GPS ma avviata 1 minuto fa => LIVE, non ABANDONED prematuramente", () => {
  const session = startedSession({
    started_at: new Date(NOW.getTime() - 1 * MIN).toISOString(),
    updated_at: new Date(NOW.getTime() - 1 * MIN).toISOString(),
  });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: null });
  assert.equal(result.state, GPS_SESSION_STATE.LIVE);
});

// 4. started + nessun GPS da molte ore => ABANDONED
test("started + ultima attivita' 15 ore fa => ABANDONED (replica il caso reale delle 11 sessioni)", () => {
  const ts = new Date(NOW.getTime() - 15 * HOUR).toISOString();
  const session = startedSession({ started_at: ts, updated_at: ts });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(result.state, GPS_SESSION_STATE.ABANDONED);
});

test("started + ultima attivita' 92 giorni fa (caso reale piu' vecchio) => ABANDONED", () => {
  const ts = new Date(NOW.getTime() - 92 * 24 * HOUR).toISOString();
  const session = startedSession({ started_at: ts, updated_at: ts });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: null });
  assert.equal(result.state, GPS_SESSION_STATE.ABANDONED);
});

// 5. ended session => non LIVE
test("status='completed' => CLOSED, mai LIVE anche con updated_at recente", () => {
  const session = startedSession({ status: "completed", ended_at: NOW.toISOString(), updated_at: NOW.toISOString() });
  const result = classifyDeliverySession(session, { now: NOW });
  assert.equal(result.state, GPS_SESSION_STATE.CLOSED);
});

test("status='cancelled' => CLOSED", () => {
  const session = startedSession({ status: "cancelled", ended_at: NOW.toISOString() });
  const result = classifyDeliverySession(session, { now: NOW });
  assert.equal(result.state, GPS_SESSION_STATE.CLOSED);
});

// 6. sessione offline temporaneamente => non chiusa prematuramente
test("started + 8 minuti senza attivita' (dentro la soglia LIVE) resta LIVE: nessuna chiusura prematura", () => {
  const ts = new Date(NOW.getTime() - 8 * MIN).toISOString();
  const session = startedSession({ updated_at: ts });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: ts });
  assert.equal(result.state, GPS_SESSION_STATE.LIVE);
});

test("status='paused' senza attivita' recente NON è trattata come abbandono per mancanza di GPS (per design nessun heartbeat in pausa)", () => {
  const session = startedSession({ status: "paused", paused_at: new Date(NOW.getTime() - 30 * MIN).toISOString() });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: null });
  assert.equal(result.state, GPS_SESSION_STATE.PAUSED);
  assert.notEqual(result.state, GPS_SESSION_STATE.ABANDONED);
});

// 7. stop reale valorizza ended_at (regressione sul comportamento SQL esistente, non modificato)
test("regressione: gps_transition_session imposta ended_at=now() su 'complete' e 'cancel' (RPC esistente, non toccata)", () => {
  const sql = fs.readFileSync(baselineMigrationPath, "utf8");
  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION "public"."gps_transition_session"');
  const fnEnd = sql.indexOf("ALTER FUNCTION \"public\".\"gps_transition_session\"", fnStart);
  const fnBody = sql.slice(fnStart, fnEnd);
  assert.match(fnBody, /p_action = 'complete'[\s\S]*?set status = 'completed', ended_at = now\(\)/);
  assert.match(fnBody, /p_action = 'cancel'[\s\S]*?set status = 'cancelled'[\s\S]*?ended_at = coalesce\(ended_at, now\(\)\)/);
  // La RPC di chiusura amministrativa esiste gia' con un motivo dedicato a
  // questo esatto scenario: nessuna nuova RPC necessaria per il cleanup.
  assert.match(fnBody, /'reason', 'stale_session_recovery'/);
});

// 8. reload/ripresa non crea duplicati ingiustificati (regressione sull'indice unico esistente, non toccato)
test("regressione: l'indice unico che impedisce sessioni duplicate started/paused per driver+campagna esiste ancora", () => {
  const sql = fs.readFileSync(baselineMigrationPath, "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX "delivery_sessions_one_active_operator_campaign_uidx"[\s\S]*?WHERE \(\("assignment_id" IS NOT NULL\) AND \("status" = ANY \(ARRAY\['started'::"text", 'paused'::"text"\]\)\)\)/);
});

// 9. più sessioni dello stesso assignment non vengono confuse
test("due sessioni con lo stesso assignment_id ma attivita' diverse vengono classificate indipendentemente", () => {
  const sessions = [
    startedSession({ id: "a", started_at: new Date(NOW.getTime() - 1 * MIN).toISOString(), updated_at: new Date(NOW.getTime() - 1 * MIN).toISOString() }), // LIVE
    startedSession({ id: "b", started_at: new Date(NOW.getTime() - 20 * HOUR).toISOString(), updated_at: new Date(NOW.getTime() - 15 * HOUR).toISOString() }), // ABANDONED
  ];
  const lastGpsBySessionId = { a: new Date(NOW.getTime() - 1 * MIN).toISOString(), b: new Date(NOW.getTime() - 15 * HOUR).toISOString() };
  const { classified, counts } = summarizeDeliverySessions(sessions, lastGpsBySessionId, { now: NOW });
  const byId = Object.fromEntries(classified.map((c) => [c.session.id, c.classification.state]));
  assert.equal(byId.a, GPS_SESSION_STATE.LIVE);
  assert.equal(byId.b, GPS_SESSION_STATE.ABANDONED);
  assert.equal(counts.live, 1);
  assert.equal(counts.abandoned, 1);
});

// 10. Centro Controllo continua a mostrare FAIL/WARNING quando il problema e' reale
// (platformFlows.js NON e' stato toccato in questa fase: guardia di regressione)
test("regressione: computeFlowHealth (non modificato) continua a marcare GPS Live FAIL sui dati reali delle sessioni zombie", () => {
  const flows = computeFlowHealth({
    deliverySessions: [{ id: "zombie1", status: "started" }],
    gpsPoints: [{ session_id: "zombie1", recorded_at: new Date(NOW.getTime() - 15 * HOUR).toISOString() }],
    now: NOW,
  });
  const gpsLive = flows.find((f) => f.key === "gps_live");
  assert.equal(gpsLive.status, "fail");
});

test("summarizeDeliverySessions: conteggi coerenti su un mix realistico (replica approssimata delle 11 sessioni reali)", () => {
  const sessions = [
    startedSession({ id: "recent", started_at: new Date(NOW.getTime() - 15 * HOUR).toISOString(), updated_at: new Date(NOW.getTime() - 15 * HOUR).toISOString() }),
    startedSession({ id: "old1", started_at: new Date(NOW.getTime() - 92 * 24 * HOUR).toISOString(), updated_at: new Date(NOW.getTime() - 92 * 24 * HOUR).toISOString() }),
    startedSession({ id: "zero_gps", started_at: new Date(NOW.getTime() - 92 * 24 * HOUR).toISOString(), updated_at: new Date(NOW.getTime() - 92 * 24 * HOUR).toISOString() }),
  ];
  const { counts } = summarizeDeliverySessions(sessions, {}, { now: NOW });
  assert.equal(counts.abandoned, 3);
  assert.equal(counts.live, 0);
});

// ---- Test 18 (obbligatorio): bump amministrativo di updated_at NON deve
// far risultare LIVE una sessione vecchia con GPS vecchio ----
test("started 3 giorni fa, last GPS 3 giorni fa, updated_at=NOW per modifica admin => NON LIVE", () => {
  const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * HOUR).toISOString();
  const session = startedSession({
    started_at: threeDaysAgo,
    updated_at: NOW.toISOString(), // simula un admin che tocca la riga adesso
  });
  const result = classifyDeliverySession(session, { now: NOW, lastGpsRecordedAt: threeDaysAgo });
  assert.notEqual(result.state, GPS_SESSION_STATE.LIVE);
  assert.equal(result.state, GPS_SESSION_STATE.ABANDONED);
});

test("updated_at contaminato (bump amministrativo) non influenza affatto la classificazione: stesso risultato con o senza il bump", () => {
  const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * HOUR).toISOString();
  const withoutBump = classifyDeliverySession(
    startedSession({ started_at: threeDaysAgo, updated_at: threeDaysAgo }),
    { now: NOW, lastGpsRecordedAt: threeDaysAgo }
  );
  const withBump = classifyDeliverySession(
    startedSession({ started_at: threeDaysAgo, updated_at: NOW.toISOString() }),
    { now: NOW, lastGpsRecordedAt: threeDaysAgo }
  );
  assert.equal(withoutBump.state, withBump.state);
  assert.equal(withBump.ageMs, withoutBump.ageMs);
});

// ============================================================================
// gps_recover_abandoned_session — test di contratto sulla migration SQL
// (nessun DB live in CI: stesso stile gia' usato per site_events/error_log
// RLS — assert su testo sorgente della funzione, non esecuzione reale).
// ============================================================================

function readRecoverRpcBody() {
  const sql = fs.readFileSync(recoverRpcMigrationPath, "utf8");
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION "public"."gps_recover_abandoned_session"');
  const end = sql.indexOf("ALTER FUNCTION \"public\".\"gps_recover_abandoned_session\"", start);
  assert.ok(start >= 0 && end > start, "funzione gps_recover_abandoned_session non trovata nella migration");
  return sql.slice(start, end);
}

test("1. non-admin => denied (controllo gps_is_admin() prima di qualunque modifica)", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /if not public\.gps_is_admin\(\) then\s*\n\s*raise exception 'SOLO_ADMIN'/);
});

test("2. sessione inesistente => denied/error", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /if not found then\s*\n\s*raise exception 'SESSIONE_NON_TROVATA'/);
});

test("3/4. completed o cancelled => non modificata (fail closed, idempotenza controllata)", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /if v_session\.status in \('completed', 'cancelled'\) then\s*\n\s*raise exception 'SESSIONE_GIA_CHIUSA/);
});

test("5/6. started o paused con ended_at valido => path di accettazione raggiungibile (nessun blocco su questi stati)", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /p_expected_current_status not in \('started', 'paused'\)/);
  // Il blocco di rifiuto sopra copre SOLO 'completed'/'cancelled' — started/paused
  // non vengono mai rifiutati per il solo motivo dello status.
  assert.doesNotMatch(body, /status in \('started', 'paused'\)\s*then\s*\n\s*raise exception/);
});

test("7. ended_at prima di started_at => rejected", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /p_ended_at < v_session\.started_at then\s*\n\s*raise exception 'ENDED_AT_PRIMA_DI_STARTED_AT'/);
});

test("8. ended_at futuro => rejected", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /p_ended_at > now\(\) then\s*\n\s*raise exception 'ENDED_AT_NEL_FUTURO'/);
});

test("9. ended_at NULL => resta NULL (mai sostituito con now(), a differenza di gps_transition_session)", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /ended_at = p_ended_at,/);
  assert.doesNotMatch(body, /ended_at = coalesce\(ended_at, now\(\)\)/);
  assert.doesNotMatch(body, /ended_at = now\(\)/);
});

test("10. metadata precedente preservato (coalesce + concatenazione, mai sovrascrittura)", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /metadata = coalesce\(metadata, '\{\}'::jsonb\) \|\| jsonb_build_object/);
});

test("11. metadata di recovery aggiunto con tutti i campi richiesti", () => {
  const body = readRecoverRpcBody();
  for (const key of ["recovery_reason", "recovered_by_admin", "recovered_at", "previous_status", "historical_ended_at_source"]) {
    assert.match(body, new RegExp(`'${key}'`), `metadata deve includere ${key}`);
  }
});

test("12. updated_at puo' essere now() (riflette quando l'admin ha fatto il recovery)", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /updated_at = now\(\)/);
});

test("13. ended_at non diventa now() implicitamente in nessun punto della funzione", () => {
  const body = readRecoverRpcBody();
  const endedAtAssignments = body.match(/ended_at\s*=\s*[^,\n]+/g) || [];
  assert.ok(endedAtAssignments.length > 0, "nessuna assegnazione a ended_at trovata");
  for (const assignment of endedAtAssignments) {
    assert.doesNotMatch(assignment, /now\(\)/, `assegnazione sospetta: ${assignment}`);
  }
});

test("source='last_gps_recorded_at': la RPC verifica server-side che p_ended_at corrisponda a MAX(gps_tracking_points.recorded_at), non si fida del chiamante", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /p_ended_at_source = 'last_gps_recorded_at' then/);
  assert.match(body, /select max\(recorded_at\) into v_max_gps_recorded_at\s*\n\s*from public\.gps_tracking_points\s*\n\s*where session_id = p_session_id/);
  assert.match(body, /if v_max_gps_recorded_at is null then\s*\n\s*raise exception 'NESSUN_PUNTO_GPS_PER_LAST_GPS_RECORDED_AT/);
  assert.match(body, /if p_ended_at is null or abs\(extract\(epoch from \(p_ended_at - v_max_gps_recorded_at\)\)\) > 1 then\s*\n\s*raise exception 'ENDED_AT_NON_CORRISPONDE_A_MAX_GPS_RECORDED_AT/);
});

test("source='no_gps_evidence': la RPC verifica server-side che esistano zero gps_tracking_points e che p_ended_at sia NULL", () => {
  const body = readRecoverRpcBody();
  assert.match(body, /elsif p_ended_at_source = 'no_gps_evidence' then/);
  assert.match(body, /select count\(\*\) into v_gps_point_count\s*\n\s*from public\.gps_tracking_points\s*\n\s*where session_id = p_session_id/);
  assert.match(body, /if v_gps_point_count > 0 then\s*\n\s*raise exception 'GPS_PRESENTE_MA_SOURCE_DICHIARA_NO_GPS_EVIDENCE/);
  assert.match(body, /if p_ended_at is not null then\s*\n\s*raise exception 'ENDED_AT_DEVE_ESSERE_NULL_PER_NO_GPS_EVIDENCE'/);
});

test("la tolleranza sulla verifica last_gps_recorded_at e' di 1 secondo (solo precisione timestamp, non un margine arbitrario)", () => {
  const body = readRecoverRpcBody();
  const match = body.match(/abs\(extract\(epoch from \(p_ended_at - v_max_gps_recorded_at\)\)\) > (\d+(?:\.\d+)?)/);
  assert.ok(match, "tolleranza non trovata");
  assert.equal(Number(match[1]), 1);
});

test("firma RPC: 5 parametri, solo authenticated puo' chiamarla (nessun accesso anon)", () => {
  const sql = fs.readFileSync(recoverRpcMigrationPath, "utf8");
  assert.match(sql, /"p_session_id" "uuid",\s*\n\s*"p_ended_at" timestamptz DEFAULT NULL,\s*\n\s*"p_reason" "text" DEFAULT NULL,\s*\n\s*"p_expected_current_status" "text" DEFAULT 'started',\s*\n\s*"p_ended_at_source" "text" DEFAULT NULL/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION "public"\."gps_recover_abandoned_session"[^;]*TO "authenticated"/);
  assert.doesNotMatch(sql, /GRANT[^;]*"gps_recover_abandoned_session"[^;]*TO "anon"/);
});

test("REVOKE esplicito da anon presente (REVOKE FROM PUBLIC da solo non basta con i privilegi di default dello schema Supabase)", () => {
  const sql = fs.readFileSync(recoverRpcMigrationPath, "utf8");
  assert.match(sql, /REVOKE ALL ON FUNCTION "public"\."gps_recover_abandoned_session"[^;]*FROM "anon"/);
});

test("nessun nuovo stato 'abandoned' aggiunto al CHECK constraint di delivery_sessions.status", () => {
  const sql = fs.readFileSync(recoverRpcMigrationPath, "utf8");
  assert.doesNotMatch(sql, /ALTER TABLE[^;]*delivery_sessions[^;]*ADD CONSTRAINT/i);
  assert.doesNotMatch(sql, /ADD CONSTRAINT[^;]*status_check/i);
  assert.doesNotMatch(sql, /DROP CONSTRAINT[^;]*status_check/i);
  // Lo stato finale scritto e' sempre 'cancelled', mai un nuovo enum.
  assert.match(sql, /status = 'cancelled'/);
});

test("nessun cron/job/trigger automatico introdotto da questa migration", () => {
  const sql = fs.readFileSync(recoverRpcMigrationPath, "utf8");
  assert.doesNotMatch(sql, /pg_cron|cron\.schedule|CREATE (OR REPLACE )?TRIGGER/i);
});
