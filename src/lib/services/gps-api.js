import { supabase } from '../../supabaseClient.js';

const PROOF_BUCKET = 'proof-photos';
const DEV_DRIVER_ID = '22222222-2222-2222-2222-222222222222';
const RETRY_DELAYS_MS = [800, 1800, 4000];

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
    if (import.meta.env.DEV) console.warn('Auth non disponibile, uso driver test.', error);
  }

  return data?.user?.id || DEV_DRIVER_ID;
}

async function withRetry(operation, label = 'operazione Supabase') {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError || new Error(`${label} non riuscita.`);
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function startGpsSession(campaignId) {
  const client = await requireSupabase();
  const driverId = await getCurrentUserId();
  const now = new Date().toISOString();

  if (import.meta.env.DEV) console.log('START GPS SESSION', { campaignId, driverId });

  const { data, error } = await client
    .from('delivery_sessions')
    .insert({
      campaign_id: campaignId,
      driver_id: driverId,
      status: 'started',
      started_at: now,
    })
    .select('*')
    .single();

  if (import.meta.env.DEV) console.log('SUPABASE SESSION RESULT', { data, error });

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
  const resolvedDriverId = driverId || (await getCurrentUserId());

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

  if (import.meta.env.DEV) console.log('SUPABASE GPS POINT RESULT', { data, error });

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

  const upload = await client.storage.from(PROOF_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (upload.error) throw upload.error;

  const { data, error } = await client
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

  if (error) throw error;
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
