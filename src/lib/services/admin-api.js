import { supabase } from '../../supabaseClient.js';
import {
  calculateDistanceKm,
  classifyDriverStatus,
  classifySessionLifecycle,
  createProofPhotoSignedUrl,
  displayDriverName,
  getCampaignGpsPoints,
  getCampaignGpsSessions,
  getCampaignProofPhotos,
  getCampaignRecord,
  getSessionGroup,
  getSessionPath,
} from './gps-api.js';
import { buildGroupRows } from './group-ops.js';
import { dedupeSessionsByOperator, lastActivityAt, sessionDurationMs } from './report-utils.js';

const EMPTY = 'Dato non disponibile';

export async function getRealCampaigns({ includeTest = false } = {}) {
  const [campaignsTable, legacyCampaigns, quoteRequests, sessions, points, photos, groups, assignments] = await Promise.all([
    selectOptionalTable('campaigns'),
    selectOptionalTable('campagne'),
    selectOptionalTable('quote_requests'),
    selectOptionalTable('delivery_sessions'),
    selectOptionalTable('gps_tracking_points', 'recorded_at'),
    selectOptionalTable('proof_photos'),
    selectOptionalTable('operational_groups'),
    selectOptionalTable('operator_assignments'),
  ]);

  const rows = uniqueById([
    ...campaignsTable.rows.map((row) => normalizeCampaign(row, 'campaigns')),
    ...legacyCampaigns.rows.map((row) => normalizeCampaign(row, 'campagne')),
    ...quoteRequests.rows.map((row) => normalizeCampaign(row, 'quote_requests')),
  ]).map((campaign) => ({
    ...campaign,
    ops: summarizeCampaignOps(campaign.id, sessions.rows, points.rows, photos.rows, groups.rows, assignments.rows),
  }));

  return {
    rows: includeTest ? rows : rows.filter((campaign) => campaign.quality === 'real'),
    allRows: rows,
    availability: {
      campaigns: campaignsTable.available || legacyCampaigns.available || quoteRequests.available,
      sessions: sessions.available,
      gps: points.available,
      photos: photos.available,
    },
  };
}

export async function getRealGroups(campaignId) {
  const report = await getCampaignReport(campaignId);
  return report.groups;
}

export async function getGroupSessions(campaignId, groupId) {
  const report = await getCampaignReport(campaignId);
  return report.sessions.filter((item) => getSessionGroup(item.session).id === groupId);
}

export async function getLiveDrivers() {
  const sessionsResult = await selectOptionalTable('delivery_sessions');
  if (!sessionsResult.available) return [];
  const sessions = sessionsResult.rows;
  const drivers = await Promise.all(sessions.map(async (session) => {
    const points = await getSessionPath(session.id).catch(() => []);
    const latest = points[points.length - 1] || null;
    const activityAt = lastActivityAt(session, points);
    return {
      session,
      latest,
      points,
      activityAt,
      lastPing: activityAt,
      status: classifyDriverStatus(activityAt),
      driverName: displayDriverName(session),
      group: getSessionGroup(session),
      groupName: getSessionGroup(session).name,
      km: calculateDistanceKm(points),
    };
  }));
  return drivers;
}

// Fonte unica di verita' per "chi e' davvero operativo adesso", condivisa da
// AdminLiveDashboard e dalla Dashboard Admin principale: stessa
// classificazione lifecycle (completed/cancelled -> mai offline attuale;
// 'started' abbandonata da giorni -> storico, non un problema di oggi) e
// stessa deduplicazione per operatore, cosi' i due conteggi coincidono
// sempre — nessuna seconda logica riscritta altrove.
export async function getLiveOperatorsSummary() {
  const drivers = await getLiveDrivers();
  const withLifecycle = drivers.map((item) => ({
    ...item,
    lifecycle: classifySessionLifecycle(item.session, item.activityAt),
  }));
  const current = dedupeSessionsByOperator(withLifecycle.filter((item) => item.lifecycle !== 'history'));
  return {
    all: withLifecycle,
    current,
    liveCount: current.filter((item) => item.lifecycle === 'live').length,
    warningCount: current.filter((item) => item.lifecycle === 'warning').length,
    offlineRecentCount: current.filter((item) => item.lifecycle === 'offline_recent').length,
    historyCount: withLifecycle.length - withLifecycle.filter((item) => item.lifecycle !== 'history').length,
  };
}

export async function getCampaignReport(campaignId) {
  const [campaign, sessions, points, photos] = await Promise.all([
    getCampaignRecord(campaignId).catch(() => null),
    getCampaignGpsSessions(campaignId).catch(() => []),
    getCampaignGpsPoints(campaignId).catch(() => []),
    getCampaignProofPhotos(campaignId).catch(() => []),
    supabase.from('operator_assignments').select('operator_id, operational_groups!inner(id)').eq('operational_groups.campaign_id', campaignId).catch(() => ({ data: [] })),
  ]);
  const paths = sessions.map((session) => ({
    session,
    points: points.filter((point) => point.session_id === session.id),
  }));
  const groups = buildGroupRows({ sessions: paths, photos });
  return {
    campaign,
    campaignId,
    sessions: paths,
    points,
    photos,
    groups,
    totalPoints: paths.reduce((sum, item) => sum + item.points.length, 0),
    totalKm: paths.reduce((sum, item) => sum + calculateDistanceKm(item.points), 0),
    totalMs: paths.reduce((sum, item) => sum + sessionDurationMs(item.session), 0),
    assignedDriversCount: new Set((assignmentsRes?.data || []).map(a => a.operator_id)).size,
  };
}

export async function getApprovedProofPhotos(campaignId) {
  const photos = await getCampaignProofPhotos(campaignId, { approvedOnly: true }).catch(() => []);
  return Promise.all(photos.map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
}

export async function selectOptionalTable(table, order = 'created_at') {
  if (!supabase) return { rows: [], available: false };
  try {
    let query = supabase.from(table).select('*');
    if (order) query = query.order(order, { ascending: false });
    const { data, error } = await query;
    if (error) return { rows: [], available: false };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

export async function getCampaignZonesWithGroups(campaignId) {
  const [zonesRes, groupsRes] = await Promise.all([
    supabase.from('campaign_zones').select('*').eq('campaign_id', campaignId).order('priority', { ascending: true, nullsFirst: false }).order('zone_name'),
    supabase.from('operational_groups').select('id, name, lead_name').eq('campaign_id', campaignId).order('name')
  ]);
  
  if (zonesRes.error) throw new Error(zonesRes.error.message);
  if (groupsRes.error) throw new Error(groupsRes.error.message);
  
  return {
    zones: zonesRes.data || [],
    groups: groupsRes.data || []
  };
}

export async function updateCampaignZoneAssignment(zoneId, updates) {
  const { data, error } = await supabase
    .from('campaign_zones')
    .update(updates)
    .eq('id', zoneId)
    .select()
    .single();
    
  if (error) throw new Error(error.message);
  return data;
}

export function normalizeCampaign(row, source) {
  const rawStatus = String(row.status || row.stato || row.state || row.stato_pagamento || '').toLowerCase();
  const serviceSource = row.service_type || row.campaign_type || row.type || row.servizio || row.selected_service || row.service;
  const serviceRaw = String(serviceSource || '').toLowerCase();
  const total = Number(row.total_budget ?? row.total_amount ?? row.amount ?? row.price ?? row.totale);
  const qty = Number(row.total_flyers ?? row.flyer_quantity ?? row.qty ?? row.quantita ?? row.quantity);
  const lat = Number(row.center_lat ?? row.lat ?? row.latitude ?? row.metadata?.center_lat ?? row.metadata?.lat);
  const lng = Number(row.center_lng ?? row.lng ?? row.longitude ?? row.metadata?.center_lng ?? row.metadata?.lng);
  const campaign = {
    id: row.id || row.campaign_id || row.request_id,
    client: row.client_name || row.customer_name || row.nome_cliente || row.nome || row.title || row.email || EMPTY,
    service: serviceRaw.includes('h2h') || serviceRaw.includes('hand') ? 'h2h' : serviceRaw.includes('b2b') || serviceRaw.includes('business') ? 'b2b' : serviceRaw ? 'd2d' : null,
    zone: row.zone_name || row.city_name || row.zone_label || row.zona || row.zone || row.municipality_name || row.title || EMPTY,
    name: row.campaign_name || row.title || row.name || '',
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    status: normalizeStatus(rawStatus),
    date: String(row.start_date || row.created_at || row.updated_at || '').slice(0, 10) || EMPTY,
    total: Number.isFinite(total) && total > 0 ? total : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    rawStatus,
    createdBy: row.created_by || row.createdBy || row.user_id || row.customer_id || row.metadata?.created_by || '',
    isTest: Boolean(row.is_test),
    source,
  };
  const quality = classifyCampaign(campaign, row, serviceSource);
  return { ...campaign, quality: quality.kind, qualityReason: quality.reason };
}

function summarizeCampaignOps(campaignId, sessions, points, photos, opGroups = [], opAssignments = []) {
  const campaignSessions = sessions.filter((session) => session.campaign_id === campaignId);
  const sessionRows = campaignSessions.map((session) => {
    const sessionPoints = points.filter((point) => point.session_id === session.id);
    return { session, points: sessionPoints, activityAt: lastActivityAt(session, sessionPoints) };
  });
  
  const derivedGroups = buildGroupRows({ sessions: sessionRows, photos: photos.filter((photo) => photo.campaign_id === campaignId) });
  const realGroups = opGroups.filter((g) => g.campaign_id === campaignId);
  const realGroupIds = new Set(realGroups.map((g) => g.id));
  const realAssignments = opAssignments.filter((a) => realGroupIds.has(a.group_id));
  
  const realOperators = new Set(realAssignments.map((a) => a.operator_id));
  const derivedOperators = new Set(campaignSessions.map((session) => session.driver_id || session.driver_name).filter(Boolean));

  const finalGroupsCount = realGroups.length > 0 ? realGroups.length : derivedGroups.length;
  const finalOperatorsCount = realOperators.size > 0 ? realOperators.size : derivedOperators.size;

  // online/offline/problemi: stessa classificazione lifecycle e stessa
  // deduplicazione per operatore di AdminLiveDashboard/getLiveOperatorsSummary
  // — una sessione 'completed' non e' mai "offline", una sessione 'started'
  // abbandonata da giorni e' storico (non conta), e un operatore con piu'
  // sessioni non chiuse conta una volta sola.
  const rowsWithLifecycle = sessionRows.map((row) => ({ ...row, lifecycle: classifySessionLifecycle(row.session, row.activityAt) }));
  const currentRows = dedupeSessionsByOperator(rowsWithLifecycle.filter((row) => row.lifecycle !== 'history'));
  const online = currentRows.filter((row) => row.lifecycle === 'live').length;
  const offline = currentRows.filter((row) => row.lifecycle === 'offline_recent').length;
  const completed = campaignSessions.filter((session) => session.status === 'completed').length;
  const active = campaignSessions.filter((session) => ['started', 'paused'].includes(session.status)).length;
  const progress = campaignSessions.length ? Math.min(95, Math.round(((completed + active * 0.5) / campaignSessions.length) * 100)) : 0;
  const lastPing = sessionRows.map((row) => row.activityAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const problems = currentRows.filter((row) => !row.points.length || row.lifecycle === 'offline_recent').length;
  return { groups: finalGroupsCount, operators: finalOperatorsCount, online, offline, problems, progress, lastPing };
}

function classifyCampaign(campaign, row, serviceSource) {
  const haystack = [
    campaign.id,
    campaign.client,
    campaign.zone,
    campaign.rawStatus,
    campaign.createdBy,
    row.email,
    row.title,
    row.note,
    row.metadata?.source,
  ].filter(Boolean).join(' ').toLowerCase();
  if (campaign.isTest) return { kind: 'test', reason: 'flag is_test' };
  if (String(campaign.id || '').startsWith('11111111-1111-1111-1111')) return { kind: 'test', reason: 'campaign_id test' };
  if (/\b(test|demo|placeholder|fake|sample)\b/.test(haystack)) return { kind: 'test', reason: 'record test/demo' };
  if (!cleanText(campaign.client) || campaign.client === EMPTY) return { kind: 'incomplete', reason: 'cliente mancante' };
  if (!cleanText(campaign.zone) || campaign.zone === EMPTY) return { kind: 'incomplete', reason: 'zona mancante' };
  if (!campaign.qty) return { kind: 'incomplete', reason: 'quantita mancante' };
  if (!serviceSource || !campaign.service) return { kind: 'incomplete', reason: 'servizio mancante' };
  if (['placeholder', 'test', 'demo'].some((token) => campaign.rawStatus.includes(token))) return { kind: 'test', reason: 'stato test' };
  return { kind: 'real', reason: 'record operativo reale' };
}

function normalizeStatus(value) {
  if (['active', 'started', 'in_corso', 'confermata', 'confirmed', 'pending_review', 'pagato'].some((token) => value.includes(token))) return 'active';
  if (['completed', 'done', 'completata', 'cancelled'].some((token) => value.includes(token))) return 'done';
  return 'pending';
}

function uniqueById(rows) {
  return Array.from(new Map(rows.filter((row) => row.id).map((row) => [String(row.id), row])).values());
}

function cleanText(value) {
  const text = String(value || '').trim();
  if (!text || text === EMPTY) return '';
  if (['null', 'undefined', 'n/a', '-'].includes(text.toLowerCase())) return '';
  return text;
}
