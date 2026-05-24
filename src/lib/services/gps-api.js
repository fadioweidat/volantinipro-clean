import { supabase } from '../../supabaseClient.js';

const PROOF_BUCKET = 'proof-photos';
const DEV_DRIVER_ID = '22222222-2222-2222-2222-222222222222';

async function requireSupabase() {
  if (!supabase) throw new Error('Supabase non configurato.');
  return supabase;
}

async function getCurrentUserId() {
  const client = await requireSupabase();
  const { data, error } = await client.auth.getUser();

  if (error) {
    console.warn('Auth non disponibile, uso driver test.', error);
  }

  return data?.user?.id || DEV_DRIVER_ID;
}

export async function startGpsSession(campaignId) {
  const client = await requireSupabase();
  const driverId = await getCurrentUserId();
  const now = new Date().toISOString();

  console.log('START GPS SESSION', { campaignId, driverId });

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

  console.log('SUPABASE SESSION RESULT', { data, error });

  if (error) throw error;
  return data;
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

  const { data, error } = await client
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

  console.log('SUPABASE GPS POINT RESULT', { data, error });

  if (error) throw error;
  return data;
}

export async function getCampaignGpsPoints(campaignId) {
  const client = await requireSupabase();

  const { data, error } = await client
    .from('gps_tracking_points')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getCampaignGpsSessions(campaignId) {
  const client = await requireSupabase();

  const { data, error } = await client
    .from('delivery_sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

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