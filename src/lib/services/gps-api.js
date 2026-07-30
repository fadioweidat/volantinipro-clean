import { supabase } from '../../supabaseClient.js';

const RETRY_DELAYS_MS = [800, 1800, 4000];
const GPS_DRIVER_MISMATCH_MESSAGE = 'Il driver autenticato non corrisponde alla sessione GPS.';

async function requireSupabase() {
  if (!supabase) throw new Error('Supabase non configurato.');
  return supabase;
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

export async function resolveGpsAssignment(campaignId) {
  if (!isValidUuid(campaignId)) throw permanentGpsError('assignment_invalid_campaign');
  await getCurrentOperatorProfile();
  const campaign = await callGpsRpc('gps_get_operator_campaign', { p_campaign_id: campaignId });
  const assignments = await getValidOperatorAssignments(campaignId);
  const now = Date.now();
  const active = assignments.filter((assignment) => {
    const startsAt = assignment.starts_at ? Date.parse(assignment.starts_at) : 0;
    const endsAt = assignment.ends_at ? Date.parse(assignment.ends_at) : Infinity;
    return (
      assignment.status === 'active' &&
      !assignment.revoked_at &&
      Boolean(assignment.group_id) &&
      startsAt <= now &&
      endsAt > now
    );
  });

  if (!active.length) throw permanentGpsError('assignment_missing');
  if (active.length > 1) throw permanentGpsError('assignment_ambiguous');
  return { assignment: active[0], campaign };
}

export async function startGpsSession(campaignId, { assignmentId, deviceId } = {}) {
  const resolved = assignmentId
    ? { assignment: { id: assignmentId } }
    : await resolveGpsAssignment(campaignId);

  if (!isValidUuid(resolved.assignment?.id)) throw permanentGpsError('assignment_missing');
  return callGpsRpc('gps_start_session', {
    p_assignment_id: resolved.assignment.id,
    p_device_id: deviceId || null,
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

export async function pauseGpsSession(sessionId) {
  return callGpsRpc('gps_transition_session', { p_session_id: sessionId, p_action: 'pause' });
}

export async function resumeGpsSession(sessionId) {
  return callGpsRpc('gps_transition_session', { p_session_id: sessionId, p_action: 'resume' });
}

export async function endGpsSession(sessionId) {
  return callGpsRpc('gps_transition_session', { p_session_id: sessionId, p_action: 'complete' });
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
}) {
  const authenticatedDriverId = await getCurrentUserId();
  if (driverId && driverId !== authenticatedDriverId) {
    throw permanentGpsError('gps_driver_mismatch', new Error(GPS_DRIVER_MISMATCH_MESSAGE));
  }

  return withRetry(() => callGpsRpc('gps_insert_point', {
    p_session_id: sessionId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    p_speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
    p_heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
    p_recorded_at: recordedAt || new Date().toISOString(),
  }), 'invio punto GPS');
}

export async function heartbeatGpsSession(sessionId) {
  return callGpsRpc('gps_heartbeat_session', { p_session_id: sessionId });
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

// Path deterministico per campagna/sessione: chiunque conosca solo l'id
// campagna non puo' indovinare quello di un'altra sessione/autista, e due
// scatti dello stesso autista non si sovrascrivono mai (timestamp + id
// casuale). Nessuna service-role qui: usa la stessa sessione client-side
// gia' autenticata di tutto il resto di questo modulo.
export function buildProofPhotoStoragePath({ campaignId, sessionId, driverId }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 8);
  const sessionSegment = sessionId && isValidUuid(sessionId) ? sessionId : 'no-session';
  const driverSegment = driverId || 'unknown-driver';
  return `${campaignId}/${sessionSegment}/${driverSegment}/${stamp}-${randomId}.jpg`;
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

export function calculateDistanceKm(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const aLat = Number(a?.lat);
    const aLng = Number(a?.lng);
    const bLat = Number(b?.lat);
    const bLng = Number(b?.lng);
    if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) continue;
    km += haversineKm(aLat, aLng, bLat, bLng);
  }
  return Math.round(km * 100) / 100;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
