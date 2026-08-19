import { supabase, ensureSupabaseSessionBridge } from '../../supabaseClient.js';
import { calculateFilteredDistanceKm } from '../gps/pointQuality.js';

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
      message.includes('transizione_sessione_non_valida'),
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
    normalized.includes('TRANSIZIONE_SESSIONE_NON_VALIDA')
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
  return callGpsRpc('gps_start_session', {
    p_assignment_id: resolved.assignment.id,
    p_device_id: deviceId || null,
    p_campaign_zone_id: zoneId || null,
    p_access_token: accessToken || null,
  });
}

// assignmentId e' richiesto SOLO in modalita' token (gps_transition_zone
// deve poter verificare access_token contro una specifica assignment: il
// solo zoneId, a differenza di sessionId, non la identifica univocamente).
export async function transitionZone(zoneId, action, { accessToken, assignmentId } = {}) {
  if (!isValidUuid(zoneId)) throw permanentGpsError('assignment_missing');
  return callGpsRpc('gps_transition_zone', {
    p_campaign_zone_id: zoneId,
    p_action: action,
    p_access_token: accessToken || null,
    p_assignment_id: accessToken ? assignmentId || null : null,
  });
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
  const data = await callGpsRpc('get_active_driver_session', {
    p_assignment_id: assignmentId,
    p_access_token: accessToken,
  });
  return data?.session || null;
}

export async function pauseGpsSession(sessionId, accessToken) {
  return callGpsRpc('gps_transition_session', { p_session_id: sessionId, p_action: 'pause', p_access_token: accessToken || null });
}

export async function resumeGpsSession(sessionId, accessToken) {
  return callGpsRpc('gps_transition_session', { p_session_id: sessionId, p_action: 'resume', p_access_token: accessToken || null });
}

export async function endGpsSession(sessionId, accessToken) {
  return callGpsRpc('gps_transition_session', { p_session_id: sessionId, p_action: 'complete', p_access_token: accessToken || null });
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

  return withRetry(() => callGpsRpc('gps_insert_point', {
    p_session_id: sessionId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    p_speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
    p_heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
    p_recorded_at: recordedAt || new Date().toISOString(),
    p_access_token: accessToken || null,
  }), 'invio punto GPS');
}

export async function heartbeatGpsSession(sessionId, accessToken) {
  return callGpsRpc('gps_heartbeat_session', { p_session_id: sessionId, p_access_token: accessToken || null });
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
