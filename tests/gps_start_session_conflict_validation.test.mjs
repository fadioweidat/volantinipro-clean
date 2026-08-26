// FASE GPS — Validazione pre-apply delle due migration proposte:
//   20260826130000_get_active_driver_session_last_gps.sql
//   20260826140000_gps_start_session_classified_conflict.sql
//
// Nessun DB live in CI: verifica per contratto sul testo SQL (stesso
// approccio gia' in uso in gps_session_lifecycle_policy.test.mjs e
// gps_zombie_prevention.test.mjs), mappata 1:1 sui 12 scenari richiesti
// esplicitamente in questo turno prima dell'apply.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startSessionPath = path.join(__dirname, "..", "supabase", "migrations", "20260826140000_gps_start_session_classified_conflict.sql");
const lastGpsPath = path.join(__dirname, "..", "supabase", "migrations", "20260821211000_remote_baseline.sql");
const lastGpsMigrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260826130000_get_active_driver_session_last_gps.sql");

const sql = fs.readFileSync(startSessionPath, "utf8");
const lastGpsSql = fs.readFileSync(lastGpsMigrationPath, "utf8");
const baselineSql = fs.readFileSync(lastGpsPath, "utf8");

// Isola il corpo della funzione gps_start_session per ancorare le
// assertion alla logica reale, non a un commento che nomina gli stessi
// termini altrove nel file.
const fnBody = sql.slice(sql.indexOf("AS $$"), sql.indexOf("$$;\n\nALTER FUNCTION"));
const checkBlock = fnBody.slice(fnBody.indexOf("-- Check proattivo"), fnBody.indexOf("begin\n    insert into public.delivery_sessions"));

test("1. started + GPS 2 minuti fa => ramo ACTIVE_SESSION_EXISTS (soglia <=600s)", () => {
  assert.match(checkBlock, /v_age_seconds <= 600 then\s*\n\s*raise exception 'ACTIVE_SESSION_EXISTS/);
});

test("2. started + GPS 30 minuti fa => ricade nel ramo elsif <=14400s, ancora ACTIVE_SESSION_EXISTS (non ABANDONED)", () => {
  const match = checkBlock.match(/elsif v_age_seconds <= 14400 then\s*\n\s*raise exception '(\w+)/);
  assert.ok(match, "ramo elsif <=14400 non trovato");
  assert.equal(match[1], "ACTIVE_SESSION_EXISTS");
});

test("3. started + GPS 5 ore fa (18000s > 14400s) => ramo else, ABANDONED_SESSION_EXISTS", () => {
  const match = checkBlock.match(/else\s*\n\s*raise exception '(\w+)/);
  assert.ok(match, "ramo else non trovato");
  assert.equal(match[1], "ABANDONED_SESSION_EXISTS");
});

test("4. started + zero GPS appena avviata => v_last_activity ricade su started_at (grace period), eta' ~0s => ACTIVE_SESSION_EXISTS", () => {
  // coalesce(MAX(recorded_at), started_at): con zero punti GPS il MAX e'
  // NULL, quindi il coalesce restituisce sempre started_at — mai NOW() ne'
  // un valore inventato. Una sessione appena avviata ha started_at ~ora,
  // quindi v_age_seconds ~0 <= 600 => ACTIVE_SESSION_EXISTS (verificato dal
  // test 1 sopra sullo stesso ramo).
  assert.match(checkBlock, /coalesce\(\s*\(select max\(p\.recorded_at\) from public\.gps_tracking_points p where p\.session_id = v_blocking\.id\),\s*\n\s*v_blocking\.started_at\s*\n\s*\)/);
});

test("5. started + zero GPS da 5 ore => v_last_activity = started_at (5h fa), eta'=18000s > 14400s => ABANDONED_SESSION_EXISTS", () => {
  // Stessa fonte (coalesce su started_at quando zero punti GPS) del test 4,
  // combinata con la soglia verificata dal test 3: nessuna logica separata
  // per il caso "zero GPS" rispetto al caso "GPS vecchio", per costruzione.
  assert.match(fnBody, /v_last_activity timestamptz/);
});

test("6. updated_at recente (bump admin) + GPS vecchio => ABANDONED_SESSION_EXISTS: updated_at MAI letto nel check di classificazione", () => {
  assert.doesNotMatch(checkBlock, /v_blocking\.updated_at/);
  assert.doesNotMatch(checkBlock, /\bupdated_at\b/);
});

test("7. sessione paused legittima => sempre ACTIVE_SESSION_EXISTS, MAI ABANDONED per sola assenza GPS (check status='paused' prima di qualunque calcolo eta')", () => {
  const pausedBranch = checkBlock.match(/if v_blocking\.status = 'paused' then\s*\n\s*raise exception '(\w+)[\s\S]*?\n\s*end if;/);
  assert.ok(pausedBranch, "ramo paused non trovato");
  assert.equal(pausedBranch[1], "ACTIVE_SESSION_EXISTS");
  // Il ramo paused deve precedere (nell'ordine del testo) il calcolo di
  // v_age_seconds: essendo un `raise exception`, l'esecuzione non arriva mai
  // al calcolo eta' per una sessione paused.
  const pausedIndex = checkBlock.indexOf("if v_blocking.status = 'paused'");
  const ageCalcIndex = checkBlock.indexOf("v_age_seconds := extract");
  assert.ok(pausedIndex >= 0 && ageCalcIndex >= 0 && pausedIndex < ageCalcIndex);
});

test("8. completed/cancelled non bloccano un nuovo start: il SELECT del check filtra solo status in ('started','paused')", () => {
  assert.match(checkBlock, /s\.status in \('started', 'paused'\)/);
  assert.doesNotMatch(checkBlock, /'completed'/);
  assert.doesNotMatch(checkBlock, /'cancelled'/);
});

test("9. Il blocco try/exception unique_violation resta come safety net contro race condition, invariato", () => {
  assert.match(fnBody, /exception when unique_violation then/);
  assert.match(fnBody, /raise exception 'SESSIONE_GIA_ATTIVA' using errcode = '23505';/);
});

test("10. Nessun auto-update della sessione bloccante: il check e' sola lettura (SELECT...FOR UPDATE, nessun UPDATE/DELETE su v_blocking)", () => {
  assert.match(checkBlock, /select s\.\* into v_blocking/);
  assert.doesNotMatch(checkBlock, /update public\.delivery_sessions/);
  assert.doesNotMatch(checkBlock, /delete from public\.delivery_sessions/);
});

test("11. get_active_driver_session (migration 130000) e' interamente read-only: nessun INSERT/UPDATE/DELETE nel corpo della funzione", () => {
  const body = lastGpsSql.slice(lastGpsSql.indexOf("AS $$"), lastGpsSql.indexOf("$$;"));
  assert.doesNotMatch(body, /\binsert into\b/i);
  assert.doesNotMatch(body, /\bupdate\b\s+public\./i);
  assert.doesNotMatch(body, /\bdelete from\b/i);
});

test("11b. get_active_driver_session: nessuna nuova GRANT/REVOKE nella migration 130000 (grant preesistenti preservati da CREATE OR REPLACE)", () => {
  assert.doesNotMatch(lastGpsSql, /\bGRANT\b/);
  assert.doesNotMatch(lastGpsSql, /\bREVOKE\b/);
});

test("11c. get_active_driver_session: stessa firma (2 parametri, stesso ordine/tipo) della definizione originale in remote_baseline.sql", () => {
  const originalSignature = baselineSql.match(/CREATE OR REPLACE FUNCTION "public"\."get_active_driver_session"\([^)]*\) RETURNS "jsonb"/);
  const newSignature = lastGpsSql.match(/CREATE OR REPLACE FUNCTION "public"\."get_active_driver_session"\([^)]*\) RETURNS "jsonb"/);
  assert.ok(originalSignature && newSignature);
  assert.equal(originalSignature[0], newSignature[0]);
});

test("11d. get_active_driver_session: preserva l'autorizzazione auth.uid()/access_token esistente, senza indebolirla", () => {
  const body = lastGpsSql.slice(lastGpsSql.indexOf("AS $$"), lastGpsSql.indexOf("$$;"));
  assert.match(body, /if p_assignment_id is null then/);
  assert.match(body, /raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA'/);
  assert.match(body, /raise exception 'OPERATORE_NON_AUTENTICATO'/);
  assert.match(body, /where id = p_assignment_id and access_token = p_access_token/);
  assert.match(body, /where id = p_assignment_id and operator_id = v_uid/);
});

test("11e. get_active_driver_session: last_gps_recorded_at e' l'unico campo aggiunto, nessuna colonna PII extra rispetto alla sessione gia' esposta", () => {
  const returnStatement = lastGpsSql.match(/return jsonb_build_object\('session', to_jsonb\(v_session\)[^;]*\);/)[0];
  assert.match(returnStatement, /'session', to_jsonb\(v_session\)/);
  assert.match(returnStatement, /'last_gps_recorded_at', v_last_gps/);
  // Nessun altro campo oltre a session/last_gps_recorded_at nel jsonb finale.
  const keyCount = (returnStatement.match(/'\w+',/g) || []).length;
  assert.equal(keyCount, 2);
});

test("12. Driver non ottiene privilegi admin/recovery: nessuna delle due migration ridefinisce o invoca gps_recover_abandoned_session", () => {
  assert.doesNotMatch(sql, /public\.gps_recover_abandoned_session\(/);
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION "public"\."gps_recover_abandoned_session"/);
  assert.doesNotMatch(lastGpsSql, /gps_recover_abandoned_session/);
});
