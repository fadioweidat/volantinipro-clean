const STARTED_ZONE_STATUSES = new Set(['In corso', 'In pausa', 'Completata', 'Bloccata', 'Parziale']);
const CLOSED_SESSION_STATUSES = new Set(['completed', 'cancelled']);

const asTime = value => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
};

const firstIso = values => values.filter(Boolean).sort()[0] || null;
const lastIso = values => values.filter(Boolean).sort().at(-1) || null;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function localDayBounds(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new TypeError('La data deve essere nel formato YYYY-MM-DD');
  const [, year, month, day] = match;
  const start = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  const endExclusive = new Date(Number(year), Number(month) - 1, Number(day) + 1, 0, 0, 0, 0);
  return { start, endExclusive, startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() };
}

export function deriveDailyDriverStatus(zones = [], { dayClosed = true } = {}) {
  const statuses = zones.map(zone => zone?.status || zone?.campaign_zones?.status || 'Da iniziare');
  if (statuses.length > 0 && statuses.every(status => status === 'Completata')) return 'COMPLETATO';
  if (statuses.includes('Bloccata')) return 'PROBLEMA';
  if (statuses.includes('In corso') || statuses.includes('In pausa')) return 'IN CORSO';
  if (statuses.includes('Parziale')) return 'PARZIALE';
  if (!statuses.some(status => STARTED_ZONE_STATUSES.has(status))) return 'NON INIZIATO';
  if (dayClosed && statuses.includes('Completata') && statuses.some(status => status !== 'Completata')) return 'PARZIALE';
  return statuses.some(status => status === 'Completata') ? 'IN CORSO' : 'NON INIZIATO';
}

export function sessionDurationMs(session, { now = new Date(), dayEnd = null } = {}) {
  const start = asTime(session?.started_at || session?.created_at);
  if (start == null) return 0;
  let end = null;
  if (session?.status === 'paused') end = asTime(session.paused_at || session.updated_at);
  if (CLOSED_SESSION_STATUSES.has(session?.status)) end = asTime(session.ended_at || session.paused_at || session.updated_at);
  if (session?.status === 'started') {
    const nowMs = now instanceof Date ? now.getTime() : asTime(now);
    const dayEndMs = dayEnd instanceof Date ? dayEnd.getTime() : asTime(dayEnd);
    end = dayEndMs == null ? nowMs : Math.min(nowMs, dayEndMs);
  }
  return end == null ? 0 : Math.max(0, end - start);
}

export function formatDuration(durationMs) {
  const totalMinutes = Math.floor(Math.max(0, durationMs) / 60000);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}

export function buildAssignmentTimeline({ logs = [], sessions = [] } = {}) {
  const labelByType = {
    assignment_program_sent: 'Programma inviato',
    assignment_program_opened: 'Programma aperto',
    assignment_program_confirmed: 'Presa in carico confermata',
  };
  const events = logs
    .filter(log => labelByType[log.event_type] && log.created_at)
    .map(log => ({ type: log.event_type, at: log.created_at, label: labelByType[log.event_type] }));
  const firstStart = firstIso(sessions.map(session => session.started_at));
  const lastEnd = lastIso(sessions.map(session => session.ended_at || (session.status === 'paused' ? session.paused_at : null)));
  if (firstStart) events.push({ type: 'work_started', at: firstStart, label: 'Lavoro iniziato' });
  if (lastEnd) events.push({ type: 'last_session_closed', at: lastEnd, label: 'Ultima sessione completata' });
  return events.sort((a, b) => asTime(a.at) - asTime(b.at));
}

function normalizeZones(assignment) {
  return (assignment.operator_assignment_zones || assignment.zones || []).map(row => ({
    id: row.id,
    campaignZoneId: row.zone_id || row.campaignZoneId || row.campaign_zones?.id || null,
    name: row.municipality_name || row.name || 'Comune non disponibile',
    quantityAssigned: number(row.quantity ?? row.quantityAssigned ?? row.campaign_zones?.quantity_assigned),
    status: row.status || row.campaign_zones?.status || 'Da iniziare',
    priority: number(row.priority ?? row.campaign_zones?.priority ?? 999),
  })).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'it'));
}

export function buildDailyOperationsReport(assignments = [], {
  date,
  telemetryBySession = {},
  now = new Date(),
  dayClosed,
} = {}) {
  const { endExclusive } = localDayBounds(date);
  const isClosed = dayClosed ?? endExclusive.getTime() <= (now instanceof Date ? now.getTime() : asTime(now));
  const drivers = assignments.map(assignment => {
    const zones = normalizeZones(assignment);
    const sessions = assignment.sessions || [];
    const telemetry = sessions.map(session => telemetryBySession[session.id] || {});
    const photoByZone = {};
    sessions.forEach((session, index) => {
      const zoneId = session.campaign_zone_id || 'unassigned';
      photoByZone[zoneId] = (photoByZone[zoneId] || 0) + number(telemetry[index].photo_count);
    });
    const sessionCounts = { total: sessions.length, completed: 0, active: 0, cancelled: 0, paused: 0 };
    sessions.forEach(session => {
      if (session.status === 'completed') sessionCounts.completed += 1;
      if (session.status === 'started') sessionCounts.active += 1;
      if (session.status === 'cancelled') sessionCounts.cancelled += 1;
      if (session.status === 'paused') sessionCounts.paused += 1;
    });
    const durationMs = sessions.reduce((sum, session) => sum + sessionDurationMs(session, { now, dayEnd: endExclusive }), 0);
    const status = deriveDailyDriverStatus(zones, { dayClosed: isClosed });
    const timeline = buildAssignmentTimeline(assignment);
    const programEvent = type => timeline.find(event => event.type === type)?.at || null;
    return {
      id: assignment.id,
      operatorId: assignment.operator_id,
      driverName: assignment.operator_profiles?.display_name || assignment.driverName || 'Driver non disponibile',
      campaignId: assignment.campaign_id,
      campaignName: assignment.campaigns?.title || assignment.campaignName || 'Campagna non disponibile',
      status,
      zones: zones.map(zone => ({ ...zone, photoCount: photoByZone[zone.campaignZoneId || 'unassigned'] || 0 })),
      quantityAssigned: zones.reduce((sum, zone) => sum + zone.quantityAssigned, 0),
      sessions,
      sessionCounts,
      firstSessionStart: firstIso(sessions.map(session => session.started_at)),
      lastSessionEnd: lastIso(sessions.map(session => session.ended_at || (session.status === 'paused' ? session.paused_at : null))),
      durationMs,
      durationLabel: formatDuration(durationMs),
      gpsPointCount: telemetry.reduce((sum, item) => sum + number(item.gps_count), 0),
      firstGpsAt: firstIso(telemetry.map(item => item.first_gps_at)),
      lastGpsAt: lastIso(telemetry.map(item => item.last_gps_at)),
      photoCount: telemetry.reduce((sum, item) => sum + number(item.photo_count), 0),
      alerts: assignment.alerts || [],
      timeline,
      programSentAt: programEvent('assignment_program_sent'),
      programOpenedAt: programEvent('assignment_program_opened'),
      programConfirmedAt: programEvent('assignment_program_confirmed'),
    };
  });

  const zones = drivers.flatMap(driver => driver.zones);
  const driverGroups = new Map();
  drivers.forEach(driver => {
    const key = driver.operatorId || driver.id;
    const group = driverGroups.get(key) || [];
    group.push(driver);
    driverGroups.set(key, group);
  });
  const kpis = {
    driversScheduled: driverGroups.size,
    driversStarted: [...driverGroups.values()].filter(items => items.some(driver => driver.sessions.some(session => Boolean(session.started_at)))).length,
    driversCompleted: [...driverGroups.values()].filter(items => items.length > 0 && items.every(driver => driver.status === 'COMPLETATO')).length,
    municipalitiesAssigned: zones.length,
    municipalitiesCompleted: zones.filter(zone => zone.status === 'Completata').length,
    municipalitiesPartial: zones.filter(zone => zone.status === 'Parziale').length,
    municipalitiesBlocked: zones.filter(zone => zone.status === 'Bloccata').length,
    quantityAssigned: drivers.reduce((sum, driver) => sum + driver.quantityAssigned, 0),
    zonesCompleted: zones.filter(zone => zone.status === 'Completata').length,
    zonesAssigned: zones.length,
    photos: drivers.reduce((sum, driver) => sum + driver.photoCount, 0),
    gpsSessions: drivers.reduce((sum, driver) => sum + driver.sessionCounts.total, 0),
    alerts: drivers.reduce((sum, driver) => sum + driver.alerts.length, 0),
  };

  const campaignMap = new Map();
  drivers.forEach(driver => {
    const item = campaignMap.get(driver.campaignId) || { id: driver.campaignId, name: driver.campaignName, driverIds: new Set(), municipalities: 0, quantityAssigned: 0 };
    item.driverIds.add(driver.operatorId);
    item.municipalities += driver.zones.length;
    item.quantityAssigned += driver.quantityAssigned;
    campaignMap.set(driver.campaignId, item);
  });
  const campaigns = [...campaignMap.values()].map(item => ({ ...item, drivers: item.driverIds.size, driverIds: undefined }));
  return { date, drivers, kpis, campaigns };
}

const CSV_COLUMNS = [
  'date', 'campaign', 'driver', 'municipality', 'quantity_assigned', 'zone_status',
  'first_session_start', 'last_session_end', 'session_count', 'gps_point_count',
  'photo_count', 'program_sent_at', 'program_opened_at', 'program_confirmed_at',
];

const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function dailyOperationsReportCsv(report) {
  const rows = report.drivers.flatMap(driver => driver.zones.map(zone => [
    report.date, driver.campaignName, driver.driverName, zone.name, zone.quantityAssigned, zone.status,
    driver.firstSessionStart, driver.lastSessionEnd, driver.sessionCounts.total, driver.gpsPointCount,
    zone.photoCount, driver.programSentAt, driver.programOpenedAt, driver.programConfirmedAt,
  ]));
  return `\uFEFF${[CSV_COLUMNS, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`;
}
