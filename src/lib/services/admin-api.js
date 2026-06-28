import { supabase } from '../../supabaseClient.js';
import {
  calculateDistanceKm,
  classifyDriverStatus,
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
import { lastActivityAt, sessionDurationMs } from './report-utils.js';

const EMPTY = 'Dato non disponibile';

export async function getRealCampaigns({ includeTest = false } = {}) {
  const [campaignsTable, legacyCampaigns, quoteRequests, sessions, points, photos] = await Promise.all([
    selectOptionalTable('campaigns'),
    selectOptionalTable('campagne'),
    selectOptionalTable('quote_requests'),
    selectOptionalTable('delivery_sessions'),
    selectOptionalTable('gps_tracking_points', 'recorded_at'),
    selectOptionalTable('proof_photos'),
  ]);

  const rows = uniqueById([
    ...campaignsTable.rows.map((row) => normalizeCampaign(row, 'campaigns')),
    ...legacyCampaigns.rows.map((row) => normalizeCampaign(row, 'campagne')),
    ...quoteRequests.rows.map((row) => normalizeCampaign(row, 'quote_requests')),
  ]).map((campaign) => ({
    ...campaign,
    ops: summarizeCampaignOps(campaign.id, sessions.rows, points.rows, photos.rows),
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

export async function getCampaignReport(campaignId) {
  const [campaign, sessions, points, photos] = await Promise.all([
    getCampaignRecord(campaignId).catch(() => null),
    getCampaignGpsSessions(campaignId).catch(() => []),
    getCampaignGpsPoints(campaignId).catch(() => []),
    getCampaignProofPhotos(campaignId).catch(() => []),
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
  };
}

export async function getApprovedProofPhotos(campaignId) {
  const photos = await getCampaignProofPhotos(campaignId, { approvedOnly: true }).catch(() => []);
  return Promise.all(photos.map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
}

export async function getAdminCoverageCorrections(campaignId, { groupId } = {}) {
  if (!supabase) return [];
  try {
    let query = supabase.from('admin_coverage_corrections').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true });
    if (groupId) query = query.eq('group_id', groupId);
    const { data, error } = await query;
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function createAdminCoverageCorrection({
  campaignId,
  groupId,
  driverId = null,
  adminId = null,
  correctionType,
  reason,
  label,
  notes = null,
  estimatedKm = 0,
  geom = null,
}) {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase
    .from('admin_coverage_corrections')
    .insert({
      campaign_id: campaignId,
      group_id: groupId || null,
      driver_id: driverId || null,
      admin_id: adminId || null,
      correction_type: correctionType,
      reason,
      label,
      notes,
      estimated_km: Number(estimatedKm) || 0,
      geom,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getAssignedZones(campaignId, { groupId } = {}) {
  if (!supabase) return [];
  try {
    let query = supabase.from('assigned_zones').select('*').eq('campaign_id', campaignId);
    if (groupId) query = query.eq('group_id', groupId);
    const { data, error } = await query;
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function computeCoverageMetrics(realKm, targetKm, corrections = []) {
  const tKm = Number(targetKm) > 0 ? Number(targetKm) : Math.max(10, realKm || 10);
  const realPercent = Math.min(100, Math.round((Number(realKm || 0) / tKm) * 100));
  
  const validAdminKm = (corrections || [])
    .filter(c => ['coperto_manualmente', 'validato_admin'].includes(c.correction_type))
    .reduce((sum, c) => sum + (Number(c.estimated_km) || 0), 0);
  const manualAdminPercent = Math.min(100, Math.round((validAdminKm / tKm) * 100));

  const redoKm = (corrections || [])
    .filter(c => c.correction_type === 'da_rifare')
    .reduce((sum, c) => sum + (Number(c.estimated_km) || 0), 0);
  const redoPercent = Math.min(100, Math.round((redoKm / tKm) * 100));

  const finalClientPercent = Math.min(100, realPercent + manualAdminPercent);

  return {
    copertura_gps_reale_percent: realPercent,
    copertura_manual_admin_percent: manualAdminPercent,
    copertura_da_rifare_percent: redoPercent,
    copertura_finale_cliente_percent: finalClientPercent,
  };
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

function summarizeCampaignOps(campaignId, sessions, points, photos) {
  const campaignSessions = sessions.filter((session) => session.campaign_id === campaignId);
  const sessionRows = campaignSessions.map((session) => {
    const sessionPoints = points.filter((point) => point.session_id === session.id);
    return { session, points: sessionPoints, activityAt: lastActivityAt(session, sessionPoints) };
  });
  const groups = buildGroupRows({ sessions: sessionRows, photos: photos.filter((photo) => photo.campaign_id === campaignId) });
  const operators = new Set(campaignSessions.map((session) => session.driver_id || session.driver_name).filter(Boolean));
  const online = sessionRows.filter((row) => classifyDriverStatus(row.activityAt) === 'online').length;
  const offline = sessionRows.filter((row) => classifyDriverStatus(row.activityAt) === 'offline').length;
  const completed = campaignSessions.filter((session) => session.status === 'completed').length;
  const active = campaignSessions.filter((session) => ['started', 'paused'].includes(session.status)).length;
  const progress = campaignSessions.length ? Math.min(95, Math.round(((completed + active * 0.5) / campaignSessions.length) * 100)) : 0;
  const lastPing = sessionRows.map((row) => row.activityAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const problems = sessionRows.filter((row) => !row.points.length || classifyDriverStatus(row.activityAt) === 'offline').length;
  return { groups: groups.length, operators: operators.size, online, offline, problems, progress, lastPing };
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
