import { supabase } from '../../supabaseClient.js';

const PROOF_BUCKET = 'proof-photos';
const RETRY_DELAYS_MS = [800, 1800, 4000];
export const GPS_AUTH_REQUIRED_MESSAGE = 'Accesso operatore richiesto per usare il tracking GPS.';
export const GPS_DRIVER_MISMATCH_MESSAGE = 'Sessione GPS non coerente con l’utente autenticato.';
export const GPS_ASSIGNMENT_REQUIRED_MESSAGE = 'Assegnazione operatore valida richiesta per avviare il tracking GPS.';

export const GPS_ASSIGNMENT_ERROR_MESSAGES = {
  operator_auth_required: GPS_AUTH_REQUIRED_MESSAGE,
  operator_profile_missing: 'Profilo operatore non trovato.',
  operator_suspended: 'Profilo operatore sospeso.',
  operator_archived: 'Profilo operatore archiviato.',
  assignment_missing: 'Nessuna assegnazione attiva per questa campagna.',
  assignment_revoked: 'Assegnazione revocata.',
  assignment_completed: 'Assegnazione completata.',
  assignment_not_started: 'La finestra operativa non è ancora iniziata.',
  assignment_expired: 'La finestra operativa è scaduta.',
  assignment_ambiguous: 'Più assegnazioni valide trovate: contatta un amministratore.',
  assignment_access_denied: 'Assegnazione non leggibile per questo operatore.',
  assignment_invalid_campaign: 'Campagna non valida per il tracking GPS.',
};

export function isPermanentGpsWriteError(error) {
  if (!error) return false;
  const status = Number(error.status || error.statusCode || error.code);
  const code = String(error.code || '').toUpperCase();
  const message = String(error.message || error.details || error.hint || '').toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    code === '42501' ||
    code === 'PGRST301' ||
    code === 'AUTH_SESSION_MISSING' ||
    code === 'AUTH_TOKEN_EXPIRED' ||
    message.includes('accesso operatore richiesto') ||
    message.includes('sessione gps non coerente') ||
    message.includes('assegnazione operatore valida richiesta') ||
    message.includes('assegnazione non leggibile') ||
    message.includes('nessuna assegnazione attiva') ||
    message.includes('not authenticated') ||
    message.includes('auth session missing') ||
    message.includes('jwt') ||
    message.includes('permission denied') ||
    message.includes('row-level security')
  );
}

export function isValidUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function requireSupabase() {
  if (!supabase) throw new Error('Supabase non configurato.');
  return supabase;
}

async function getCurrentUserId() {
  const client = await requireSupabase();
  const { data, error } = await client.auth.getUser();

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[GPS_AUTH_USER_ERROR]', {
        code: error.code || null,
        status: error.status || null,
      });
    }
    throw new Error(GPS_AUTH_REQUIRED_MESSAGE);
  }

  if (!data?.user?.id) {
    throw new Error(GPS_AUTH_REQUIRED_MESSAGE);
  }

  return data.user.id;
}

function assignmentError(code, detail = {}) {
  const error = new Error(GPS_ASSIGNMENT_ERROR_MESSAGES[code] || GPS_ASSIGNMENT_REQUIRED_MESSAGE);
  error.code = code;
  error.detail = detail;
  return error;
}

async function withRetry(operation, label = 'operazione Supabase') {
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

export async function getCurrentOperatorProfile() {
  const client = await requireSupabase();
  const operatorId = await getCurrentUserId();

  const { data, error } = await client
    .from('operator_profiles')
    .select('*')
    .eq('id', operatorId)
    .maybeSingle();

  if (error) {
    const nextError = assignmentError('assignment_access_denied', {
      status: error.status || null,
      code: error.code || null,
    });
    nextError.cause = error;
    throw nextError;
  }

  if (!data) throw assignmentError('operator_profile_missing');
  return data;
}

export async function getValidOperatorAssignments(campaignId) {
  if (!isValidUuid(campaignId)) throw assignmentError('assignment_invalid_campaign');

  const client = await requireSupabase();
  const operatorId = await getCurrentUserId();

  const { data, error } = await client
    .from('operator_assignments')
    .select('*')
    .eq('operator_id', operatorId)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) {
    const nextError = assignmentError('assignment_access_denied', {
      status: error.status || null,
      code: error.code || null,
    });
    nextError.cause = error;
    throw nextError;
  }

  return Array.isArray(data) ? data : [];
}

export async function resolveGpsAssignment(campaignId) {
  if (!isValidUuid(campaignId)) throw assignmentError('assignment_invalid_campaign');

  const profile = await getCurrentOperatorProfile();
  if (profile.status === 'suspended') throw assignmentError('operator_suspended');
  if (profile.status === 'archived') throw assignmentError('operator_archived');
  if (profile.status && profile.status !== 'active') throw assignmentError('operator_profile_missing', { status: profile.status });

  const assignments = await getValidOperatorAssignments(campaignId);
  if (!assignments.length) throw assignmentError('assignment_missing');

  const now = Date.now();
  const active = assignments.filter((assignment) => assignment.status === 'active');
  const valid = active.filter((assignment) => {
    const startsAt = assignment.starts_at ? Date.parse(assignment.starts_at) : null;
    const endsAt = assignment.ends_at ? Date.parse(assignment.ends_at) : null;
    return (!Number.isFinite(startsAt) || startsAt <= now) && (!Number.isFinite(endsAt) || endsAt > now);
  });

  if (valid.length === 1) {
    return { profile, assignment: valid[0], assignments };
  }
  if (valid.length > 1) throw assignmentError('assignment_ambiguous', { count: valid.length });

  if (assignments.every((assignment) => assignment.status === 'revoked')) throw assignmentError('assignment_revoked');
  if (assignments.every((assignment) => assignment.status === 'completed')) throw assignmentError('assignment_completed');
  if (active.length && active.every((assignment) => assignment.starts_at && Date.parse(assignment.starts_at) > now)) {
    throw assignmentError('assignment_not_started');
  }
  if (active.length && active.every((assignment) => assignment.ends_at && Date.parse(assignment.ends_at) <= now)) {
    throw assignmentError('assignment_expired');
  }

  throw assignmentError('assignment_missing');
}

export async function startGpsSession(campaignId, { assignmentId } = {}) {
  const client = await requireSupabase();
  const driverId = await getCurrentUserId();
  const now = new Date().toISOString();

  if (!isValidUuid(assignmentId)) throw assignmentError('assignment_missing');

  if (import.meta.env.DEV) console.log('START GPS SESSION', { campaignId, hasAssignment: true });

  const { data, error } = await client
    .from('delivery_sessions')
    .insert({
      campaign_id: campaignId,
      driver_id: driverId,
      assignment_id: assignmentId,
      status: 'started',
      started_at: now,
    })
    .select('*')
    .single();

  if (import.meta.env.DEV) {
    console.log('SUPABASE SESSION RESULT', {
      success: !error,
      sessionId: data?.id || null,
      errorCode: error?.code || null,
      errorStatus: error?.status || null,
    });
  }

  if (error) throw error;
  return data;
}

export async function getActiveGpsSession(campaignId) {
  const client = await requireSupabase();
  const driverId = await getCurrentUserId();

  let query = client.from('delivery_sessions').select('*');
  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }
  query = query
    .eq('driver_id', driverId)
    .in('status', ['started', 'paused'])
    .order('started_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function pauseGpsSession(sessionId) {
  return updateGpsSession(sessionId, {
    status: 'paused',
    paused_at: new Date().toISOString(),
  });
}

export async function resumeGpsSession(sessionId) {
  return updateGpsSession(sessionId, {
    status: 'started',
    paused_at: null,
  });
}

export async function endGpsSession(sessionId) {
  return updateGpsSession(sessionId, {
    status: 'completed',
    ended_at: new Date().toISOString(),
  });
}

export async function updateSessionAdminOverride(sessionId, patch) {
  return updateGpsSession(sessionId, patch);
}

async function updateGpsSession(sessionId, patch) {
  const client = await requireSupabase();

  const { data, error } = await client
    .from('delivery_sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function insertGpsPoint({
  campaignId,
  sessionId,
  driverId,
  lat,
  lng,
  accuracy,
  speed,
  heading,
  recordedAt,
}) {
  const client = await requireSupabase();
  const authenticatedDriverId = await getCurrentUserId();
  const resolvedDriverId = driverId || authenticatedDriverId;

  if (resolvedDriverId !== authenticatedDriverId) {
    throw new Error(GPS_DRIVER_MISMATCH_MESSAGE);
  }

  const { data, error } = await withRetry(async () => {
    const result = await client
      .from('gps_tracking_points')
      .insert({
        campaign_id: campaignId,
        session_id: sessionId,
        driver_id: resolvedDriverId,
        lat,
        lng,
        accuracy,
        speed,
        heading,
        recorded_at: recordedAt || new Date().toISOString(),
      })
      .select('*')
      .single();
    if (result.error) throw result.error;
    return result;
  }, 'invio punto GPS');

  if (import.meta.env.DEV) {
    console.log('SUPABASE GPS POINT RESULT', {
      success: !error,
      pointId: data?.id || null,
      errorCode: error?.code || null,
      errorStatus: error?.status || null,
    });
  }

  if (error) throw error;
  return data;
}

export async function heartbeatGpsSession(sessionId) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('delivery_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error) {
    const message = `${error.message || ''} ${error.details || ''}`;
    if (message.toLowerCase().includes('updated_at')) return null;
    throw error;
  }
  return data;
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
    .order('created_at', { ascending: false });

  if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
    query = query.eq('campaign_id', campaignId);
  }

  if (approvedOnly) query = query.not('approved_at', 'is', null);

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function uploadProofPhoto({ campaignId, sessionId, file, lat, lng, note }) {
  const client = await requireSupabase();
  const driverId = await getCurrentUserId();

  if (!file) throw new Error('Seleziona una foto prova.');

  const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'jpg';
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const storagePath = `${campaignId}/${sessionId || 'no-session'}/${Date.now()}-${uuid}.${safeExt}`;

  const upload = await withRetry(async () => {
    const result = await client.storage.from(PROOF_BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (result.error) throw result.error;
    return result;
  }, 'upload foto proof');

  if (upload.error) throw upload.error;

  const { data, error } = await withRetry(async () => {
    const result = await client
      .from('proof_photos')
      .insert({
        campaign_id: campaignId,
        session_id: sessionId || null,
        driver_id: driverId,
        storage_path: storagePath,
        lat,
        lng,
        note: note || null,
        taken_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (result.error) throw result.error;
    return result;
  }, 'archiviazione foto proof');

  if (error) throw error;
  console.info('[PHOTO_PROOF_ARCHIVED]', { campaignId, sessionId, driverId, storagePath });
  return data;
}

export async function createProofPhotoSignedUrl(storagePath) {
  const client = await requireSupabase();

  if (!storagePath) return null;

  const { data, error } = await client.storage
    .from(PROOF_BUCKET)
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
  const tables = ['campaigns', 'campagne', 'quote_requests'];
  for (const table of tables) {
    const { data, error } = await client.from(table).select('*').eq('id', campaignId).maybeSingle();
    if (!error && data) return data;
  }
  return null;
}

export function getSessionGroup(session) {
  const metadata = safeJson(session?.metadata || session?.session_metadata);
  const id = metadata.group_id || metadata.groupId || metadata.group || metadata.group_uuid || null;
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

export function isLatLngPoint(p) {
  if (!p || typeof p !== 'object') return false;
  if ('lat' in p || 'lng' in p || 'latitude' in p || 'longitude' in p) {
    const lat = Number(p.lat ?? p.latitude);
    const lng = Number(p.lng ?? p.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  if (Array.isArray(p) && p.length >= 2) {
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  return false;
}

export function isSvgPoint(p) {
  if (!p || typeof p !== 'object') return false;
  if ('lat' in p || 'lng' in p || 'latitude' in p || 'longitude' in p) return false;
  if ('x' in p || 'y' in p) {
    const x = Number(p.x);
    const y = Number(p.y);
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100;
  }
  if (Array.isArray(p) && p.length >= 2) {
    const x = Number(p[0]);
    const y = Number(p[1]);
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100;
  }
  return false;
}
