import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// 1. device installation id + session claim (helper puro, localStorage mock)
// ---------------------------------------------------------------------------

async function withLocalStorage(fn) {
  const store = new Map();
  const prevWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  try {
    return await fn(store);
  } finally {
    globalThis.window = prevWindow;
  }
}

test('deviceInstallationId: id stabile, persistito, non-fingerprint', async () => {
  await withLocalStorage(async () => {
    const mod = await import(`../src/lib/gps/deviceInstallationId.js?case=stable`);
    const a = mod.getDeviceInstallationId();
    const b = mod.getDeviceInstallationId();
    assert.equal(typeof a, 'string');
    assert.ok(a.length >= 8);
    assert.equal(a, b, 'stesso valore alla seconda lettura');
  });
});

test('deviceInstallationId: claim per scope roundtrip + clear', async () => {
  await withLocalStorage(async () => {
    const mod = await import(`../src/lib/gps/deviceInstallationId.js?case=claim`);
    assert.equal(mod.readSessionClaim('assign-1'), null);
    mod.writeSessionClaim('assign-1', 'sess-A');
    const claim = mod.readSessionClaim('assign-1');
    assert.equal(claim.sessionId, 'sess-A');
    assert.ok(claim.deviceId && claim.at);
    mod.clearSessionClaim('assign-1');
    assert.equal(mod.readSessionClaim('assign-1'), null);
  });
});

test('deviceInstallationId: nessun accesso a hardware/fingerprint', () => {
  const src = read('src/lib/gps/deviceInstallationId.js');
  // Solo le RIGHE DI CODICE (non i commenti) non devono toccare API hw.
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /canvas|webgl|userAgent|navigator\.|screen\.|getBattery|\.fonts/i);
  assert.match(code, /crypto\.randomUUID|Math\.random/);
});

// ---------------------------------------------------------------------------
// 2. Migrazione device-ownership (preparata, NON applicata)
// ---------------------------------------------------------------------------

const mig1 = read('supabase/migrations/20260829140000_gps_session_device_ownership.sql');

test('migration device-ownership: RPC _v2, blocco pausa + completed + device mismatch', () => {
  assert.match(mig1, /raise exception 'PAUSED_SESSION'/);
  assert.match(mig1, /raise exception 'SESSION_COMPLETED'/);
  assert.match(mig1, /raise exception 'DEVICE_MISMATCH'/);
  // 3 nuove funzioni _v2 con p_device_id (le v1 restano intatte).
  for (const fn of ['gps_insert_point_v2', 'gps_transition_session_v2', 'get_active_driver_session_v2']) {
    assert.match(mig1, new RegExp(`create or replace function public\\.${fn}\\(`), `${fn} deve essere creata`);
    const body = mig1.slice(mig1.indexOf(`function public.${fn}(`));
    assert.match(body.slice(0, 500), /p_device_id text default null/i, `${fn} deve accettare p_device_id`);
  }
  assert.match(mig1, /jsonb_build_object\('session', null, 'blocked', 'device_mismatch'\)/);
  // SECURITY DEFINER su tutte e 3 le funzioni + grant solo authenticated.
  assert.ok((mig1.match(/language plpgsql\s+security definer/gi) || []).length >= 3);
  assert.match(mig1, /grant execute on function public\.gps_insert_point_v2[\s\S]*?to authenticated/);
});

test('migration device-ownership: backward-compatible (nessun DROP), transazionale', () => {
  assert.match(mig1, /^begin;/m);
  assert.match(mig1, /^commit;/m);
  // ZERO DROP: le RPC v1 restano vive -> nessuna finestra di incompatibilita'.
  assert.doesNotMatch(mig1, /\bdrop\s+function\b/i);
  assert.doesNotMatch(mig1, /drop table|truncate|delete from|db reset|db push/i);
  assert.doesNotMatch(mig1, /drop\s+(table|schema|database|type|trigger|policy|index|role|view|sequence)\b/i);
});

// ---------------------------------------------------------------------------
// 3. Migrazione admin unlock device (preparata, NON applicata)
// ---------------------------------------------------------------------------

const mig2 = read('supabase/migrations/20260829150000_gps_admin_unlock_device.sql');

test('migration admin-unlock: admin-only, azzera device_id, preserva tutto', () => {
  assert.match(mig2, /function public\.gps_admin_unlock_device/);
  assert.match(mig2, /gps_is_admin\(\)/);
  assert.match(mig2, /raise exception 'SOLO_ADMIN'/);
  assert.match(mig2, /set device_id = null/);
  assert.match(mig2, /gps_operator_audit_log/);
  assert.match(mig2, /'device_unlocked'/);
  // Non cancella sessioni ne' punti GPS.
  assert.doesNotMatch(mig2, /delete from public\.(gps_tracking_points|delivery_sessions)/i);
  assert.doesNotMatch(mig2, /drop table|truncate|db reset|db push/i);
  assert.match(mig2, /^begin;/m);
  assert.match(mig2, /^commit;/m);
});

// ---------------------------------------------------------------------------
// 4. Frontend: classificazione errori + wiring hook
// ---------------------------------------------------------------------------

test('gps-api: PAUSED_SESSION / SESSION_COMPLETED / DEVICE_MISMATCH sono errori permanenti', () => {
  const src = read('src/lib/services/gps-api.js');
  for (const code of ['paused_session', 'session_completed', 'device_mismatch']) {
    assert.match(src, new RegExp(`includes\\('${code}'\\)`), `isPermanentGpsWriteError deve coprire ${code}`);
  }
  for (const code of ['PAUSED_SESSION', 'SESSION_COMPLETED', 'DEVICE_MISMATCH']) {
    assert.match(src, new RegExp(`includes\\('${code}'\\)`), `mapRpcError deve coprire ${code}`);
  }
});

test('useGpsTracking: device id passato allo start, claim gestito, blocco device-mismatch al resume', () => {
  const src = read('src/hooks/useGpsTracking.js');
  assert.match(src, /from '\.\.\/lib\/gps\/deviceInstallationId\.js'/);
  assert.match(src, /startGpsSession\(campaignId, \{[\s\S]*?deviceId: deviceInstallationId/);
  assert.match(src, /writeSessionClaim\(sessionScope, nextSession\.id\)/);
  assert.match(src, /clearSessionClaim\(sessionScope\)/);
  // resume: non adottare una sessione di un altro device.
  assert.match(src, /existing\.device_id !== deviceInstallationId/);
  assert.match(src, /setResumeNotice\(\{ level: 'blocked', message: DEVICE_CONFLICT_MESSAGE/);
  assert.match(src, /attivo su un altro dispositivo/);
  assert.match(src, /Contatta l.{0,4}Admin per una nuova assegnazione/);
});

// ---------------------------------------------------------------------------
// 5. UI driver + admin
// ---------------------------------------------------------------------------

test('Driver UI: il messaggio "altro dispositivo" e\' renderizzato', () => {
  for (const p of ['src/pages/driver/DriverAssignmentPage.jsx', 'src/pages/driver/TrackingPage.jsx']) {
    assert.match(read(p), /resumeNotice\?\.level === 'blocked'/, `${p} deve mostrare resumeNotice bloccato`);
  }
});

test('Admin: link personale marcato "non condividere"', () => {
  assert.match(read('src/pages/admin/CampaignAssignments.jsx'), /non condividere con altri operatori/i);
  assert.match(read('src/pages/admin/AdminOperationsCenter.jsx'), /non condividere con altri operatori/i);
  // Contesto gia' esistente: lo step di assegnazione lo chiama gia' link personale.
  assert.match(read('src/pages/admin/assign-work/AssignWorkResultStep.jsx'), /[Ll]ink personale/);
});

// ---------------------------------------------------------------------------
// 6. p_device_id wiring completo (RPC _v2 + fallback zero-downtime)
// ---------------------------------------------------------------------------

const gpsApi = read('src/lib/services/gps-api.js');

test('gps-api: callGpsRpcVersioned ricade sulla versione precedente solo su "not found"', () => {
  assert.match(gpsApi, /function isRpcNotFound/);
  assert.match(gpsApi, /PGRST202/);
  assert.match(gpsApi, /async function callGpsRpcVersioned\(specs\)/);
  const fb = gpsApi.slice(gpsApi.indexOf('async function callGpsRpcVersioned'), gpsApi.indexOf('async function callGpsRpcVersioned') + 500);
  // Fallback SOLO se non e' l'ultima versione E l'errore e' "not found".
  assert.match(fb, /if \(i < specs\.length - 1 && isRpcNotFound\(error\)\) continue;/);
  assert.match(fb, /throw error;/);
  // Grant mancante (permission denied) -> trattato come "not found" -> fallback.
  assert.match(gpsApi, /message\.includes\('permission denied for function'\)/);
});

test('gps-api: insert/transition/get_active provano _v3 -> _v2 -> v1 con p_device_id', () => {
  for (const [v3, v2, v1] of [
    ['gps_insert_point_v3', 'gps_insert_point_v2', 'gps_insert_point'],
    ['gps_transition_session_v3', 'gps_transition_session_v2', 'gps_transition_session'],
    ['get_active_driver_session_v3', 'get_active_driver_session_v2', 'get_active_driver_session'],
  ]) {
    assert.match(gpsApi, new RegExp(`name: '${v3}'`), `${v3} deve essere provata per prima`);
    assert.match(gpsApi, new RegExp(`name: '${v2}'`), `${v2} deve restare nella catena`);
    assert.match(gpsApi, new RegExp(`name: '${v1}'`), `${v1} deve restare come ultimo fallback`);
  }
  assert.match(gpsApi, /import \{ getDeviceInstallationId \} from '\.\.\/gps\/deviceInstallationId\.js'/);
  assert.match(gpsApi, /p_device_id: getDeviceInstallationId\(\)/);
  assert.match(gpsApi, /p_device_id: deviceId/); // transitionSession helper
  assert.match(gpsApi, /data\?\.blocked === 'device_mismatch'/);
  assert.match(gpsApi, /_blocked: 'device_mismatch'/);
});

test('useGpsTracking: gestisce il blocco device-mismatch da get_active v2', () => {
  const src = read('src/hooks/useGpsTracking.js');
  assert.match(src, /existing\?\._blocked === 'device_mismatch'/);
});

// ---------------------------------------------------------------------------
// 7. GROUP SHARED TRACKS
// ---------------------------------------------------------------------------

const mig3 = read('supabase/migrations/20260829160000_get_driver_group_tracking.sql');

test('migration group-tracking: stesso group_id, payload safe, autorizzazione assignment', () => {
  assert.match(mig3, /function public\.get_driver_group_tracking/);
  assert.match(mig3, /security definer/i);
  assert.match(mig3, /gps_assignment_is_valid/);
  // Filtro obbligatorio group_id (deriva dall'assignment del chiamante, non da un parametro).
  assert.match(mig3, /s\.group_id = v_assignment\.group_id/);
  assert.match(mig3, /s\.campaign_id = v_assignment\.campaign_id/);
  // Payload safe: nessuna CHIAVE jsonb con dati personali (le chiavi sono
  // sempre stringhe quotate dentro jsonb_build_object).
  for (const forbidden of ['driver_id', 'driver_name', 'driver_phone', 'device_id', 'access_token', 'assignment_id', 'metadata', 'group_id', 'email']) {
    assert.doesNotMatch(mig3, new RegExp(`jsonb_build_object\\([\\s\\S]*?'${forbidden}'`), `payload non deve avere la chiave '${forbidden}'`);
  }
  assert.match(mig3, /case when g\.is_self then 'Tu'/);
  assert.match(mig3, /grant execute on function public\.get_driver_group_tracking\(uuid, text\) to authenticated/);
  assert.doesNotMatch(mig3, /\bdrop\s+function\b|drop table|truncate|delete from|db reset|db push/i);
});

test('gps-api getDriverGroupTracking: raggruppa per sessione, filtro per sessione, etichette non-UUID', () => {
  assert.match(gpsApi, /export async function getDriverGroupTracking/);
  const fn = gpsApi.slice(gpsApi.indexOf('export async function getDriverGroupTracking'), gpsApi.indexOf('export async function adminUnlockDevice'));
  assert.match(fn, /groupGpsPointsBySession\(points\)/);
  assert.match(fn, /filterValidGpsPoints\(raw\)/);
  assert.match(fn, /s\.is_self \? 'Tu' :/);
  assert.match(fn, /Operatore \$\{index \+ 1\}/);
  // Fallback pulito se la RPC non e' ancora live.
  assert.match(fn, /if \(isRpcNotFound\(error\)\) return \{ self: null, others: \[\] \}/);
});

test('DriverWorkMapPage: traccia propria + tracce gruppo, una polyline per sessione, legenda "Tu"', () => {
  const src = read('src/pages/driver/DriverWorkMapPage.jsx');
  assert.match(src, /getDriverGroupTracking\(assignmentId, accessToken\)/);
  assert.match(src, /groupLines\.map\(/);
  assert.match(src, /<Polyline positions=\{g\.latlngs\}/);
  assert.match(src, /background: '#2563eb'[\s\S]{0,40}Tu/); // legenda: la propria = "Tu"
  assert.doesNotMatch(src, /g\.sessionId\}<\/|>\{g\.sessionId\}</); // mai UUID in UI
});

// ---------------------------------------------------------------------------
// 8. ADMIN UNLOCK DEVICE — UI
// ---------------------------------------------------------------------------

test('GpsMonitor: "Sblocca dispositivo" collegato alla RPC admin, con conferma + motivo', () => {
  const src = read('src/pages/admin/GpsMonitor.jsx');
  assert.match(src, /import \{[^}]*adminUnlockDevice[^}]*\} from '\.\.\/\.\.\/lib\/services\/gps-api\.js'/);
  assert.match(src, /const handleUnlockDevice = async \(sessionId\)/);
  assert.match(src, /window\.confirm\('Vuoi scollegare il dispositivo/);
  assert.match(src, /window\.prompt\('Motivo dello sblocco \(obbligatorio\)/);
  assert.match(src, /Sblocca dispositivo/);
  assert.match(src, /adminUnlockDevice\(sessionId, reason\.trim\(\)\)/);
});

test('gps-api adminUnlockDevice: RPC gps_admin_unlock_device, motivo troncato', () => {
  assert.match(gpsApi, /export async function adminUnlockDevice/);
  assert.match(gpsApi, /callGpsRpc\('gps_admin_unlock_device', \{/);
  assert.match(gpsApi, /p_reason: reason \? String\(reason\)\.trim\(\)\.slice\(0, 500\) : null/);
});

// ---------------------------------------------------------------------------
// 9. Zona "Completata" — il Driver puo' comunque ripartire (root cause
//    "il Driver apre l'app ma l'Admin resta offline")
// ---------------------------------------------------------------------------

test('DriverAssignmentPage: zona Completata NON blocca l\'avvio quando nessuna sessione e\' attiva', () => {
  const src = read('src/pages/driver/DriverAssignmentPage.jsx');
  // Il pulsante di avvio non e' piu' gate-ato su z.status !== 'Completata'.
  const btnBlock = src.slice(src.indexOf("Programma Operativo"), src.indexOf("Termina lavoro"));
  assert.doesNotMatch(btnBlock, /z\.status !== 'Completata' && !isCurrentZone/);
  // Condizione nuova: avvio disponibile quando non e' la zona corrente e non
  // c'e' sessione attiva/in pausa; etichetta "Riprendi zona" se Completata.
  assert.match(src, /!isCurrentZone && !tracking\.isActive && !tracking\.isPaused/);
  assert.match(src, /z\.status === 'Completata' \? 'Riprendi zona' : 'Inizia'/);
  assert.match(src, /tracking\.start\(z\.id\)/);
});

// ---------------------------------------------------------------------------
// 10. "Termina lavoro" chiude SOLO la sessione, mai la zona/campagna;
//     stato campagna Admin = campaigns.status (DB), non derivato dalle sessioni
// ---------------------------------------------------------------------------

test('Driver "Termina lavoro" NON chiama completeZone (zona resta aperta per il gruppo)', () => {
  for (const p of ['src/pages/driver/DriverAssignmentPage.jsx', 'src/pages/driver/TrackingPage.jsx']) {
    const src = read(p);
    const btnAt = src.lastIndexOf('Termina lavoro');
    const handler = src.slice(btnAt - 900, btnAt);
    assert.ok(handler.includes('tracking.end'), `${p}: deve chiudere la sessione`);
    assert.doesNotMatch(handler, /tracking\.completeZone/, `${p}: NON deve completare la zona`);
    assert.match(handler, /La zona resta comunque aperta per gli altri operatori/, `${p}: conferma deve spiegarlo`);
  }
});

test('deriveCampaignStatus: campaigns.status DB e\' la fonte di verita\', non le sessioni', () => {
  for (const p of ['src/pages/admin/GpsMonitor.jsx', 'src/pages/customer/CampaignTracking.jsx']) {
    const src = read(p);
    assert.match(src, /function deriveCampaignStatus\(sessions, campaignRecord\)/, `${p}: firma con campaignRecord`);
    assert.match(src, /campaignRecord\?\.status \|\| campaignRecord\?\.stato/, `${p}: legge lo stato dal record campagna`);
    assert.match(src, /deriveCampaignStatus\(state\.sessions, state\.campaign\)/, `${p}: passa state.campaign`);
    // in_progress -> "in corso" anche se tutte le sessioni sono completed.
    assert.match(src, /in_progress: 'in corso'/);
  }
});
