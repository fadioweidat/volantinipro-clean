export const OPERATION_ALERT_THRESHOLDS = Object.freeze({
  sentNotOpenedMinutes: 15,
  openedNotConfirmedMinutes: 15,
  confirmedNotStartedMinutes: 30,
  gpsStaleMinutes: 10,
});

export const OPERATION_ALERT_SEVERITY_RANK = Object.freeze({ INFO: 1, WARNING: 2, CRITICAL: 3 });

const minuteDiff = (nowMs, iso) => {
  const value = Date.parse(iso || '');
  if (!Number.isFinite(value) || value > nowMs) return null;
  return Math.floor((nowMs - value) / 60000);
};

const isCompletedZone = zone => zone?.status === 'Completata';
const hasStartedWork = assignment => {
  if ((assignment.zones || []).some(zone => zone.status === 'In corso' || isCompletedZone(zone))) return true;
  return (assignment.sessions || []).some(session => Boolean(session.started_at) || ['started', 'paused', 'completed'].includes(session.status));
};

export function deriveOperationAlerts(assignment, { now = new Date(), thresholds = OPERATION_ALERT_THRESHOLDS } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now deve essere una data valida');
  const alerts = [];
  const add = (type, severity, message, extra = {}) => alerts.push({ id: `${assignment.id || 'assignment'}:${type}`, assignmentId: assignment.id, type, severity, message, ...extra });

  const sentMinutes = minuteDiff(nowMs, assignment.programSentAt);
  if (sentMinutes != null && !assignment.programOpenedAt && sentMinutes >= thresholds.sentNotOpenedMinutes) add('SENT_NOT_OPENED', 'INFO', `Programma inviato ma non aperto da ${sentMinutes} min`, { minutes: sentMinutes });

  const openedMinutes = minuteDiff(nowMs, assignment.programOpenedAt);
  if (openedMinutes != null && !assignment.programConfirmedAt && openedMinutes >= thresholds.openedNotConfirmedMinutes) add('OPENED_NOT_CONFIRMED', 'WARNING', `Programma aperto ma non confermato da ${openedMinutes} min`, { minutes: openedMinutes });

  const startsAtMs = Date.parse(assignment.starts_at || '');
  const confirmationMinutes = minuteDiff(nowMs, assignment.programConfirmedAt);
  if (confirmationMinutes != null && (!Number.isFinite(startsAtMs) || startsAtMs <= nowMs) && !hasStartedWork(assignment) && confirmationMinutes >= thresholds.confirmedNotStartedMinutes) add('CONFIRMED_NOT_STARTED', 'WARNING', `Programma confermato ma non iniziato da ${confirmationMinutes} min`, { minutes: confirmationMinutes });

  const blockedZones = (assignment.zones || []).filter(zone => zone.status === 'Bloccata');
  if (blockedZones.length > 0) {
    const zoneNames = blockedZones.map(zone => zone.name).filter(Boolean);
    add('ZONE_BLOCKED', 'CRITICAL', `Zona bloccata${zoneNames.length ? `: ${zoneNames.join(', ')}` : ''}`, { zoneName: zoneNames.join(', ') || null });
  }

  const startedSessions = (assignment.sessions || []).filter(session => session.status === 'started');
  if (startedSessions.length > 0) {
    const latestStart = startedSessions.map(session => session.started_at || session.created_at).filter(Boolean).sort().at(-1);
    const gpsMinutes = minuteDiff(nowMs, assignment.activeSessionLastPing || latestStart);
    if (gpsMinutes != null && gpsMinutes >= thresholds.gpsStaleMinutes) add('GPS_STALE', 'CRITICAL', `GPS non aggiornato da ${gpsMinutes} min`, { minutes: gpsMinutes });
  }

  const endsAtMs = Date.parse(assignment.ends_at || '');
  const zones = assignment.zones || [];
  const completed = assignment.status === 'completed' || (zones.length > 0 && zones.every(isCompletedZone));
  if (Number.isFinite(endsAtMs) && endsAtMs < nowMs && !completed) add('ASSIGNMENT_OVERDUE', 'CRITICAL', 'Programma in ritardo e non completato');

  return alerts.sort((a, b) => OPERATION_ALERT_SEVERITY_RANK[b.severity] - OPERATION_ALERT_SEVERITY_RANK[a.severity]);
}

export function operationAlertPriority(alerts = []) {
  return alerts.reduce((rank, alert) => Math.max(rank, OPERATION_ALERT_SEVERITY_RANK[alert.severity] || 0), 0);
}
