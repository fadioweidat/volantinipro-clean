const COMPLETE = new Set(['completata', 'completed', 'complete', 'chiusa']);
const PARTIAL = new Set(['parziale', 'partial', 'bloccata', 'blocked']);
const ACTIVE = new Set(['in corso', 'started', 'in_progress', 'in pausa', 'paused']);

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function timestamp(value) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

function first(values) {
  return values.filter(Boolean).sort((a, b) => timestamp(a) - timestamp(b))[0] || null;
}

function last(values) {
  return values.filter(Boolean).sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
}

export function clientZoneStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (COMPLETE.has(status)) return 'Completata';
  if (PARTIAL.has(status)) return 'Parziale';
  if (ACTIVE.has(status)) return status.includes('pausa') || status === 'paused' ? 'In pausa' : 'In corso';
  return 'Da iniziare';
}

function reportStatus(zones, sessions) {
  if (zones.length && zones.every((zone) => zone.status === 'Completata')) return 'Completata';
  if (zones.some((zone) => zone.status === 'Parziale')) return 'Parziale';
  if (zones.some((zone) => zone.status === 'In corso' || zone.status === 'In pausa')) return 'In corso';
  if (sessions.some((session) => String(session.status).toLowerCase() === 'completed')) return 'Parziale';
  if (sessions.length) return 'In corso';
  return 'Programmata';
}

function sessionDuration(session) {
  const start = timestamp(session.started_at);
  const end = timestamp(session.ended_at || session.paused_at);
  return start != null && end != null && end >= start ? end - start : 0;
}

function zoneQuantity(zone, assignmentRows) {
  const canonical = numberOrZero(zone.quantity_assigned ?? zone.assigned_flyers);
  if (canonical) return canonical;
  return assignmentRows
    .filter((row) => row.zone_id === zone.id)
    .reduce((total, row) => total + numberOrZero(row.quantity), 0);
}

function zoneLabel(zone) {
  return zone.municipality_name || zone.zone_name || zone.zone_label || zone.address_label || 'Zona operativa';
}

export function buildFinalDistributionReport({
  campaign = {}, zones = [], assignmentZones = [], sessions = [], telemetry = [], photos = [], generatedAt = new Date().toISOString(),
} = {}) {
  const telemetryBySession = new Map(telemetry.map((row) => [row.session_id, row]));
  const sessionsByZone = new Map();
  sessions.forEach((session) => {
    const zoneId = session.campaign_zone_id || null;
    if (!sessionsByZone.has(zoneId)) sessionsByZone.set(zoneId, []);
    sessionsByZone.get(zoneId).push({ ...session, ...(telemetryBySession.get(session.id) || {}) });
  });
  const photoBySession = new Map();
  const knownSessionIds = new Set(sessions.map((session) => session.id));
  const associatedPhotos = photos.filter((photo) => knownSessionIds.has(photo.session_id));
  associatedPhotos.forEach((photo) => {
    if (!photoBySession.has(photo.session_id)) photoBySession.set(photo.session_id, []);
    photoBySession.get(photo.session_id).push(photo);
  });

  const safeZones = zones.map((zone) => {
    const zoneSessions = sessionsByZone.get(zone.id) || [];
    const zonePhotos = zoneSessions.flatMap((session) => photoBySession.get(session.id) || []);
    const gpsCount = zoneSessions.reduce((sum, session) => sum + numberOrZero(session.gps_count), 0);
    return {
      name: zoneLabel(zone),
      municipality: zone.municipality_name || zoneLabel(zone),
      quantityAssigned: zoneQuantity(zone, assignmentZones),
      status: clientZoneStatus(zone.status),
      sessionCount: zoneSessions.length,
      gpsCount,
      firstActivityAt: first(zoneSessions.flatMap((session) => [session.started_at, session.first_gps_at])),
      lastActivityAt: last(zoneSessions.flatMap((session) => [session.ended_at, session.paused_at, session.last_gps_at])),
      durationMs: zoneSessions.reduce((sum, session) => sum + sessionDuration(session), 0),
      photos: zonePhotos.slice(0, 6).map((photo) => ({
        signedUrl: photo.signedUrl || null,
        takenAt: photo.taken_at || photo.created_at || null,
        approved: Boolean(photo.approved_at),
      })),
      totalPhotoCount: zonePhotos.length,
    };
  });

  const enrichedSessions = sessions.map((session) => ({ ...session, ...(telemetryBySession.get(session.id) || {}) }));
  const status = reportStatus(safeZones, enrichedSessions);
  const totalGpsCount = enrichedSessions.reduce((sum, session) => sum + numberOrZero(session.gps_count), 0);
  const firstStartAt = first(enrichedSessions.flatMap((session) => [session.started_at, session.first_gps_at]));
  const lastClosureAt = last(enrichedSessions.filter((session) => ['completed', 'cancelled'].includes(String(session.status).toLowerCase())).map((session) => session.ended_at));
  const anomalies = [];
  safeZones.forEach((zone) => {
    if (zone.status === 'Parziale') anomalies.push(`${zone.name}: lavorazione parziale.`);
    if (zone.sessionCount > 0 && zone.gpsCount === 0) anomalies.push(`${zone.name}: sessione presente senza rilevazioni GPS.`);
  });
  if (enrichedSessions.some((session) => String(session.status).toLowerCase() === 'cancelled')) anomalies.push('Sono presenti sessioni operative annullate.');

  const timeline = [
    firstStartAt && { label: 'Primo avvio operativo', at: firstStartAt },
    first(enrichedSessions.map((session) => session.first_gps_at)) && { label: 'Prima rilevazione GPS', at: first(enrichedSessions.map((session) => session.first_gps_at)) },
    last(enrichedSessions.map((session) => session.last_gps_at)) && { label: 'Ultima rilevazione GPS', at: last(enrichedSessions.map((session) => session.last_gps_at)) },
    lastClosureAt && { label: 'Ultima chiusura operativa', at: lastClosureAt },
    { label: 'Report generato', at: generatedAt },
  ].filter(Boolean);

  return {
    title: campaign.title || campaign.name || campaign.campaign_name || 'Campagna di distribuzione',
    customerName: campaign.client_name || campaign.customer_name || campaign.company || null,
    periodStart: campaign.start_date || campaign.distribution_start_date || firstStartAt,
    periodEnd: campaign.end_date || campaign.distribution_end_date || lastClosureAt,
    generatedAt,
    status,
    provisional: status !== 'Completata',
    zones: safeZones,
    totals: {
      quantityAssigned: safeZones.reduce((sum, zone) => sum + zone.quantityAssigned, 0),
      zonesCompleted: safeZones.filter((zone) => zone.status === 'Completata').length,
      zonesTotal: safeZones.length,
      sessionCount: enrichedSessions.length,
      gpsCount: totalGpsCount,
      photoCount: associatedPhotos.length,
      firstStartAt,
      lastClosureAt,
      durationMs: enrichedSessions.reduce((sum, session) => sum + sessionDuration(session), 0),
    },
    anomalies,
    timeline,
  };
}
