import { supabase } from '../../supabaseClient.js';

const VALID_STATUSES = new Set(['draft', 'pending_review', 'in_progress', 'completed', 'cancelled', 'problem']);

export async function createCampaign(payload) {
  const client = requireSupabase();
  const record = toCampaignRecord(payload);
  const { data, error } = await client
    .from('campaigns')
    .insert(record)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getCampaigns({ includeTest = false } = {}) {
  const client = requireSupabase();
  let query = client
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (!includeTest) query = query.eq('is_test', false);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((campaign) => ({
    ...campaign,
    classification: classifyCampaign(campaign),
  }));
}

export async function getCampaignById(id) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateCampaignStatus(id, status) {
  if (!VALID_STATUSES.has(status)) throw new Error('Status campagna non valido.');
  const client = requireSupabase();
  const { data, error } = await client
    .from('campaigns')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getActiveCampaigns() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('campaigns')
    .select('*')
    .eq('is_test', false)
    .in('status', ['pending_review', 'in_progress'])
    .order('start_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function classifyCampaign(campaign) {
  if (!campaign) return { kind: 'incomplete', reason: 'campagna mancante' };
  if (campaign.is_test || String(campaign.id || '').startsWith('11111111-1111-1111-1111')) {
    return { kind: 'test', reason: 'campagna test' };
  }
  if (!text(campaign.client_name)) return { kind: 'incomplete', reason: 'cliente mancante' };
  if (!text(campaign.service_type)) return { kind: 'incomplete', reason: 'servizio mancante' };
  if (!text(campaign.zone_name)) return { kind: 'incomplete', reason: 'zona mancante' };
  if (!Number.isFinite(Number(campaign.quantity)) || Number(campaign.quantity) <= 0) {
    return { kind: 'incomplete', reason: 'quantita mancante' };
  }
  if (!VALID_STATUSES.has(String(campaign.status || 'draft'))) {
    return { kind: 'incomplete', reason: 'status non valido' };
  }
  return { kind: 'real', reason: 'campagna reale manuale' };
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase non configurato.');
  return supabase;
}

function toCampaignRecord(payload) {
  const quantity = Number(payload.quantity);
  if (!text(payload.client_name)) throw new Error('Nome cliente obbligatorio.');
  if (!text(payload.service_type)) throw new Error('Servizio obbligatorio.');
  if (!text(payload.zone_name)) throw new Error('Zona/comune obbligatoria.');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantita volantini obbligatoria.');

  const status = VALID_STATUSES.has(payload.status) ? payload.status : 'draft';
  return {
    client_name: text(payload.client_name),
    client_phone: nullableText(payload.client_phone),
    client_email: nullableText(payload.client_email),
    service_type: text(payload.service_type),
    campaign_name: nullableText(payload.campaign_name),
    zone_name: text(payload.zone_name),
    city: nullableText(payload.city),
    address: nullableText(payload.address),
    lat: nullableNumber(payload.lat),
    lng: nullableNumber(payload.lng),
    radius_km: nullableNumber(payload.radius_km),
    quantity,
    status,
    start_date: nullableText(payload.start_date),
    end_date: nullableText(payload.end_date),
    total_amount: nullableNumber(payload.total_amount),
    source: nullableText(payload.source) || 'manual',
    is_test: Boolean(payload.is_test),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  };
}

function text(value) {
  return String(value || '').trim();
}

function nullableText(value) {
  const clean = text(value);
  return clean || null;
}

function nullableNumber(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
