import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { deriveOperationAlerts } from '../operations/deriveOperationAlerts.js';
import { buildDailyOperationsReport, localDayBounds } from '../operations/dailyOperationsReport.js';
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
} from './gps-api.js';
import { buildGroupRows } from './group-ops.js';
import { dedupeSessionsByOperator, lastActivityAt, sessionDurationMs } from './report-utils.js';
import { getPublicAppUrl } from '../publicAppUrl.js';
import { classifyDeliverySession, GPS_SESSION_STATE } from '../monitoring/gpsSessionLifecycle.js';

const EMPTY = 'Dato non disponibile';

export async function getRealCampaigns({ includeTest = false } = {}) {
  const [campaignsTable, legacyCampaigns, quoteRequests, sessions, points, photos, groups, assignments, campaignZones] = await Promise.all([
    selectOptionalTable('campaigns'),
    selectOptionalTable('campagne'),
    selectOptionalTable('quote_requests'),
    selectOptionalTable('delivery_sessions'),
    selectOptionalTable('gps_tracking_points', 'recorded_at'),
    selectOptionalTable('proof_photos'),
    selectOptionalTable('operational_groups'),
    selectOptionalTable('operator_assignments'),
    selectOptionalTable('campaign_zones'),
  ]);

  const rows = uniqueById([
    ...campaignsTable.rows.map((row) => normalizeCampaign(row, 'campaigns')),
    ...legacyCampaigns.rows.map((row) => normalizeCampaign(row, 'campagne')),
    ...quoteRequests.rows.map((row) => normalizeCampaign(row, 'quote_requests')),
  ]).map((campaign) => {
    // Comuni/zone reali dalla tabella campaign_zones, non da city/title: stessa
    // source of truth gia' usata da Customer Dashboard (normalizeCustomerCampaign).
    const zoneRows = campaignZones.rows.filter((z) => z.campaign_id === campaign.id);
    return {
      ...campaign,
      ops: summarizeCampaignOps(campaign.id, sessions.rows, points.rows, photos.rows, groups.rows, assignments.rows),
      zones: zoneRows,
      comuni: zoneRows.map((z) => z.zone_name).filter(Boolean),
    };
  });

  return {
    rows: includeTest ? rows : rows.filter((campaign) => campaign.quality === 'real'),
    allRows: rows,
    // Sotto-fetch gia' eseguiti qui, esposti cosi' come sono: un chiamante
    // che ha gia' bisogno anche di groups/assignments/sessions (es.
    // loadAdminHomeData in AdminDashboard.jsx) puo' riusarli invece di
    // rifare le stesse query select('*') una seconda volta nello stesso
    // page load (root cause misurata dell'Admin Dashboard lento: fino a 3-4
    // fetch duplicati delle stesse tabelle in parallelo).
    groups: groups.rows,
    assignments: assignments.rows,
    sessions: sessions.rows,
    // P0 (audit N+1 in getLiveDrivers): esposto per lo stesso motivo di
    // groups/assignments/sessions sopra — un chiamante che gia' ha bisogno
    // dei punti GPS (getLiveOperatorsSummary via loadAdminHomeData) puo'
    // riusarli invece di rifare gps_tracking_points UNA VOLTA PER SESSIONE
    // (root cause reale della lentezza di getLiveOperatorsSummary, vedi
    // getLiveDrivers piu' sotto).
    points: points.rows,
    availability: {
      campaigns: campaignsTable.available || legacyCampaigns.available || quoteRequests.available,
      sessions: sessions.available,
      gps: points.available,
      photos: photos.available,
      groups: groups.available,
      assignments: assignments.available,
    },
  };
}

// Traffico sito (Admin "Commerciale"): legge public.site_events, l'event
// store privacy-safe introdotto per sostituire i placeholder statici di
// CommercialCenter.jsx. Solo lettura grezza qui — l'aggregazione (oggi,
// funnel, conversion rate) e' in src/lib/analytics/siteTrafficSummary.js
// cosi' resta testabile senza rete, stesso pattern di getRealCampaigns.
// Finestra di 3 giorni: sufficiente per calcolare "oggi" in qualunque fuso
// del browser senza scaricare l'intera tabella ad ogni load.
export async function getSiteTraffic() {
  if (!supabase) return { rows: [], available: false };
  try {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('site_events')
      .select('event_name, created_at, anonymous_session_id, path, campaign_id, quote_id')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });
    if (error) return { rows: [], available: false };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

// Analytics Visitatori (dashboard /admin/analytics): righe grezze di
// public.site_events nella finestra richiesta. RLS: solo admin/super_admin
// possono fare SELECT. L'aggregazione (panoramica, geografia, sorgenti,
// pagine, funnel, domanda commerciale) è in
// src/lib/analytics/analyticsAggregate.js, testabile senza rete.
export async function getAnalyticsEvents({ days = 7 } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    await ensureSupabaseSessionBridge();
    const clampedDays = Math.min(90, Math.max(1, Number(days) || 7));
    const cutoff = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('site_events')
      .select('event_name, created_at, anonymous_session_id, session_id, path, referrer_host, referrer_type, utm_source, utm_medium, utm_campaign, utm_content, utm_term, country, region, city, device_type, browser, os, campaign_id, quote_id, metadata')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(50000);
    if (error) return { rows: [], available: false, error: error.message || 'errore' };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch (err) {
    return { rows: [], available: false, error: err?.message || 'errore' };
  }
}

// Rollup giornalieri pre-aggregati (public.analytics_daily_rollup) per finestre
// lunghe (30gg+) senza scaricare l'intera tabella eventi.
export async function getAnalyticsRollups({ days = 30 } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    await ensureSupabaseSessionBridge();
    const clampedDays = Math.min(400, Math.max(1, Number(days) || 30));
    const fromDay = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('analytics_daily_rollup')
      .select('day, dimension, key, visitors, sessions, page_views, events, quotes_started, quotes_completed')
      .gte('day', fromDay)
      .order('day', { ascending: false })
      .limit(20000);
    if (error) return { rows: [], available: false, error: error.message || 'errore' };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch (err) {
    return { rows: [], available: false, error: err?.message || 'errore' };
  }
}

// Stato provider esterni + ultimo login admin/cliente (Centro Controllo
// Sito, Blocco 6 + parte del Blocco 8): questi dati vivono solo lato
// server (secret non esposti al frontend, service-role per auth.admin.
// listUsers), quindi passano dalla Edge Function config-status — mai
// service-role nel browser. La function restituisce solo booleani/
// timestamp, mai i valori dei secret.
export async function getConfigStatus() {
  if (!supabase) return { available: false, providers: null, lastAdminSignIn: null, lastCustomerSignIn: null };
  try {
    const { data, error } = await supabase.functions.invoke('config-status');
    if (error || !data || data.error) return { available: false, providers: null, lastAdminSignIn: null, lastCustomerSignIn: null };
    return { available: true, providers: data.providers, lastAdminSignIn: data.lastAdminSignIn, lastCustomerSignIn: data.lastCustomerSignIn };
  } catch {
    return { available: false, providers: null, lastAdminSignIn: null, lastCustomerSignIn: null };
  }
}

// Dati grezzi per il Centro Controllo Sito (Blocco 2/3/8): un solo punto di
// fetch parallelo che riusa selectOptionalTable/getRealCampaigns/
// getSiteTraffic gia' esistenti — nessuna nuova query duplicata rispetto a
// quelle gia' scritte per gli altri pannelli Admin.
// error_log per il Centro Controllo: solo la finestra utile — tutte le righe
// ancora aperte (a prescindere dall'eta') + tutto cio' che e' stato visto
// negli ultimi `days` giorni — con un tetto esplicito. MAI select('*')
// sull'intera tabella, che cresce fino alla retention a 90 giorni.
async function selectErrorLogForStatus({ days = 7, limit = 400 } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('error_log')
      .select('*')
      .or(`status.eq.open,created_at.gte.${cutoff}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { rows: [], available: false };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

// gps_tracking_points cresce di continuo: per il Centro Controllo serve solo
// la finestra recente (freschezza sessioni 15min + "ultimo GPS ricevuto"),
// non l'intera storia. Colonne minime, finestra 48h, tetto esplicito.
async function selectRecentGpsPointsForStatus({ hours = 48, limit = 5000 } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('gps_tracking_points')
      .select('session_id, recorded_at, created_at')
      .gte('recorded_at', cutoff)
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) return { rows: [], available: false };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

export async function getPlatformStatusData({ siteTrafficPromise } = {}) {
  const [errorLog, campaignsResult, siteTraffic, assignmentEvents, operatorAssignments, deliverySessions, gpsPoints] = await Promise.all([
    selectErrorLogForStatus(),
    getRealCampaigns({ includeTest: true }),
    // Riusa la lettura di getSiteTraffic gia' in volo (runFullCheck la passa
    // anche a runPlatformHealthCheck) invece di rifarla: era la doppia query.
    siteTrafficPromise || getSiteTraffic(),
    selectOptionalTable('assignment_event_log'),
    selectOptionalTable('operator_assignments'),
    selectOptionalTable('delivery_sessions'),
    selectRecentGpsPointsForStatus(),
  ]);
  return {
    errorLog,
    campaigns: campaignsResult,
    siteTraffic,
    assignmentEvents,
    operatorAssignments,
    deliverySessions,
    gpsPoints,
  };
}

// Triage di un errore reale (Blocco 2, "stato aperto/risolto"): solo
// admin/super_admin possono farlo (error_log_admin_all in
// 20260825220000_error_log.sql). Stesso pattern gia' in uso per
// updateCampaignZoneAssignment poco sotto.
export async function resolveErrorLogEntry(errorId) {
  const { data, error } = await supabase
    .from('error_log')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', errorId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Azione VERDE del Centro Controllo: chiude soltanto una riga di log gia'
// vecchia. Non elimina dati e non modifica il sistema che ha generato
// l'errore. Il chiamante applica la soglia minima di 72h; qui la
// ri-verifichiamo sul record reale prima dell'UPDATE (fail closed).
export async function autoResolveOldErrorLogEntry(errorId, { now = new Date() } = {}) {
  await ensureSupabaseSessionBridge();
  const { data: current, error: readError } = await supabase
    .from('error_log')
    .select('id,status,last_seen_at,created_at')
    .eq('id', errorId)
    .single();
  if (readError) throw new Error(readError.message);
  if (current.status !== 'open') return current;
  const lastSeen = new Date(current.last_seen_at || current.created_at).getTime();
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen < 72 * 60 * 60 * 1000) throw new Error('ERROR_NOT_OLD_ENOUGH');
  const { data, error } = await supabase
    .from('error_log')
    .update({ status: 'resolved', resolved_at: now.toISOString(), resolved_note: 'auto' })
    .eq('id', errorId)
    .eq('status', 'open')
    .select('id,status,resolved_at,resolved_note')
    .single();
  if (error) throw new Error(error.message);
  if (data?.status !== 'resolved') throw new Error('POST_FIX_VERIFICATION_FAILED');
  return data;
}

// Azione VERDE GPS: prima legge nuovamente sessione e MAX(recorded_at), poi
// riclassifica. Solo ABANDONED (>4h) arriva alla RPC admin-only, che verifica
// di nuovo stato e timestamp nel database e registra gps_operator_audit_log.
export async function recoverAbandonedGpsSession(target, { now = new Date() } = {}) {
  await ensureSupabaseSessionBridge();
  const { data: session, error: sessionError } = await supabase
    .from('delivery_sessions')
    .select('id,status,started_at,paused_at,ended_at')
    .eq('id', target?.id)
    .single();
  if (sessionError) throw new Error(sessionError.message);
  const { data: lastPoint, error: pointError } = await supabase
    .from('gps_tracking_points')
    .select('recorded_at')
    .eq('session_id', session.id)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pointError) throw new Error(pointError.message);
  const classification = classifyDeliverySession(session, { now, lastGpsRecordedAt: lastPoint?.recorded_at || null });
  if (classification.state !== GPS_SESSION_STATE.ABANDONED) throw new Error('GPS_SESSION_NOT_ABANDONED');
  const source = lastPoint?.recorded_at ? 'last_gps_recorded_at' : 'no_gps_evidence';
  const { data, error } = await supabase.rpc('gps_recover_abandoned_session', {
    p_session_id: session.id,
    p_ended_at: lastPoint?.recorded_at || null,
    p_reason: 'control_center_allowlisted_recovery',
    p_expected_current_status: session.status,
    p_ended_at_source: source,
  });
  if (error) throw new Error(error.message);
  if (data?.status !== 'cancelled') throw new Error('POST_FIX_VERIFICATION_FAILED');
  return data;
}

// Vista unificata "Clienti & Preventivi" (ADMIN-OPS-UNIFY-1): compone dati
// gia' letti altrove (getRealCampaigns, operational_groups,
// operator_assignments, operator_assignment_zones, operator_profiles,
// delivery_sessions, assignment_event_log) in una riga per campagna. Nessuna
// nuova tabella, nessun nuovo RPC: solo lettura e derivazione client-side,
// stessa fonte dati gia' usata da AdminOperationsCenter/AssignWork.
// prefetched (opzionale): quando il chiamante (loadAdminHomeData in
// AdminDashboard.jsx) ha gia' recuperato campaigns/groups/assignments/
// operators nello stesso page load (es. da getRealCampaigns, che li
// espone gia' come sotto-prodotto), passarli qui evita di rifare da zero
// le stesse query select('*')/RPC in parallelo — root cause misurata
// della lentezza dell'Admin Dashboard. Comportamento standalone (nessun
// prefetched, es. ClientsQuotes.jsx aperta direttamente) invariato: fa
// tutte le sue query come prima.
export async function getClientsQuotesOverview({ includeTest = false, prefetched = null } = {}) {
  const needCampaigns = !prefetched?.campaigns;
  const needGroups = !prefetched?.groups;
  const needAssignments = !prefetched?.assignments;
  const needOperators = !prefetched?.operators;
  const needSessions = !prefetched?.sessions;

  const [campaignsRes, groupsRes, assignmentsRes, assignmentZonesRes, operatorsRes, sessionsRes, logsRes] = await Promise.all([
    needCampaigns ? getRealCampaigns({ includeTest }) : Promise.resolve(null),
    needGroups ? selectOptionalTable('operational_groups') : Promise.resolve(null),
    needAssignments ? selectOptionalTable('operator_assignments') : Promise.resolve(null),
    selectOptionalTable('operator_assignment_zones'),
    // operator_profiles non ha una colonna phone reale: il telefono viene da
    // un join server-side dentro la RPC admin_list_operators (verificato
    // chiamandola direttamente: restituisce id/display_name/phone/status,
    // mentre una select diretta sulla tabella non ha ne' phone ne' status).
    // Stessa RPC gia' usata da AssignWork.jsx, nessun percorso parallelo.
    needOperators ? listAssignableOperators().catch(() => []) : Promise.resolve(null),
    needSessions ? selectOptionalTable('delivery_sessions') : Promise.resolve(null),
    selectOptionalTable('assignment_event_log'),
  ]);

  const campaigns = needCampaigns
    ? campaignsRes.rows
    : (includeTest ? prefetched.campaigns : prefetched.campaigns.filter((campaign) => campaign.quality === 'real'));
  const groups = needGroups ? groupsRes.rows : prefetched.groups;
  const assignments = needAssignments ? assignmentsRes.rows : prefetched.assignments;
  const assignmentZones = assignmentZonesRes.rows;
  const operators = needOperators ? operatorsRes : prefetched.operators;
  const sessions = needSessions ? sessionsRes.rows : prefetched.sessions;
  const logs = logsRes.rows.filter((row) => ['assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed', 'assignment_program_revoked'].includes(row.event_type));

  return campaigns.map((campaign) => {
    // Assegnazione attiva piu' recente per questa campagna (nessuna
    // revocata): la stessa regola "prendi la piu' recente non revocata" gia'
    // usata implicitamente da AssignWork quando entra in modalita' modifica.
    const campaignAssignments = assignments
      .filter((a) => a.campaign_id === campaign.id && a.status !== 'revoked' && !a.revoked_at)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const rawAssignment = campaignAssignments[0] || null;

    const group = rawAssignment ? groups.find((g) => g.id === rawAssignment.group_id) || null : null;
    const operator = rawAssignment ? operators.find((op) => op.id === rawAssignment.operator_id) || null : null;
    const zones = rawAssignment
      ? assignmentZones.filter((z) => z.assignment_id === rawAssignment.id).map((z) => ({
          name: z.municipality_name,
          quantity: z.quantity,
        }))
      : [];

    const assignmentLogs = rawAssignment ? logs.filter((l) => l.assignment_id === rawAssignment.id) : [];
    const sentAt = assignmentLogs.find((l) => l.event_type === 'assignment_program_sent')?.created_at || null;
    const openedAt = assignmentLogs.find((l) => l.event_type === 'assignment_program_opened')?.created_at || null;
    const confirmedAt = assignmentLogs.find((l) => l.event_type === 'assignment_program_confirmed')?.created_at || null;
    const revokedAt = assignmentLogs.find((l) => l.event_type === 'assignment_program_revoked')?.created_at || null;
    // P1 ADMIN CONTROL + ROLLBACK: programStatus dipende dall'evento
    // program-related PIU' RECENTE per created_at, non da "esiste almeno un
    // evento di tipo X" (quella regola non gestiva correttamente
    // sent->revoked->sent, che restava bloccato su "revocato" per sempre
    // anche dopo un nuovo invio reale). Esempio: sent->opened->confirmed->
    // revoked => l'ultimo evento e' 'revoked' => 'revocato', non piu'
    // 'confermato'; un successivo nuovo sent => di nuovo 'inviato'.
    const latestProgramLog = assignmentLogs
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
    const programStatus = !rawAssignment
      ? 'nessun_programma'
      : !latestProgramLog
        ? 'da_inviare'
        : latestProgramLog.event_type === 'assignment_program_confirmed' ? 'confermato'
        : latestProgramLog.event_type === 'assignment_program_opened' ? 'aperto'
        : latestProgramLog.event_type === 'assignment_program_sent' ? 'inviato'
        : latestProgramLog.event_type === 'assignment_program_revoked' ? 'revocato'
        : 'da_inviare';

    // GPS: derivato solo da dati reali (nessuna sessione -> non disponibile
    // se manca assignment, pronto se l'assignment esiste ma non e' mai
    // partita una sessione; 'started' vince sempre su 'completed' perche' e'
    // lo stato piu' recente/rilevante per l'Admin in questo istante).
    const assignmentSessions = rawAssignment
      ? sessions.filter((s) => (s.assignment_id ? s.assignment_id === rawAssignment.id : (s.driver_id === rawAssignment.operator_id && s.campaign_id === campaign.id)))
      : [];
    const activeSession = assignmentSessions.find((s) => s.status === 'started');
    const completedSession = assignmentSessions.find((s) => s.status === 'completed');
    const gpsStatus = !rawAssignment ? 'non_disponibile' : activeSession ? 'live' : completedSession ? 'storico' : 'pronto';

    // payment_status vive in metadata (nessuna colonna dedicata reale, vedi
    // confirmCampaignPayment in supabaseClient.js): null/assente NON e'
    // "da pagare", e' semplicemente un dato mancante da segnalare come tale.
    const paymentRaw = campaign.metadata?.payment_status;
    const paymentStatus = paymentRaw === 'pagato' ? 'pagato' : paymentRaw === 'in_attesa_pagamento' ? 'da_pagare' : 'non_disponibile';

    return {
      ...campaign,
      paymentStatus,
      assignment: rawAssignment,
      group,
      operator: operator ? { id: operator.id, name: operator.display_name, phone: operator.phone } : null,
      programZones: zones,
      programStatus,
      programSentAt: sentAt,
      programOpenedAt: openedAt,
      programConfirmedAt: confirmedAt,
      programRevokedAt: revokedAt,
      gpsStatus,
    };
  });
}

export async function getRealGroups(campaignId) {
  const report = await getCampaignReport(campaignId);
  return report.groups;
}

export async function getGroupSessions(campaignId, groupId) {
  const report = await getCampaignReport(campaignId);
  return report.sessions.filter((item) => getSessionGroup(item.session).id === groupId);
}

// P0 ROOT CAUSE (audit performance Admin autenticato): questa funzione
// faceva UNA query gps_tracking_points PER SESSIONE (getSessionPath dentro
// Promise.all — N+1 reale, non solo "N query parallele": ogni round-trip
// paga comunque la sua latenza di rete/cold-start, quindi con N sessioni la
// funzione e' N volte piu' lenta di una singola query batched), oltre a
// ri-scaricare `delivery_sessions` per intero — la STESSA tabella gia'
// scaricata da getRealCampaigns nello stesso loadAdminHomeData.
// `prefetched` (opzionale): quando il chiamante ha gia' sessions/points
// (getRealCampaigns li espone gia' come sotto-prodotto, stesso pattern di
// getClientsQuotesOverview({prefetched})), li riusa filtrando client-side
// invece di rifare le query. Nessun comportamento cambiato per i chiamanti
// che non lo passano (es. AdminLiveDashboard.jsx, invariato).
export async function getLiveDrivers({ prefetched = null } = {}) {
  let sessions;
  let pointsBySession;
  if (prefetched?.sessions && prefetched?.points) {
    sessions = prefetched.sessions;
    pointsBySession = new Map();
    for (const point of prefetched.points) {
      if (!pointsBySession.has(point.session_id)) pointsBySession.set(point.session_id, []);
      pointsBySession.get(point.session_id).push(point);
    }
  } else {
    const sessionsResult = await selectOptionalTable('delivery_sessions');
    if (!sessionsResult.available) return [];
    sessions = sessionsResult.rows;
    const sessionIds = sessions.map((s) => s.id);
    const { data: allPoints } = sessionIds.length
      ? await supabase.from('gps_tracking_points').select('*').in('session_id', sessionIds).order('recorded_at', { ascending: true })
      : { data: [] };
    pointsBySession = new Map();
    for (const point of (allPoints || [])) {
      if (!pointsBySession.has(point.session_id)) pointsBySession.set(point.session_id, []);
      pointsBySession.get(point.session_id).push(point);
    }
  }
  const drivers = sessions.map((session) => {
    const points = pointsBySession.get(session.id) || [];
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
  });
  return drivers;
}

// Fonte unica di verita' per "chi e' davvero operativo adesso", condivisa da
// AdminLiveDashboard e dalla Dashboard Admin principale: stessa
// classificazione lifecycle (completed/cancelled -> mai offline attuale;
// 'started' abbandonata da giorni -> storico, non un problema di oggi) e
// stessa deduplicazione per operatore, cosi' i due conteggi coincidono
// sempre — nessuna seconda logica riscritta altrove.
export async function getLiveOperatorsSummary({ prefetched = null } = {}) {
  const drivers = await getLiveDrivers({ prefetched });
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
  const [campaign, sessions, points, photos, assignmentsRes] = await Promise.all([
    getCampaignRecord(campaignId).catch(() => null),
    getCampaignGpsSessions(campaignId).catch(() => []),
    getCampaignGpsPoints(campaignId).catch(() => []),
    getCampaignProofPhotos(campaignId).catch(() => []),
    supabase.from('operator_assignments').select('operator_id, operational_groups!inner(id)').eq('operational_groups.campaign_id', campaignId).then(res => res.error ? { data: [] } : res),
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

// FASE Centro Controllo — storico uptime/incidenti (Blocco E/orchestratore
// manual). Tutte fail-soft (mai un'eccezione che rompe il resto della
// pagina: stesso discipline di errorLog.js/insertGpsPoint) — vedi
// src/lib/monitoring/healthCollectorClient.js per l'orchestrazione che le
// usa tramite dependency injection (queste funzioni non importano mai
// quel modulo, per evitare un ciclo).
export async function getPlatformHealthHistory({ sinceDays = 30 } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('platform_health_checks')
      .select('check_name, check_group, status, response_time_ms, error_code, error_message, checked_at, source')
      .gte('checked_at', cutoff)
      .order('checked_at', { ascending: false })
      // Tetto esplicito: a regime (collector ogni 5min, ~8 check) la finestra
      // 30gg vale ~69k righe. 40k copre comunque >2 settimane piene di storia
      // ed evita di scaricare l'intera tabella se la retention slitta.
      .limit(40000);
    if (error) return { rows: [], available: false };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

export async function getPlatformIncidents() {
  return selectOptionalTable('platform_incidents', 'started_at');
}

export async function insertPlatformHealthChecks(rows) {
  if (!supabase || !Array.isArray(rows) || rows.length === 0) return;
  try {
    await supabase.from('platform_health_checks').insert(rows);
  } catch {
    // Fire-and-forget: uno storico non scritto non deve mai rompere il
    // Centro Controllo (stesso discipline di errorLog.js).
  }
}

export async function getRecentPlatformHealthChecks(checkName, limit) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('platform_health_checks')
      .select('status, error_code, error_message, checked_at')
      .eq('check_name', checkName)
      .order('checked_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return Array.isArray(data)
      ? data.map((r) => ({ status: r.status, errorCode: r.error_code, errorMessage: r.error_message, checkedAt: r.checked_at }))
      : [];
  } catch {
    return [];
  }
}

export async function getOpenPlatformIncident(checkName) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('platform_incidents')
      .select('*')
      .eq('check_name', checkName)
      .eq('status', 'open')
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

// A differenza delle altre scritture di questo blocco, l'errore QUI viene
// restituito (non inghiottito): l'unique index parziale
// platform_incidents_one_open_per_check_uidx puo' far fallire l'insert con
// un unique_violation (23505) in caso di race tra due esecuzioni
// concorrenti dello stesso check (es. un futuro secondo collector
// simultaneo) — vedi healthCollectorClient.js/recordHealthAndIncidents, che
// usa questo {error} per recuperare l'incidente gia' creato dall'altra
// esecuzione e aggiornarlo invece di considerarlo un fallimento silenzioso.
export async function insertPlatformIncident(incident) {
  if (!supabase) return { error: null };
  try {
    const { error } = await supabase.from('platform_incidents').insert(incident);
    return { error: error || null };
  } catch (err) {
    return { error: err || new Error('insertPlatformIncident failed') };
  }
}

export async function updatePlatformIncident(id, patch) {
  if (!supabase) return;
  try {
    await supabase.from('platform_incidents').update(patch).eq('id', id);
  } catch {
    // Fire-and-forget: vedi insertPlatformHealthChecks.
  }
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

// Marketplace Fornitori — lista Admin. NON esiste (per scelta) una RPC
// dedicata: il modello previsto e' la policy RLS `supplier_profiles_admin_all`
// (`for all to authenticated using jwt_is_admin()`), che concede all'Admin la
// lettura completa della tabella. Questa SELECT gira SOTTO quella policy — non
// la bypassa — esattamente come le altre letture Admin di questo file
// (campaign_zones, operational_groups, smart_pairing_waitlist). Colonne
// esplicite: MAI `documents`/`verified_by`/`suspended_by` (dati non necessari
// alla UI). Le mutazioni di stato passano SOLO da adminSetSupplierStatus (RPC).
const ADMIN_SUPPLIER_COLUMNS =
  'id, public_code, company_name, contact_name, email, phone, vat_number, status, admin_notes, created_at, updated_at, verified_at, suspended_at';

export async function adminListSuppliers() {
  if (!supabase) return { rows: [], available: false };
  try {
    await ensureSupabaseSessionBridge();
    const { data, error } = await supabase
      .from('supplier_profiles')
      .select(ADMIN_SUPPLIER_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) return { rows: [], available: false, error };
    return { rows: Array.isArray(data) ? data : [], available: true };
  } catch (error) {
    return { rows: [], available: false, error };
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

export async function createOperationalGroup({ campaignId, name, leadName = null, notes = null }) {
  if (!isValidUuid(campaignId)) throw new Error('campaign_id non valido.');
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Il nome gruppo e obbligatorio.');
  const { data, error } = await supabase.from('operational_groups').insert({
    campaign_id: campaignId,
    name: cleanName,
    lead_name: String(leadName || '').trim() || null,
    notes: String(notes || '').trim() || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function renameOperationalGroup(groupId, name) {
  if (!isValidUuid(groupId)) throw new Error('group_id non valido.');
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Il nome gruppo e obbligatorio.');
  const { data, error } = await supabase.from('operational_groups').update({ name: cleanName }).eq('id', groupId).select().single();
  if (error) throw error;
  return data;
}

// operational_groups non ha un flag active. La disattivazione revoca solo i
// programmi correnti e conserva il gruppo e l'intero storico assegnazioni.
export async function deactivateOperationalGroup(assignments = []) {
  const active = assignments.filter((item) => item?.status === 'active' && !item?.revoked_at);
  await Promise.all(active.map((item) => revokeOperatorAssignment(item.id)));
  return active.length;
}

export function normalizeCampaign(row, source) {
  const rawStatus = String(row.status || row.stato || row.state || row.stato_pagamento || '').toLowerCase();
  const serviceSource = row.service_type || row.campaign_type || row.type || row.servizio || row.selected_service || row.service;
  const serviceRaw = String(serviceSource || '').toLowerCase();
  const total = Number(row.total_amount);
  const qty = Number(row.quantity ?? row.target_quantity ?? row.total_flyers);
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
    total: row.total_amount != null && Number.isFinite(total) && total >= 0 ? total : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    rawStatus,
      createdBy: row.created_by || row.createdBy || row.user_id || row.customer_id || row.metadata?.created_by || '',
      createdAt: row.created_at || row.updated_at || null,
      leadSource: row.source || row.metadata?.source || source,
      email: row.client_email || row.customer_email || row.email || null,
      phone: row.client_phone || row.customer_phone || row.phone || row.telefono || null,
      company: row.company_name || row.metadata?.company_name || null,
      contactedAt: row.contacted_at || row.metadata?.contacted_at || null,
      metadata: row.metadata || {},
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
  const approvedPhotos = photos.filter((photo) => photo.campaign_id === campaignId && photo.approved_at).length;
  return {
    groups: finalGroupsCount,
    operators: finalOperatorsCount,
    online,
    offline,
    problems,
    progress,
    lastPing,
    sessionCount: campaignSessions.length,
    completedSessions: completed,
    approvedPhotos,
  };
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

// --- Assignment Management -- Admin Only (ADMIN-DRIVER-LINK-2, RC2-FIX-1) ---
// Tutte queste funzioni chiamano RPC Supabase protette che verificano
// jwt_is_admin() server-side (supabase/migrations_production_safe/
// 20260806150009_admin_driver_assignment_flow.sql). Nessun INSERT diretto su
// operator_assignments dal browser: la tabella ha RLS che lo impedisce
// comunque. L'audit trail e' scritto server-side dentro ciascuna RPC
// (public.audit_log, via SECURITY DEFINER) -- non c'e' una chiamata
// client-side a logAuditEvent qui perche' quella scrittura diretta dal
// browser e' deliberatamente disabilitata in questo progetto (vedi
// src/lib/audit.js, "P0 security hardening: direct browser INSERT is
// disabled") e le nuove azioni admin_* non fanno comunque parte della sua
// whitelist client-side.

function isValidUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Dipendenza pre-esistente di AssignWork.jsx/CampaignAssignments.jsx (usata
// per popolare il selettore zone allo step 2). Non esisteva ancora in questo
// worktree; portata qui invariata. Legge public.assigned_zones, tabella gia'
// esistente e verificata sullo schema remoto reale (id/campaign_id/group_id/
// driver_id/label/target_km/target_poi/geom/created_at).
export async function getAssignedZones(campaignId, { groupId } = {}) {
  if (!supabase) return [];
  try {
    let query = supabase.from('assigned_zones').select('*');
    if (campaignId && campaignId !== 'all' && isValidUuid(campaignId)) {
      query = query.eq('campaign_id', campaignId);
    }
    if (groupId && groupId !== 'all' && isValidUuid(groupId)) {
      query = query.eq('group_id', groupId);
    }
    const { data, error } = await query;
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function listAssignableOperators() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('admin_list_operators');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[ADMIN_LIST_OPERATORS_ERROR]', err?.message);
    throw err;
  }
}

// Aggiorna il telefono di un operatore (public.profiles.phone via
// operator_profiles.user_id). Solo Admin/Super Admin: la RPC SECURITY DEFINER
// admin_set_operator_phone applica il guard jwt_is_admin() e la stessa
// validazione lato server. Ritorna la riga operatore aggiornata (stessa forma
// di admin_list_operators) per il refresh immediato della UI.
export async function adminSetOperatorPhone(operatorId, phone) {
  if (!supabase) throw new Error('Supabase non configurato.');
  if (!isValidUuid(operatorId)) throw new Error('id operatore non valido.');
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc('admin_set_operator_phone', {
    p_operator_id: operatorId,
    p_phone: phone == null || phone === '' ? null : phone,
  });
  if (error) {
    console.error('[ADMIN_SET_OPERATOR_PHONE_ERROR]', error?.message);
    throw new Error(error.message || 'Aggiornamento telefono non riuscito.');
  }
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function listCampaignAssignments(campaignId) {
  if (!supabase) return [];
  if (!isValidUuid(campaignId)) return [];
  try {
    const { data, error } = await supabase.rpc('admin_list_campaign_assignments', {
      p_campaign_id: campaignId,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[ADMIN_LIST_ASSIGNMENTS_ERROR]', err?.message);
    throw err;
  }
}

export async function createOperatorAssignment({
  campaignId,
  operatorId,
  groupId = null,
  zoneId = null,
  startsAt = null,
  endsAt = null,
  metadata = {},
  notes = null,
}) {
  if (!supabase) throw new Error('Supabase non configurato.');
  if (!isValidUuid(campaignId)) throw new Error('campaign_id non valido.');
  if (!isValidUuid(operatorId)) throw new Error('operator_id non valido.');

  const { data, error } = await supabase.rpc('admin_create_operator_assignment', {
    p_campaign_id: campaignId,
    p_operator_id: operatorId,
    p_group_id:    groupId   || null,
    p_zone_id:     zoneId    || null,
    p_starts_at:   startsAt  || null,
    p_ends_at:     endsAt    || null,
    p_metadata:    metadata  || {},
    p_notes:       notes     || null,
  });

  if (error) {
    console.error('[ADMIN_CREATE_ASSIGNMENT_ERROR]', error?.message);
    throw error;
  }

  return data;
}

export async function updateOperatorAssignment(id, patch) {
  if (!supabase) throw new Error('Supabase non configurato.');
  if (!isValidUuid(id)) throw new Error('id assegnazione non valido.');

  const { data, error } = await supabase.rpc('admin_update_operator_assignment', {
    p_id:    id,
    p_patch: patch,
  });

  if (error) {
    console.error('[ADMIN_UPDATE_ASSIGNMENT_ERROR]', error?.message);
    throw error;
  }

  return data;
}

export async function revokeOperatorAssignment(id) {
  if (!supabase) throw new Error('Supabase non configurato.');
  if (!isValidUuid(id)) throw new Error('id assegnazione non valido.');

  const { data, error } = await supabase.rpc('admin_revoke_operator_assignment', {
    p_id: id,
  });

  if (error) {
    console.error('[ADMIN_REVOKE_ASSIGNMENT_ERROR]', error?.message);
    throw error;
  }

  return data;
}

export async function listAssignmentZones(assignmentId) {
  if (!supabase) return [];
  if (!isValidUuid(assignmentId)) return [];
  try {
    const { data, error } = await supabase.rpc('list_assignment_zones', {
      p_assignment_id: assignmentId,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[LIST_ASSIGNMENT_ZONES_ERROR]', err?.message);
    return [];
  }
}

export async function setAssignmentZones(assignmentId, zones) {
  if (!supabase) throw new Error('Supabase non configurato.');
  if (!isValidUuid(assignmentId)) throw new Error('assignment_id non valido.');

  const { data, error } = await supabase.rpc('admin_set_assignment_zones', {
    p_assignment_id: assignmentId,
    p_zones: zones || [],
  });

  if (error) {
    console.error('[ADMIN_SET_ASSIGNMENT_ZONES_ERROR]', error?.message);
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function getOperatorAssignment(id) {
  if (!supabase) return null;
  if (!isValidUuid(id)) return null;
  try {
    const { data, error } = await supabase
      .from('operator_assignments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    console.error('[ADMIN_GET_ASSIGNMENT_ERROR]', err?.message);
    return null;
  }
}

export async function logAssignmentEvent(assignmentId, action) {
  if (!supabase) throw new Error('Supabase non configurato.');
  if (!isValidUuid(assignmentId)) throw new Error('assignment_id non valido.');
  await ensureSupabaseSessionBridge();
  const { error } = await supabase.rpc('log_assignment_event', {
    p_assignment_id: assignmentId,
    p_action: action,
  });
  if (error) {
    console.error('[LOG_ASSIGNMENT_EVENT_ERROR]', error?.message);
    throw error;
  }
}

// accessToken (opzionale, retro-compatibile): il segreto per-assignment
// (operator_assignments.access_token, vedi migrazione
// 20260816160000_driver_gps_access_token.sql) che autorizza le scritture
// Driver (conferma, Start GPS, punti, cambio/fine zona) senza login. Se
// omesso il link resta identico a prima (nessuna query string) — usato dai
// punti dove il chiamante non ha ancora accesso alla riga assignment
// completa; il flusso di creazione/invio in AssignWork.jsx lo passa sempre,
// perche' admin_create_operator_assignment ritorna gia' l'intera riga
// (incluso access_token, colonna aggiunta dalla stessa migrazione).
export function generateDriverAssignmentLink(assignmentId, accessToken = null) {
  if (!assignmentId) return '';
  const base = `${getPublicAppUrl()}/driver/assignment/${assignmentId}`;
  return accessToken ? `${base}?access=${encodeURIComponent(accessToken)}` : base;
}

// DRIVER GROUP ACCESS — link operativo di gruppo. Diverso dal link personale
// e dal link di MONITORAGGIO gruppo (groupShareUrl): questo, aperto da ogni
// dispositivo, crea via driver_group_join una identita'/sessione personale
// separata. Il token e' quello raw restituito UNA volta da
// admin_create_group_access_link.
export function generateDriverGroupLink(groupToken) {
  if (!groupToken) return '';
  return `${getPublicAppUrl()}/driver/group/${encodeURIComponent(groupToken)}`;
}

// Genera (rigenera) il group access link per (campaign, group). Ritorna il
// token RAW una sola volta.
export async function adminCreateGroupAccessLink(campaignId, groupId, { maxParticipants = null, expiresAt = null } = {}) {
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc('admin_create_group_access_link', {
    p_campaign_id: campaignId,
    p_group_id: groupId,
    p_max_participants: maxParticipants,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  return data;
}

export async function adminRevokeGroupAccessLink(linkId) {
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc('admin_revoke_group_access_link', { p_id: linkId });
  if (error) throw error;
  return data;
}

// Stato del link attivo (senza token). { exists, id, status, participants, max_participants, expires_at }
export async function adminGetGroupAccessLink(campaignId, groupId) {
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc('admin_get_group_access_link', {
    p_campaign_id: campaignId,
    p_group_id: groupId,
  });
  if (error) throw error;
  return data;
}

export function buildDriverWhatsAppMessage({ operatorName, groupName = null, campaignTitle, date, startTime = null, comuni, zone, programRows = null, qty, total, link, mapLink = null }) {
  const nomeDisplay = operatorName || 'Operatore';
  const comuniText = (comuni || []).length ? comuni.join(', ') : 'Da definire';
  const zoneText = (zone || []).length ? zone.join(', ') : 'Da definire';
  const qtyText = qty ? `${Number(qty).toLocaleString('it-IT')} volantini` : 'Quantita da definire';
  const totalText = total || qtyText;
  const dateText = date || 'Da definire';
  const titleText = campaignTitle || 'Campagna VolantiniPro';

  if (Array.isArray(programRows) && programRows.length > 0) {
    const rows = programRows.map((row, index) => `${index + 1}. ${row.name || 'Zona'} — ${row.quantity ? `${Number(row.quantity).toLocaleString('it-IT')} volantini` : 'quantita da definire'}`).join('\n');
    const mapSection = mapLink ? `\nApri mappa:\n${mapLink}\n` : '';
    return `Programma di lavoro — ${groupName || nomeDisplay}

Campagna: ${titleText}

${rows}

Totale: ${qtyText}
Data: ${dateText}
Inizio: ${startTime || 'Da definire'}

Apri programma:
${link || 'Link non disponibile'}
${mapSection}
Conferma la presa in carico dal programma.`;
  }

  return `Ciao ${nomeDisplay},

ti e' stato assegnato questo lavoro:

Campagna: ${titleText}
Data: ${dateText}
Comuni: ${comuniText}
Ordine: ${zoneText}
Quantita: ${qtyText}
Totale: ${totalText}

Apri il link per vedere il lavoro e avviare il GPS:
${link}

Dopo aver aperto il programma, conferma la presa in carico.

Quando inizi, premi "Inizia tracciamento".`;
}

export async function getDailyOperations(dateStr) {
  await ensureSupabaseSessionBridge();
  // P0 ROOT CAUSE (audit "Chi lavora oggi" mostra assignment vecchi): i
  // limiti giorno venivano costruiti con `new Date(dateStr)` (parse come
  // UTC mezzanotte) seguito da `.setHours(0,0,0,0)` (mutazione in ORARIO
  // LOCALE) — un doppio giro UTC->locale che puo' spostare il confine del
  // giorno di alcune ore rispetto a Europe/Rome reale. Riusato invece
  // l'helper condiviso `localDayBounds` (stesso identico usato poco sotto
  // da getDailyOperationsReport nello stesso file): costruisce la
  // mezzanotte locale direttamente dai componenti anno/mese/giorno, senza
  // il round-trip che causava lo shift.
  const { start: todayStart, endExclusive: todayEndExclusive } = localDayBounds(dateStr);
  const todayEnd = new Date(todayEndExclusive.getTime() - 1);

  // 1. Fetch assignments attivi (TODAY SOURCE OF TRUTH: nessun campo
  // work_date/scheduled_date dedicato esiste sullo schema reale — starts_at/
  // ends_at di operator_assignments sono gli unici campi data operativa
  // disponibili, confermati in un audit precedente di questa sessione).
  const { data: assignments, error: assignErr } = await supabase
    .from('operator_assignments')
    .select(`
      id,
      operator_id,
      campaign_id,
      group_id,
      status,
      starts_at,
      ends_at,
      access_token,
      operator_profiles ( user_id, display_name ),
      operational_groups ( name ),
      campaigns ( title ),
      operator_assignment_zones (
        id,
        quantity,
        municipality_name,
        campaign_zones ( id, priority, status, quantity_assigned )
      )
    `)
    .eq('status', 'active');

  if (assignErr) throw assignErr;

  const allAssignments = assignments || [];
  if (allAssignments.length === 0) return [];

  // 2. Fetch sessioni per la giornata (SESSION DATE FIELD = created_at,
  // invariato dalla versione precedente: un cambio a started_at
  // richiederebbe verifica dal vivo sui dati reali, non disponibile in
  // questa sessione — nessuna modifica non verificata).
  const { data: sessions, error: sessErr } = await supabase
    .from('delivery_sessions')
    .select(`
      id,
      campaign_id,
      driver_id,
      assignment_id,
      group_id,
      status,
      started_at,
      created_at
    `)
    .gte('created_at', todayStart.toISOString())
    .lt('created_at', todayEndExclusive.toISOString());

  // La telemetria e' accessoria alla centrale operativa: un errore nella
  // query GPS non deve nascondere assegnazioni ed eventi sent/opened.
  const dailySessions = sessErr ? [] : (sessions || []);

  // P0 ROOT CAUSE: la vecchia regola era `s <= endOfDay && (!e || e >=
  // startOfDay)` — con ends_at nullo (`!e`), la condizione era SEMPRE vera
  // indipendentemente da quanto vecchio fosse starts_at: un assignment
  // creato mesi fa e mai chiuso restava "di oggi" per sempre. Root cause
  // esatta di Fabio/Schazad/Michele. Nuova regola (ticket, unione A/B/C):
  //   A) la finestra starts_at..effectiveEnd copre davvero oggi — ends_at
  //      nullo ora significa "programma di un solo giorno" (effectiveEnd =
  //      starts_at), MAI "aperto all'infinito";
  //   oppure
  //   B/C) esiste almeno una sessione operativa reale di oggi per questo
  //      assignment (iniziata/attiva/completata oggi), anche se la
  //      finestra nominale dell'assignment non combacia esattamente.
  // Nessun assignment storico viene toccato/cancellato: continua a esistere
  // per storico/gruppi/campagne/GPS/report, semplicemente non compare più
  // in "Oggi" se la sua data operativa reale non è oggi.
  const hasTodaySession = (assignmentId, operatorId, campaignId) =>
    dailySessions.some((s) => (s.assignment_id ? s.assignment_id === assignmentId : (s.driver_id === operatorId && s.campaign_id === campaignId)));

  const validAssignments = allAssignments.filter((a) => {
    const s = new Date(a.starts_at);
    const effectiveEnd = a.ends_at ? new Date(a.ends_at) : s;
    const windowCoversToday = s <= todayEnd && effectiveEnd >= todayStart;
    return windowCoversToday || hasTodaySession(a.id, a.operator_id, a.campaign_id);
  });

  if (validAssignments.length === 0) return [];

  // 3. Fetch GPS data for these sessions (gia' scoped a dailySessions di
  // oggi, MAI l'intera tabella storica — confermato dall'audit performance).
  let gpsPoints = [];
  if (dailySessions.length > 0) {
    const sessionIds = dailySessions.map(s => s.id);
    const { data: points } = await supabase
      .from('gps_tracking_points')
      .select('session_id, recorded_at')
      .in('session_id', sessionIds)
      .order('recorded_at', { ascending: false });
    if (points) gpsPoints = points;
  }

  // 4. Fetch proof photos (gia' scoped a dailySessions di oggi).
  let photoCountMap = {};
  if (dailySessions.length > 0) {
    const sessionIds = dailySessions.map(s => s.id);
    const { data: photos } = await supabase
      .from('proof_photos')
      .select('session_id')
      .in('session_id', sessionIds);
    if (photos) {
      photos.forEach(p => {
        photoCountMap[p.session_id] = (photoCountMap[p.session_id] || 0) + 1;
      });
    }
  }

  // 5. Fetch audit logs (sent/opened) — gia' scoped a validAssignments di oggi.
  let assignmentLogs = [];
  if (validAssignments.length > 0) {
    const assignmentIds = validAssignments.map(a => a.id);
    const { data: logs, error: logsError } = await supabase
      .from('assignment_event_log')
      .select('assignment_id, event_type, created_at')
      .in('assignment_id', assignmentIds)
      .in('event_type', ['assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed'])
      .order('created_at', { ascending: false });
    if (!logsError && logs) assignmentLogs = logs;
  }

  return validAssignments.map(assignment => {
    // Sessioni del driver
    const driverSessions = dailySessions.filter(s => s.assignment_id ? s.assignment_id === assignment.id : s.driver_id === assignment.operator_id && s.campaign_id === assignment.campaign_id);

    // Ultimo ping GPS
    const driverPoints = gpsPoints.filter(p => driverSessions.some(s => s.id === p.session_id));
    const lastPing = driverPoints.length > 0 ? driverPoints[0].recorded_at : null;
    const startedSessionIds = new Set(driverSessions.filter(s => s.status === 'started').map(s => s.id));
    const activeSessionLastPing = gpsPoints.find(p => startedSessionIds.has(p.session_id))?.recorded_at || null;

    // Foto totali
    const photosCount = driverSessions.reduce((acc, s) => acc + (photoCountMap[s.id] || 0), 0);

    // Logs invio/apertura
    const driverLogs = assignmentLogs.filter(l => l.assignment_id === assignment.id);
    const sentLog = driverLogs.find(l => l.event_type === 'assignment_program_sent');
    const openedLog = sentLog
      ? driverLogs.find(l => l.event_type === 'assignment_program_opened' && l.created_at >= sentLog.created_at)
      : null;
    const confirmedLog = driverLogs.find(l => l.event_type === 'assignment_program_confirmed');

    const operation = {
      ...assignment,
      zones: (assignment.operator_assignment_zones || []).map(row => ({
        id: row.id,
        name: row.municipality_name,
        quantity: row.quantity ?? row.campaign_zones?.quantity_assigned ?? null,
        priority: row.campaign_zones?.priority ?? null,
        status: row.campaign_zones?.status || 'Da iniziare',
      })),
      sessions: driverSessions,
      lastPing,
      activeSessionLastPing,
      photosCount,
      logs: driverLogs,
      programSentAt: sentLog ? sentLog.created_at : null,
      programOpenedAt: openedLog ? openedLog.created_at : null,
      programConfirmedAt: confirmedLog ? confirmedLog.created_at : null
    };
    operation.alerts = deriveOperationAlerts(operation);
    return operation;
  });
}

async function getDailyTelemetryBySession(sessionIds) {
  if (sessionIds.length === 0) return {};
  const { data: aggregateRows, error: aggregateError } = await supabase.rpc('admin_daily_report_telemetry', {
    p_session_ids: sessionIds,
  });
  if (!aggregateError) {
    return Object.fromEntries((aggregateRows || []).map(row => [row.session_id, row]));
  }

  // Compatibilita' locale prima dell'applicazione della migration: carica
  // soltanto chiavi e timestamp necessari, mai coordinate o payload foto.
  const [gpsResult, photoResult] = await Promise.all([
    supabase.from('gps_tracking_points').select('session_id, recorded_at').in('session_id', sessionIds),
    supabase.from('proof_photos').select('session_id').in('session_id', sessionIds),
  ]);
  const telemetry = Object.fromEntries(sessionIds.map(id => [id, {
    session_id: id, gps_count: 0, first_gps_at: null, last_gps_at: null, photo_count: 0,
  }]));
  if (!gpsResult.error) (gpsResult.data || []).forEach(point => {
    const item = telemetry[point.session_id];
    if (!item) return;
    item.gps_count += 1;
    if (!item.first_gps_at || point.recorded_at < item.first_gps_at) item.first_gps_at = point.recorded_at;
    if (!item.last_gps_at || point.recorded_at > item.last_gps_at) item.last_gps_at = point.recorded_at;
  });
  if (!photoResult.error) (photoResult.data || []).forEach(photo => {
    if (telemetry[photo.session_id]) telemetry[photo.session_id].photo_count += 1;
  });
  return telemetry;
}

export async function getDailyOperationsReport(dateStr, { now = new Date() } = {}) {
  await ensureSupabaseSessionBridge();
  const { start, endExclusive, startIso, endExclusiveIso } = localDayBounds(dateStr);
  const { data: assignments, error: assignmentsError } = await supabase
    .from('operator_assignments')
    .select(`
      id,
      operator_id,
      campaign_id,
      group_id,
      status,
      starts_at,
      ends_at,
      revoked_at,
      operator_profiles ( user_id, display_name ),
      campaigns ( title ),
      operator_assignment_zones (
        id,
        zone_id,
        quantity,
        municipality_name,
        campaign_zones ( id, priority, status, quantity_assigned )
      )
    `);
  if (assignmentsError) throw assignmentsError;

  const dailyAssignments = (assignments || []).filter(assignment => {
    const startsAt = Date.parse(assignment.starts_at || '');
    const endsAt = Date.parse(assignment.ends_at || '');
    return Number.isFinite(startsAt)
      && startsAt < endExclusive.getTime()
      && (!Number.isFinite(endsAt) || endsAt >= start.getTime());
  });
  if (dailyAssignments.length === 0) return buildDailyOperationsReport([], { date: dateStr, now });

  const assignmentIds = dailyAssignments.map(assignment => assignment.id);
  const { data: sessions, error: sessionsError } = await supabase
    .from('delivery_sessions')
    .select('id, campaign_id, driver_id, assignment_id, campaign_zone_id, group_id, status, started_at, paused_at, ended_at, created_at, updated_at')
    .gte('created_at', startIso)
    .lt('created_at', endExclusiveIso);
  if (sessionsError) throw sessionsError;
  const dailySessions = (sessions || []).filter(session => assignmentIds.includes(session.assignment_id)
    || dailyAssignments.some(assignment => !session.assignment_id
      && session.driver_id === assignment.operator_id
      && session.campaign_id === assignment.campaign_id));

  const [{ data: logs, error: logsError }, telemetryBySession] = await Promise.all([
    supabase
      .from('assignment_event_log')
      .select('assignment_id, event_type, created_at')
      .in('assignment_id', assignmentIds)
      .in('event_type', ['assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed'])
      .gte('created_at', startIso)
      .lt('created_at', endExclusiveIso)
      .order('created_at', { ascending: true }),
    getDailyTelemetryBySession(dailySessions.map(session => session.id)),
  ]);
  const dailyLogs = logsError ? [] : (logs || []);
  const alertNow = new Date(Math.min(now instanceof Date ? now.getTime() : Date.parse(now), endExclusive.getTime() - 1));
  const hydrated = dailyAssignments.map(assignment => {
    const assignmentSessions = dailySessions.filter(session => session.assignment_id
      ? session.assignment_id === assignment.id
      : session.driver_id === assignment.operator_id && session.campaign_id === assignment.campaign_id);
    const assignmentLogs = dailyLogs.filter(log => log.assignment_id === assignment.id);
    const zones = (assignment.operator_assignment_zones || []).map(row => ({
      id: row.id,
      name: row.municipality_name,
      quantity: row.quantity ?? row.campaign_zones?.quantity_assigned ?? null,
      priority: row.campaign_zones?.priority ?? null,
      status: row.campaign_zones?.status || 'Da iniziare',
    }));
    const activeIds = new Set(assignmentSessions.filter(session => session.status === 'started').map(session => session.id));
    const activeSessionLastPing = assignmentSessions
      .filter(session => activeIds.has(session.id))
      .map(session => telemetryBySession[session.id]?.last_gps_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const eventTime = type => assignmentLogs.find(log => log.event_type === type)?.created_at || null;
    const operation = {
      ...assignment,
      zones,
      sessions: assignmentSessions,
      logs: assignmentLogs,
      activeSessionLastPing,
      programSentAt: eventTime('assignment_program_sent'),
      programOpenedAt: eventTime('assignment_program_opened'),
      programConfirmedAt: eventTime('assignment_program_confirmed'),
    };
    operation.alerts = deriveOperationAlerts(operation, { now: alertNow });
    return operation;
  });
  return buildDailyOperationsReport(hydrated, { date: dateStr, telemetryBySession, now });
}
