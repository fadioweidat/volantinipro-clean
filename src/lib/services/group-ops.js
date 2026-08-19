import {
  calculateDistanceKm,
  classifyDriverStatus,
  displayDriverName,
  getSessionGroup,
} from './gps-api.js';
import { formatDuration, lastActivityAt, sessionDurationMs, shortId } from './report-utils.js';
import { getPublicAppUrl } from '../publicAppUrl.js';

export function buildGroupRows({ sessions = [], photos = [] }) {
  const enriched = sessions.map((item) => enrichSession(item, photos));
  const byGroup = new Map();

  enriched.forEach((item) => {
    const group = item.group;
    if (!group.id || group.id === 'ungrouped') return;
    if (!byGroup.has(group.id)) {
      byGroup.set(group.id, {
        id: group.id,
        name: group.name,
        lead: findLeadName(item.session) || 'Dato non disponibile',
        sessions: [],
      });
    }
    byGroup.get(group.id).sessions.push(item);
  });

  return Array.from(byGroup.values()).map((group) => summarizeGroup(group, photos));
}

export function enrichSession(item, photos = []) {
  const group = getSessionGroup(item.session);
  const lastPing = lastActivityAt(item.session, item.points);
  const status = classifyDriverStatus(lastPing);
  return {
    ...item,
    group,
    driverName: displayDriverName(item.session),
    lastPing,
    status,
    km: calculateDistanceKm(item.points || []),
    durationMs: sessionDurationMs(item.session),
    photos: photos.filter((photo) => photo.session_id === item.session.id),
    adminOverride: readAdminOverride(item.session),
  };
}

export function summarizeGroup(group, allPhotos = []) {
  const sessions = group.sessions || [];
  const operatorIds = new Set(sessions.map((item) => item.session.driver_id || item.driverName).filter(Boolean));
  const online = sessions.filter((item) => item.status === 'online').length;
  const warning = sessions.filter((item) => item.status === 'warning').length;
  const offline = sessions.filter((item) => item.status === 'offline').length;
  const points = sessions.reduce((sum, item) => sum + (item.points?.length || 0), 0);
  const km = sessions.reduce((sum, item) => sum + item.km, 0);
  const lastPing = sessions.map((item) => item.lastPing).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const groupPhotos = allPhotos.filter((photo) => sessions.some((item) => item.session.id === photo.session_id));
  const problems = sessions.flatMap((item) => detectSessionAlerts(item));
  return {
    ...group,
    operatorCount: operatorIds.size,
    online,
    warning,
    offline,
    lastPing,
    km,
    points,
    photos: groupPhotos.length,
    status: deriveGroupStatus(sessions, problems),
    problems,
  };
}

export function detectSessionAlerts(item) {
  const alerts = [];
  const sessionLabel = `${item.driverName || 'Operatore'} (${shortId(item.session?.id)})`;
  if (!item.points?.length) alerts.push({ level: 'red', label: 'GPS assente', detail: `${sessionLabel}: nessun punto registrato.` });
  if (item.lastPing) {
    const ageMs = Date.now() - new Date(item.lastPing).getTime();
    if (ageMs > 5 * 60000) alerts.push({ level: 'red', label: 'Offline oltre 5 minuti', detail: `${sessionLabel}: ultimo ping ${formatDuration(ageMs)} fa.` });
  } else if (item.session?.started_at) {
    alerts.push({ level: 'red', label: 'Offline oltre 5 minuti', detail: `${sessionLabel}: nessun ping dopo avvio.` });
  }
  if (isStopped(item.points)) alerts.push({ level: 'yellow', label: 'Fermo oltre 10 minuti', detail: `${sessionLabel}: movimento GPS non rilevante negli ultimi punti.` });
  if (item.adminOverride?.status === 'problem') alerts.push({ level: 'red', label: 'Problema admin', detail: item.adminOverride.note || `${sessionLabel}: segnato problema.` });
  return alerts;
}

export function groupShareUrl(campaignId, group) {
  const url = new URL(`/driver/tracking/${campaignId}`, getPublicAppUrl());
  url.searchParams.set('groupId', group.id);
  if (group.name) url.searchParams.set('groupName', group.name);
  return url.toString();
}

function deriveGroupStatus(sessions, problems) {
  if (problems.some((item) => item.level === 'red')) return 'problema';
  if (!sessions.length) return 'fermo';
  if (sessions.every((item) => item.session.status === 'completed')) return 'completato';
  if (sessions.some((item) => ['started', 'paused'].includes(item.session.status))) return 'attivo';
  return 'fermo';
}

function isStopped(points = []) {
  if (points.length < 3) return false;
  const latest = points[points.length - 1];
  const latestAt = new Date(latest.recorded_at || latest.created_at || 0).getTime();
  if (!latestAt || Date.now() - latestAt > 15 * 60000) return false;
  const recent = points.filter((point) => latestAt - new Date(point.recorded_at || point.created_at || 0).getTime() <= 10 * 60000);
  if (recent.length < 3) return false;
  return calculateDistanceKm(recent) < 0.03;
}

function readAdminOverride(session) {
  const metadata = session?.metadata || session?.session_metadata || {};
  const parsed = typeof metadata === 'string' ? safeJson(metadata) : metadata;
  return parsed?.admin_override || {};
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function findLeadName(session) {
  const metadata = typeof session?.metadata === 'string' ? safeJson(session.metadata) : session?.metadata || {};
  return metadata.group_lead || metadata.lead_name || '';
}
