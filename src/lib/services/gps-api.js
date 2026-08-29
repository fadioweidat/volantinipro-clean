import { supabase, ensureSupabaseSessionBridge } from '../../supabaseClient.js';
import { calculateFilteredDistanceKm, filterValidGpsPoints } from '../gps/pointQuality.js';
import { getDeviceInstallationId } from '../gps/deviceInstallationId.js';

const RETRY_DELAYS_MS = [800, 1800, 4000];
const GPS_DRIVER_MISMATCH_MESSAGE = 'Il driver autenticato non corrisponde alla sessione GPS.';

// Il login (LoginPage/consumeSupabaseAuthHash) salva la sessione nel formato
// REST leggero (localStorage "vp_supabase_session"), non nel client SDK
// ufficiale usato da questo modulo: senza bridge esplicito client.auth.getUser()
// resta sempre non autenticato anche subito dopo un login riuscito, con lo
// stesso identico sintomo "Autenticazione Supabase non disponibile" osservato
// sul flusso Driver. Stesso bridge gia' usato da TerritorialReport.jsx.
async function requireSupabase() {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  return supabase;
}

// Verifica leggera "c'e' una sessione Supabase?" senza sollevare eccezioni:
// usata dalla UI (TrackingPage) per distinguere "nessun login" (mostra CTA di
// accesso) da altri errori (assegnazione mancante, operatore sospeso, ...).
export async function hasSupabaseSession() {
  const client = await requireSupabase();
  const { data, error } = await client.auth.getUser();
  return Boolean(!error && data?.user?.id);
}

async function getCurrentUser() {
  const client = await requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw permanentGpsError('gps_auth_unavailable', error);
  if (!data?.user?.id) throw permanentGpsError('gps_auth_required');
  return data.user;
}

async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user.id;
}

function permanentGpsError(code, cause) {
  const error = new Error(gpsErrorMessage(code));
  error.code = code;
  error.permanent = true;
  if (cause) error.cause = cause;
  return error;
}

export function isPermanentGpsWriteError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return Boolean(
    error?.permanent ||
      ['42501', '22023', '23505', 'p0002'].includes(code) ||
      message.includes('operatore_non_autenticato') ||
      message.includes('assegnazione_non_autorizzata') ||
      message.includes('sessione_non_autorizzata') ||
      message.includes('sessione_gia_attiva') ||
      message.includes('zona_non_autorizzata') ||
      message.includes('coordinate_non_valide') ||
      message.includes('transizione_sessione_non_valida') ||
      message.includes('paused_session') ||
      message.includes('session_completed') ||
      message.includes('device_mismatch'),
  );
}

function gpsErrorMessage(code) {
  const messages = {
    gps_auth_required: 'Login Supabase richiesto per usare il tracking GPS.',
    gps_auth_unavailable: 'Autenticazione Supabase non disponibile.',
    assignment_missing: 'Nessuna assegnazione GPS valida per questa campagna.',
    assignment_ambiguous: 'Sono presenti più assegnazioni valide: serve una scelta Admin.',
    assignment_invalid_campaign: 'Campagna GPS non valida.',
    assignment_access_denied: 'Assegnazione GPS non autorizzata.',
    operator_suspended: 'Operatore GPS sospeso.',
    operator_archived: 'Operatore GPS archiviato.',
    gps_driver_mismatch: GPS_DRIVER_MISMATCH_MESSAGE,
  };
  return messages[code] || 'Operazione GPS non riuscita.';
}

function mapRpcError(error) {
  if (!error) return null;
  const message = String(error.message || error.details || '');
  const normalized = message.toUpperCase();
  const mapped = new Error(message || 'Operazione GPS non autorizzata.');
  mapped.code = error.code || error.status || null;
  mapped.cause = error;
  if (
    normalized.includes('OPERATORE_NON_AUTENTICATO') ||
    normalized.includes('ASSEGNAZIONE_NON_AUTORIZZATA') ||
    normalized.includes('SESSIONE_NON_AUTORIZZATA') ||
    normalized.includes('SESSIONE_GIA_ATTIVA') ||
    normalized.includes('ZONA_NON_AUTORIZZATA') ||
    normalized.includes('COORDINATE_NON_VALIDE') ||
    normalized.includes('TRANSIZIONE_SESSIONE_NON_VALIDA') ||
    // Aggiunti dalla migrazione device-ownership: sessione in pausa (nessun
    // punto operativo durante la pausa), sessione completata, device diverso
    // da quello che ha avviato la sessione.
    normalized.includes('PAUSED_SESSION') ||
    normalized.includes('SESSION_COMPLETED') ||
    normalized.includes('DEVICE_MISMATCH')
  ) {
    mapped.permanent = true;
  }
  return mapped;
}

async function callGpsRpc(name, args = {}) {
  const client = await requireSupabase();
  const { data, error } = await client.rpc(name, args);
  if (error) throw mapRpcError(error);
  return data;
}

// "Funzione non trovata": PostgREST restituisce PGRST202 (o un messaggio
// "Could not find the function public.<name>") quando l'RPC non esiste ancora
// nello schema. Usato per la strategia di rollout zero-downtime delle RPC _v2
// device-aware: se la migrazione device-ownership non e' ancora applicata, si
// ricade sull'RPC v1 (senza enforcement device) senza rompere nulla.
function isRpcNotFound(error) {
  const code = String(error?.code || error?.cause?.code || '');
  const message = String(error?.message || error?.cause?.message || '').toLowerCase();
  return code === 'PGRST202' || code === '404' ||
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    // Grant mancante sull'RPC _v2 (es. non concessa a `anon` per il link
    // Driver pubblico): trattala come "v2 non disponibile" e ricadi sulla v1,
    // invece di far fallire in modo permanente il tracking. I messaggi
    // applicativi (DEVICE_MISMATCH / PAUSED_SESSION / ...) non contengono
    // "permission denied for function", quindi non innescano il fallback.
    message.includes('permission denied for function');
}

// Prova le RPC nell'ordine dato (piu' recente -> piu' vecchia). Ricade sulla
// successiva SOLO se quella corrente "non esiste" (migrazione non applicata /
// grant mancante): isRpcNotFound. Qualsiasi ALTRO errore applicativo
// (PAUSED_SESSION, DEVICE_MISMATCH, SESSIONE_GIA_ATTIVA, auth, validazione)
// viene propagato: NON e' un motivo per ripiegare su una versione precedente.
// specs: [{ name, args }, ...]
async function callGpsRpcVersioned(specs) {
  let lastError = null;
  for (let i = 0; i < specs.length; i += 1) {
    try {
      return await callGpsRpc(specs[i].name, specs[i].args);
    } catch (error) {
      lastError = error;
      if (i < specs.length - 1 && isRpcNotFound(error)) continue;
      throw error;
    }
  }
  throw lastError;
}

// Retro-compat (2 versioni). Usata dai test esistenti.
async function callGpsRpcV2Fallback(v2Name, v1Name, v2Args, v1Args) {
  return callGpsRpcVersioned([{ name: v2Name, args: v2Args }, { name: v1Name, args: v1Args }]);
}

async function withRetry(operation, label = 'operazione GPS') {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (isPermanentGpsWriteError(error)) break;
      if (attempt >= RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError || new Error(`${label} non riuscita.`);
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export async function getCurrentOperatorProfile() {
  const client = await requireSupabase();
  const userId = await getCurrentUserId();

  const { data, error } = await client
    .from('operator_profiles')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error) throw permanentGpsError('assignment_access_denied', error);
  if (!data) throw permanentGpsError('assignment_missing');
  if (data.active === false || data.disabled_at) throw permanentGpsError('operator_suspended');
  return data;
}

export async function getValidOperatorAssignments(campaignId) {
  if (!isValidUuid(campaignId)) throw permanentGpsError('assignment_invalid_campaign');
  const client = await requireSupabase();
  const userId = await getCurrentUserId();

  const { data, error } = await client
    .from('operator_assignments')
    .select('*')
    .eq('operator_id', userId)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) throw permanentGpsError('assignment_access_denied', error);
  return Array.isArray(data) ? data : [];
}

// Stessa regola di validita' usata sia sul percorso "cerca tra tutte le
// assignment del campaign" sia sul percorso "verifica quella gia' nota":
// status active, non revocata, con un gruppo assegnato (senza group_id il
// driver non ha un programma GPS da seguire), dentro la finestra
// starts_at/ends_at. Nessuna regola cambiata rispetto a prima, solo estratta
// per essere applicabile a un singolo record oltre che a una lista.
function isAssignmentCurrentlyValidForGps(assignment) {
  if (!assignment) return false;
  const now = Date.now();
  const startsAt = assignment.starts_at ? Date.parse(assignment.starts_at) : 0;
  const endsAt = assignment.ends_at ? Date.parse(assignment.ends_at) : Infinity;
  return (
    assignment.status === 'active' &&
    !assignment.revoked_at &&
    Boolean(assignment.group_id) &&
    startsAt <= now &&
    endsAt > now
  );
}

// assignmentContext (opzionale): { assignment, campaign } gia' recuperati e
// validati da un chiamante che ha gia' fatto il proprio giro di verifica
// (es. useDriverAssignment, che ha gia' letto operator_assignments per id e
// gia' chiamato la stessa RPC gps_get_operator_campaign). Se presente ed
// ancora valido, evita di rifare da zero le due chiamate di rete
// (gps_get_operator_campaign + getValidOperatorAssignments) — root cause
// della lentezza confermata nell'audit precedente: la stessa RPC veniva
// chiamata due volte per lo stesso mount pagina.
//
// CONTROLLO SERVER-SIDE CHE RESTA SEMPRE OBBLIGATORIO, context o no:
// getCurrentOperatorProfile() — verifica che l'operatore autenticato sia
// tuttora attivo (non sospeso/disabilitato) chiamando il DB in questo
// preciso istante. Questo NON puo' essere dedotto da dati gia' in mano al
// chiamante (lo stato dell'operatore puo' cambiare in qualsiasi momento,
// indipendentemente dall'assignment), quindi va rieseguito sempre.
export async function resolveGpsAssignment(campaignId, assignmentContext = null) {
  if (!isValidUuid(campaignId)) throw permanentGpsError('assignment_invalid_campaign');
  await getCurrentOperatorProfile();

  if (assignmentContext?.assignment && assignmentContext?.campaign) {
    if (assignmentContext.assignment.campaign_id !== campaignId) {
      // Il contesto passato non corrisponde al campaign richiesto: non e'
      // un dato di cui fidarsi per questa chiamata, ricadi sul percorso
      // completo invece di usarlo per errore.
    } else if (isAssignmentCurrentlyValidForGps(assignmentContext.assignment)) {
      return { assignment: assignmentContext.assignment, campaign: assignmentContext.campaign };
    } else {
      throw permanentGpsError('assignment_missing');
    }
  }

  const campaign = await callGpsRpc('gps_get_operator_campaign', { p_campaign_id: campaignId });
  const assignments = await getValidOperatorAssignments(campaignId);
  const active = assignments.filter(isAssignmentCurrentlyValidForGps);

  if (!active.length) throw permanentGpsError('assignment_missing');
  if (active.length > 1) throw permanentGpsError('assignment_ambiguous');
  return { assignment: active[0], campaign };
}

// accessToken (opzionale): segreto per-assignment (operator_assignments.
// access_token) che autorizza lato server questa RPC quando non c'e' una
// sessione Supabase (link Driver pubblico via WhatsApp — vedi migrazione
// 20260816160000_driver_gps_access_token.sql). Se omesso il comportamento
// resta identico a prima (richiede auth.uid()).
export async function startGpsSession(campaignId, { assignmentId, deviceId, zoneId, accessToken } = {}) {
  const resolved = assignmentId
    ? { assignment: { id: assignmentId } }
    : await resolveGpsAssignment(campaignId);

  if (!isValidUuid(resolved.assignment?.id)) throw permanentGpsError('assignment_missing');
  if (zoneId != null && !isValidUuid(zoneId)) throw permanentGpsError('assignment_missing');
  const args = {
    p_assignment_id: resolved.assignment.id,
    p_device_id: deviceId || getDeviceInstallationId() || null,
    p_campaign_zone_id: zoneId || null,
    p_access_token: accessToken || null,
  };
  // _v3 gestisce l'identita' participant di gruppo (operator_id NULL); v1
  // resta il fallback per i link personali finche' la migrazione non e' live.
  return callGpsRpcVersioned([
    { name: 'gps_start_session_v3', args },
    { name: 'gps_start_session', args },
  ]);
}

// assignmentId e' richiesto SOLO in modalita' token (gps_transition_zone
// deve poter verificare access_token contro una specifica assignment: il
// solo zoneId, a differenza di sessionId, non la identifica univocamente).
export async function transitionZone(zoneId, action, { accessToken, assignmentId } = {}) {
  if (!isValidUuid(zoneId)) throw permanentGpsError('assignment_missing');
  const args = {
    p_campaign_zone_id: zoneId,
    p_action: action,
    p_access_token: accessToken || null,
    p_assignment_id: accessToken ? assignmentId || null : null,
  };
  return callGpsRpcVersioned([
    { name: 'gps_transition_zone_v3', args },
    { name: 'gps_transition_zone', args },
  ]);
}

export async function getActiveGpsSession(campaignId) {
  const client = await requireSupabase();
  const driverId = await getCurrentUserId();

  let query = client
    .from('delivery_sessions')
    .select('*')
    .eq('driver_id', driverId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.find((session) => session.status === 'started' || session.status === 'paused') || null;
}

// Equivalente di getActiveGpsSession, ma per il link Driver pubblico (nessuna
// sessione Supabase da cui leggere driverId): usa la RPC dedicata
// get_active_driver_session (migrazione
// 20260816190000_driver_gps_resume_and_confirm_status.sql), scoped a UNA
// sola assignment tramite assignment_id+access_token — mai un elenco globale
// di delivery_sessions. Ritorna null se non c'e' nessuna sessione
// started/paused per quella assignment.
export async function getActiveGpsSessionByToken(assignmentId, accessToken) {
  if (!isValidUuid(assignmentId) || !accessToken) return null;
  const deviceId = getDeviceInstallationId();
  const withDevice = { p_assignment_id: assignmentId, p_access_token: accessToken, p_device_id: deviceId };
  const legacy = { p_assignment_id: assignmentId, p_access_token: accessToken };
  const data = await callGpsRpcVersioned([
    { name: 'get_active_driver_session_v3', args: withDevice },
    { name: 'get_active_driver_session_v2', args: withDevice },
    { name: 'get_active_driver_session', args: legacy },
  ]);
  // La v2 device-aware ritorna { session: null, blocked: 'device_mismatch' }
  // quando la sessione appartiene a un altro dispositivo.
  if (data?.blocked === 'device_mismatch') return { _blocked: 'device_mismatch' };
  if (!data?.session) return null;
  // last_gps_recorded_at aggiunto dalla migrazione
  // 20260826130000_get_active_driver_session_last_gps.sql (proposta, non
  // ancora applicata a questo turno): finche' non e' live il campo e'
  // semplicemente assente/undefined e il chiamante lo tratta come "nessuna
  // evidenza GPS nota", MAI come un errore.
  return { ...data.session, _lastGpsRecordedAt: data.last_gps_recorded_at ?? null };
}

// Ultimo gps_tracking_points.recorded_at per una sessione, o null se nessun
// punto e' mai stato registrato. Usato SOLO per classificare una sessione
// trovata al resume (gpsSessionLifecycle/gpsResumePolicy) — mai per scrivere
// nulla. RLS gps_tracking_points_select_policy consente al driver
// autenticato di leggere i propri punti (driver_id = auth.uid()), quindi
// nessuna RPC dedicata serve in modalita' autenticata. In modalita' token
// (link Driver pubblico, nessun auth.uid()) questa select fallirebbe per
// RLS: get_active_driver_session include gia' last_gps_recorded_at nel
// proprio risultato per quel caso — vedi getActiveGpsSessionByToken sopra.
export async function getLastGpsRecordedAt(sessionId) {
  if (!isValidUuid(sessionId)) return null;
  const client = await requireSupabase();
  const { data, error } = await client
    .from('gps_tracking_points')
    .select('recorded_at')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.recorded_at || null;
}

// pause/resume/complete passano SEMPRE p_device_id: la RPC v2 verifica che sia
// lo stesso dispositivo che possiede la sessione (DEVICE_MISMATCH altrimenti).
// Fallback a gps_transition_session v1 finche' la migrazione non e' applicata.
function transitionSession(sessionId, action, accessToken) {
  const deviceId = getDeviceInstallationId();
  const withDevice = { p_session_id: sessionId, p_action: action, p_access_token: accessToken || null, p_device_id: deviceId };
  const legacy = { p_session_id: sessionId, p_action: action, p_access_token: accessToken || null };
  return callGpsRpcVersioned([
    { name: 'gps_transition_session_v3', args: withDevice },
    { name: 'gps_transition_session_v2', args: withDevice },
    { name: 'gps_transition_session', args: legacy },
  ]);
}

export async function pauseGpsSession(sessionId, accessToken) {
  return transitionSession(sessionId, 'pause', accessToken);
}

export async function resumeGpsSession(sessionId, accessToken) {
  return transitionSession(sessionId, 'resume', accessToken);
}

// withRetry (stessa funzione, stessi 3 tentativi con backoff [800,1800,4000]ms,
// gia' usata per gps_insert_point): un fallimento di rete transitorio durante
// lo Stop non deve far credere al Driver che il turno sia chiuso quando il
// server non ha mai confermato — vedi useGpsTracking.js end() per come la UI
// gestisce l'eventuale eccezione finale (mai un successo finto).
export async function endGpsSession(sessionId, accessToken) {
  return withRetry(
    () => transitionSession(sessionId, 'complete', accessToken),
    'Chiusura sessione GPS',
  );
}

export async function calculateGpsCoverage(sessionId, bufferMeters = 30) {
  if (!isValidUuid(sessionId)) throw permanentGpsError('assignment_missing');
  return callGpsRpc('gps_calculate_zone_coverage', { p_session_id: sessionId, p_buffer_meters: bufferMeters });
}

export async function insertGpsPoint({
  sessionId,
  driverId,
  lat,
  lng,
  accuracy,
  speed,
  heading,
  recordedAt,
  accessToken,
}) {
  // In modalita' token (link Driver pubblico) non c'e' nessuna sessione
  // Supabase da cui leggere un driverId autenticato da confrontare: il
  // controllo di ownership avviene lato server dentro gps_insert_point
  // tramite il token stesso, non qui.
  if (!accessToken) {
    const authenticatedDriverId = await getCurrentUserId();
    if (driverId && driverId !== authenticatedDriverId) {
      throw permanentGpsError('gps_driver_mismatch', new Error(GPS_DRIVER_MISMATCH_MESSAGE));
    }
  }

  const common = {
    p_session_id: sessionId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    p_speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
    p_heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
    p_recorded_at: recordedAt || new Date().toISOString(),
    p_access_token: accessToken || null,
  };
  // _v3 (identita' participant/personale) -> _v2 (device-aware) -> v1.
  // Blocco server-side PAUSED_SESSION / SESSION_COMPLETED / DEVICE_MISMATCH.
  const withDevice = { ...common, p_device_id: getDeviceInstallationId() };
  return withRetry(
    () => callGpsRpcVersioned([
      { name: 'gps_insert_point_v3', args: withDevice },
      { name: 'gps_insert_point_v2', args: withDevice },
      { name: 'gps_insert_point', args: common },
    ]),
    'invio punto GPS',
  );
}

export async function heartbeatGpsSession(sessionId, accessToken) {
  const args = { p_session_id: sessionId, p_access_token: accessToken || null };
  return callGpsRpcVersioned([
    { name: 'gps_heartbeat_session_v3', args },
    { name: 'gps_heartbeat_session', args },
  ]);
}

let cachedRestUrl;
let cachedRestAnonKey;
function readSupabaseRestConfig() {
  if (cachedRestUrl !== undefined) return { url: cachedRestUrl, key: cachedRestAnonKey };
  cachedRestUrl = null;
  cachedRestAnonKey = null;
  try {
    cachedRestUrl = import.meta.env.VITE_SUPABASE_URL;
    cachedRestAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  } catch {
    if (typeof process !== 'undefined' && process.env) {
      cachedRestUrl = process.env.VITE_SUPABASE_URL;
      cachedRestAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    }
  }
  // Un valore truthy ma non-URL (es. placeholder "[SENSITIVE]" da una build
  // con env Vercel non risolte) porterebbe a fetch("[SENSITIVE]/rest/v1/..").
  // Lo neutralizziamo qui: i chiamanti gestiscono gia' url mancante.
  if (typeof cachedRestUrl !== 'string' || !/^https?:\/\//i.test(cachedRestUrl.trim())) {
    cachedRestUrl = null;
  }
  return { url: cachedRestUrl, key: cachedRestAnonKey };
}

// Best-effort, SOLO diagnostico (Fase C — pagehide/chiusura app): invia un
// ultimo heartbeat quando la pagina sta per chiudersi o andare in
// background. MAI un cancel/complete automatico: lo Stop esplicito resta
// l'unico modo reale per chiudere un turno — vedi end() in
// useGpsTracking.js. Un heartbeat "in piu'" al massimo aggiorna updated_at
// (gia' non usato per classificare l'attivita', vedi gpsSessionLifecycle.js)
// senza alcun effetto sullo stato della sessione.
//
// navigator.sendBeacon e' stato scartato: non puo' portare header custom
// (apikey/Authorization), quindi non puo' autenticare una chiamata RPC
// Supabase. fetch(..., {keepalive:true}) sopravvive alla chiusura della
// pagina (limite di payload ~64KB, ampiamente sufficiente qui) mantenendo
// gli header necessari.
//
// SOLO modalita' token (accessToken presente, link Driver pubblico): in
// modalita' autenticata (login Driver via Supabase Auth, senza token) il JWT
// bridgeato non viene letto qui — nessun accesso sincrono affidabile al
// token dal contesto pagehide senza duplicare la logica del bridge — il beat
// viene semplicemente omesso in quel caso, mai tentato con credenziali
// sbagliate (fuorviante nei log, e comunque solo best-effort).
export function sendPagehideHeartbeat(sessionId, accessToken) {
  if (!isValidUuid(sessionId) || !accessToken) return;
  const { url, key } = readSupabaseRestConfig();
  if (!url || !key) return;
  try {
    fetch(`${url}/rest/v1/rpc/gps_heartbeat_session`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_session_id: sessionId, p_access_token: accessToken }),
    }).catch(() => {});
  } catch {
    // best-effort: mai bloccare/segnalare un errore durante pagehide.
  }
}

export async function getCampaignGpsPoints(campaignId, { sessionId } = {}) {
  const client = await requireSupabase();

  let query = client
    .from('gps_tracking_points')
    .select('*')
    .order('recorded_at', { ascending: true });

  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }
  if (sessionId && sessionId !== 'all' && isValidUuid(sessionId)) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCampaignGpsSessions(campaignId) {
  const client = await requireSupabase();

  let query = client
    .from('delivery_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// --- Multi-driver / multi-session helpers -----------------------------------
// Il modello GPS supporta piu' operatori sulla stessa campagna (una
// delivery_session + un driver_id distinti per operatore). Le viste che
// mostrano una mappa devono tenere le tracce SEPARATE per session_id: mai un
// array unico ordinato solo per tempo (concatenerebbe punti di operatori
// diversi in un'unica polilinea e produrrebbe falsi "impossible_jump" nel
// filtro qualita', che confronta ogni punto con il precedente).

const TRACKABLE_SESSION_STATUSES = ['started', 'paused', 'completed'];

// Raggruppa una lista piatta di gps_tracking_points per session_id,
// preservando l'ordine recorded_at gia' applicato dalla query.
export function groupGpsPointsBySession(points = []) {
  const bySession = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    const key = point?.session_id || 'unknown';
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(point);
  }
  return bySession;
}

// Ritorna una traccia per sessione, con i punti gia' separati e il filtro
// qualita' applicato PER SESSIONE (mai sull'unione). Una sola query punti per
// tutta la campagna, raggruppata lato client.
export async function getCampaignSessionTracks(campaignId, { statuses = TRACKABLE_SESSION_STATUSES } = {}) {
  const [sessions, points] = await Promise.all([
    getCampaignGpsSessions(campaignId),
    getCampaignGpsPoints(campaignId),
  ]);
  const allowed = new Set(statuses);
  const relevant = (sessions || []).filter((s) => allowed.has(s.status));
  const bySession = groupGpsPointsBySession(points);
  return relevant
    .map((session) => {
      const sessionPoints = bySession.get(session.id) || [];
      const { valid, excluded } = filterValidGpsPoints(sessionPoints);
      const lastPoint = valid[valid.length - 1] || sessionPoints[sessionPoints.length - 1] || null;
      const lastActivityIso =
        session.updated_at || lastPoint?.recorded_at || lastPoint?.created_at || session.started_at || null;
      return {
        session,
        points: sessionPoints,
        validPoints: valid,
        excludedPoints: excluded,
        lastPoint,
        lifecycleStatus: classifySessionLifecycle(session, lastActivityIso),
      };
    })
    .sort((a, b) => {
      const aTime = new Date(a.session.started_at || a.session.created_at || 0).getTime();
      const bTime = new Date(b.session.started_at || b.session.created_at || 0).getTime();
      return aTime - bTime; // dal primo operatore che ha iniziato al piu' recente
    });
}

// GROUP SHARED TRACKS (app Driver): un operatore vede le tracce degli ALTRI
// membri dello STESSO group_id+campaign_id per coordinarsi (vie gia' fatte,
// aree mancanti). NON e' "tutte le sessioni della campagna": l'autorizzazione
// (stesso gruppo, assignment valido del chiamante) e i campi safe sono decisi
// server-side dalla RPC get_driver_group_tracking (migrazione
// 20260829160000, non applicata). Nessun select('*') diretto: nessun
// driver_phone / device_id / token / metadata privata nel payload.
// Fallback: finche' la RPC non e' live ritorna { self: null, others: [] } e
// la mappa Driver mostra solo la propria traccia (comportamento attuale).
export async function getDriverGroupTracking(assignmentId, accessToken) {
  if (!isValidUuid(assignmentId)) return { self: null, others: [] };
  try {
    const data = await callGpsRpc('get_driver_group_tracking', {
      p_assignment_id: assignmentId,
      p_access_token: accessToken || null,
    });
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    const points = Array.isArray(data?.points) ? data.points : [];
    const bySession = groupGpsPointsBySession(points);
    const tracks = sessions.map((s, index) => {
      const raw = bySession.get(s.id) || [];
      const { valid } = filterValidGpsPoints(raw);
      return {
        sessionId: s.id,
        status: s.status,
        startedAt: s.started_at,
        pausedAt: s.paused_at,
        endedAt: s.ended_at,
        isSelf: Boolean(s.is_self),
        // Etichetta UI: mai UUID. "Tu" per la propria sessione, "Operatore N"
        // per gli altri (o l'alias di gruppo se gia' fornito safe dalla RPC).
        label: s.is_self ? 'Tu' : (s.display_label || `Operatore ${index + 1}`),
        validPoints: valid,
        lastPoint: valid[valid.length - 1] || null,
      };
    });
    return {
      self: tracks.find((t) => t.isSelf) || null,
      others: tracks.filter((t) => !t.isSelf),
    };
  } catch (error) {
    if (isRpcNotFound(error)) return { self: null, others: [] };
    throw error;
  }
}

// --- DRIVER GROUP ACCESS ---------------------------------------------------
// 1 link operativo di gruppo -> N identita' isolate. Il GROUP TOKEN passa
// SOLO da driver_group_join: dopo il join il browser usa il token PERSONALE
// dell'assignment participant restituito. Il group token non puo' mai
// controllare una delivery_session.
const GROUP_JOIN_STORAGE_PREFIX = 'vp:gps:group-join:';
function groupJoinKey(groupToken) {
  return GROUP_JOIN_STORAGE_PREFIX + String(groupToken || '').trim().slice(0, 64);
}

// Se questo device ha gia' fatto join a questo group link, ritorna le
// credenziali personali salvate (nessuna nuova chiamata di rete).
export function readDriverGroupJoin(groupToken) {
  try {
    const raw = window.localStorage.getItem(groupJoinKey(groupToken));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.assignmentId && parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

// JOIN: valida il group token server-side, crea/riusa il participant di
// questo device, ritorna { assignmentId, accessToken (personale),
// displayName, campaignId, groupId, reused }. Persiste localmente cosi' la
// riapertura dello stesso link sullo stesso device NON crea un duplicato.
export async function driverGroupJoin(groupToken, displayName) {
  const token = String(groupToken || '').trim();
  if (token.length < 16) throw permanentGpsError('assignment_missing', new Error('Link di gruppo non valido.'));
  const existing = readDriverGroupJoin(token);
  if (existing) return { ...existing, reused: true };

  const data = await callGpsRpc('driver_group_join', {
    p_group_token: token,
    p_device_id: getDeviceInstallationId(),
    p_display_name: String(displayName || '').trim(),
  });
  const result = {
    assignmentId: data?.assignment_id || null,
    accessToken: data?.access_token || null,
    participantId: data?.participant_id || null,
    displayName: data?.display_name || null,
    campaignId: data?.campaign_id || null,
    groupId: data?.group_id || null,
    reused: Boolean(data?.reused),
  };
  if (result.assignmentId && result.accessToken) {
    try {
      window.localStorage.setItem(groupJoinKey(token), JSON.stringify(result));
    } catch { /* best-effort */ }
  }
  return result;
}

// ADMIN — sblocca il dispositivo associato a una sessione (RPC admin-only
// gps_admin_unlock_device, migrazione 20260829150000, non applicata).
// Preserva sessione / GPS / assignment / storico: azzera solo device_id.
export async function adminUnlockDevice(sessionId, reason) {
  if (!isValidUuid(sessionId)) throw permanentGpsError('assignment_missing');
  return callGpsRpc('gps_admin_unlock_device', {
    p_session_id: sessionId,
    p_reason: reason ? String(reason).trim().slice(0, 500) : null,
  });
}

// Lettura punti GPS per il CLIENTE: select esplicita, MAI select('*').
// Esclude driver_id (identificatore tecnico dell'operatore) dal payload che
// arriva al browser del cliente. session_id resta, serve come chiave di
// raggruppamento delle tracce lato UI.
export async function getCustomerCampaignGpsPoints(campaignId) {
  const client = await requireSupabase();
  let query = client
    .from('gps_tracking_points')
    .select('id, campaign_id, session_id, lat, lng, accuracy, speed, heading, recorded_at, created_at')
    .order('recorded_at', { ascending: true });
  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Lettura sessioni per il CLIENTE: select esplicita customer-safe. NON invia
// driver_name / driver_phone / device_id / driver_id / assignment_id /
// metadata / group_id (dati operatore non necessari al cliente).
export async function getCustomerCampaignGpsSessions(campaignId) {
  const client = await requireSupabase();
  let query = client
    .from('delivery_sessions')
    .select('id, campaign_id, status, started_at, paused_at, ended_at, updated_at, campaign_zone_id')
    .order('created_at', { ascending: false });
  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCampaignProofPhotos(campaignId, { approvedOnly = false } = {}) {
  const client = await requireSupabase();

  let query = client
    .from('proof_photos')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (approvedOnly) query = query.not('approved_at', 'is', null);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Path che deve combaciare ESATTAMENTE con la policy RLS
// proof_photos_storage_insert_authorized su storage.objects (gia' in
// produzione): campaign/<campaignId>/session/<sessionId>/photo/<uuid>.ext.
// La policy risolve <sessionId> su delivery_sessions per verificare
// driver_id/status/assignment validi, quindi una sessione GPS attiva e'
// obbligatoria per caricare una foto — qualunque altro formato di path
// (incluso quello precedente, senza i segmenti letterali "campaign"/
// "session"/"photo") viene negato dalla policy con 403, indipendentemente
// dai permessi sulla riga proof_photos.
export function buildProofPhotoStoragePath({ campaignId, sessionId }) {
  if (!isValidUuid(sessionId)) {
    throw permanentGpsError('assignment_missing', new Error('Sessione GPS attiva richiesta per caricare una foto prova.'));
  }
  const photoId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `campaign/${campaignId}/session/${sessionId}/photo/${photoId}.jpg`;
}

// Carica una foto POD gia' compressa/watermarkata (blob JPEG) nel bucket
// privato "proof-photos" e salva il record in proof_photos. Fallisce chiuso:
// se l'insert della riga fallisce dopo l'upload del file, l'oggetto caricato
// resta orfano nello storage (nessun record) ma non viene mai mostrato da
// nessuna vista, perche' tutte le letture passano da proof_photos.
export async function uploadProofPhoto({ campaignId, sessionId, blob, lat, lng, takenAt, note }) {
  if (!isValidUuid(campaignId)) throw permanentGpsError('assignment_invalid_campaign');
  if (!blob) throw permanentGpsError('gps_auth_required', new Error('Nessun file da caricare.'));

  const client = await requireSupabase();
  const driverId = await getCurrentUserId();
  const storagePath = buildProofPhotoStoragePath({ campaignId, sessionId, driverId });

  await withRetry(async () => {
    const { error: uploadError } = await client.storage
      .from('proof-photos')
      .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw mapRpcError(uploadError);
  }, 'upload foto POD');

  const { data, error } = await client
    .from('proof_photos')
    .insert({
      campaign_id: campaignId,
      session_id: sessionId && isValidUuid(sessionId) ? sessionId : null,
      driver_id: driverId,
      storage_path: storagePath,
      lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
      lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
      note: note || null,
      taken_at: takenAt || new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw mapRpcError(error);
  return data;
}

export async function createProofPhotoSignedUrl(storagePath) {
  const client = await requireSupabase();
  if (!storagePath) return null;

  const { data, error } = await client.storage
    .from('proof-photos')
    .createSignedUrl(storagePath, 60 * 10);

  if (error) throw error;
  return data?.signedUrl || null;
}

// FOTO DI VERIFICA SEGNALAZIONE — tabella issue_verification_photos, SEPARATA
// da proof_photos (non entra mai nella gallery generale). Prefisso storage
// dedicato campaign/<cid>/issue/<iid>/photo/. Coordinate OBBLIGATORIE. Nessun
// access_token viene salvato. Supporta modalita' token (link Driver pubblico)
// e autenticata.
export function buildIssuePhotoStoragePath({ campaignId, issueId }) {
  if (!isValidUuid(campaignId) || !isValidUuid(issueId)) {
    throw permanentGpsError('assignment_missing', new Error('Segnalazione non valida per il caricamento foto.'));
  }
  const photoId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `campaign/${campaignId}/issue/${issueId}/photo/${photoId}.jpg`;
}

export async function uploadIssueVerificationPhoto({
  campaignId, issueId, blob, lat, lng, accuracy = null, addressLabel = null, note = null,
  assignmentId = null, accessToken = null,
}) {
  if (!isValidUuid(campaignId) || !isValidUuid(issueId)) throw permanentGpsError('assignment_missing');
  if (!blob) throw permanentGpsError('gps_auth_required', new Error('Nessun file da caricare.'));
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw permanentGpsError('gps_auth_required', new Error('Posizione GPS obbligatoria per la foto di verifica.'));
  }
  const client = await requireSupabase();
  const storagePath = buildIssuePhotoStoragePath({ campaignId, issueId });

  await withRetry(async () => {
    const { error: uploadError } = await client.storage
      .from('proof-photos')
      .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw mapRpcError(uploadError);
  }, 'upload foto verifica');

  return callGpsRpc('driver_register_issue_photo', {
    p_issue_id: issueId,
    p_storage_path: storagePath,
    p_lat: Number(lat),
    p_lng: Number(lng),
    p_accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    p_address_label: addressLabel || null,
    p_note: note || null,
    p_assignment_id: assignmentId || null,
    p_access_token: accessToken || null,
  });
}

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function getSessionPath(sessionId) {
  const client = await requireSupabase();
  if (!sessionId || sessionId === 'all' || !isValidUuid(sessionId)) return [];
  const { data, error } = await client
    .from('gps_tracking_points')
    .select('*')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getCampaignRecord(campaignId) {
  const client = await requireSupabase();
  if (!campaignId || campaignId === 'all' || !isValidUuid(campaignId)) return null;
  const tables = ['campaigns', 'campagne'];
  for (const table of tables) {
    const { data, error } = await client.from(table).select('*').eq('id', campaignId).limit(1).single();
    if (!error && data) return data;
  }
  return null;
}

export function getSessionGroup(session) {
  const metadata = safeJson(session?.metadata || session?.session_metadata);
  const id = session?.group_id || metadata.group_id || metadata.groupId || null;
  const name = metadata.group_name || metadata.groupName || metadata.group_label || metadata.groupTitle || null;
  if (!id) return { id: 'ungrouped', name: 'Senza gruppo' };
  return { id: String(id), name: name ? String(name) : String(id) };
}

export function displayDriverName(session) {
  if (!session) return '';
  const metadata = safeJson(session.metadata || session.session_metadata);
  const explicit = session.driver_name || session.driverName || metadata.driver_name || metadata.driverName;
  if (explicit) return String(explicit);
  const id = session.driver_id || session.driverId;
  if (!id) return 'Operatore';
  return `Operatore ${String(id).slice(0, 6)}`;
}

export function displayDeviceId(session) {
  if (!session) return '';
  const metadata = safeJson(session.metadata || session.session_metadata);
  const explicit = session.device_id || session.deviceId || metadata.device_id || metadata.deviceId;
  if (!explicit) return 'Dato non disponibile';
  return String(explicit).slice(0, 10);
}

export function classifyDriverStatus(lastPingIso) {
  if (!lastPingIso) return 'offline';
  const lastMs = new Date(lastPingIso).getTime();
  if (!Number.isFinite(lastMs)) return 'offline';
  const ageMs = Date.now() - lastMs;
  if (ageMs <= 2 * 60000) return 'online';
  if (ageMs <= 5 * 60000) return 'warning';
  return 'offline';
}

const SESSION_RECENT_OFFLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Estende classifyDriverStatus con la distinzione richiesta dal Monitor Admin
// tra "problema attuale" e "storico": una sessione gia' completata/annullata
// non e' mai un driver offline adesso, e una sessione 'started' abbandonata
// da giorni (mai chiusa correttamente) e' storico, non un'emergenza di oggi.
// live | warning | offline_recent | history
export function classifySessionLifecycle(session, lastPingIso) {
  if (session?.status === 'completed' || session?.status === 'cancelled') return 'history';
  const liveStatus = classifyDriverStatus(lastPingIso);
  if (liveStatus === 'online') return 'live';
  if (liveStatus === 'warning') return 'warning';
  const lastMs = lastPingIso ? new Date(lastPingIso).getTime() : null;
  const isRecent = lastMs != null && Number.isFinite(lastMs) && (Date.now() - lastMs) <= SESSION_RECENT_OFFLINE_WINDOW_MS;
  return isRecent ? 'offline_recent' : 'history';
}

// Somma haversine sui soli punti che superano il filtro di qualita' GPS
// (src/lib/gps/pointQuality.js): nessun nuovo algoritmo di distanza, solo il
// filtro applicato prima della stessa formula gia' in uso. Applicato qui
// (non nei singoli chiamanti) cosi' ogni vista che gia' usa questa funzione
// (CampaignReport, GpsMonitor, AdminLiveDashboard, gruppi) mostra la
// distanza corretta senza ulteriori modifiche.
export function calculateDistanceKm(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  return calculateFilteredDistanceKm(points);
}
