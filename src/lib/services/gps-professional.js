import { calculateDistanceKm, classifyDriverStatus, displayDriverName, getSessionGroup } from './gps-api.js';
import { formatDuration, lastActivityAt, sessionDurationMs } from './report-utils.js';

const ACCURACY_WARNING_METERS = 80;
const STOP_RADIUS_METERS = 18;
const STOP_WINDOW_MINUTES = 12;
const HIGH_SPEED_MPS = 3.2;

export function buildGpsProfessionalSnapshot(rows = [], photos = []) {
  const enriched = rows.map((row) => enrichGpsRow(row));
  const alarms = detectGpsProfessionalAlarms(enriched);
  const timeline = buildGpsTimeline(enriched, photos);
  const heatmap = buildHeatmapCells(enriched.flatMap((row) => row.points));
  const playback = buildPlaybackFrames(enriched);
  const sessions = enriched.map((row) => row.session);
  const online = enriched.filter((row) => row.driverStatus === 'online').length;
  const paused = sessions.filter((session) => session.status === 'paused').length;
  const completed = sessions.filter((session) => session.status === 'completed').length;
  const active = sessions.filter((session) => session.status === 'started').length;
  const offline = enriched.filter((row) => row.driverStatus === 'offline').length;
  const allPoints = enriched.flatMap((row) => row.points);
  const speeds = allPoints.map((point) => Number(point.speed)).filter(Number.isFinite).filter((value) => value >= 0);
  const accuracies = allPoints.map((point) => Number(point.accuracy)).filter(Number.isFinite).filter((value) => value >= 0);
  const totalKm = enriched.reduce((sum, row) => sum + row.km, 0);
  const totalMs = enriched.reduce((sum, row) => sum + row.durationMs, 0);
  const movingMs = estimateMovingMs(enriched);
  const stoppedMs = Math.max(0, totalMs - movingMs);

  return {
    rows: enriched,
    alarms,
    timeline,
    heatmap,
    playback,
    summary: {
      sessions: enriched.length,
      active,
      completed,
      paused,
      online,
      offline,
      points: allPoints.length,
      totalKm,
      totalMs,
      movingMs,
      stoppedMs,
      avgSpeedKmh: speeds.length ? average(speeds) * 3.6 : null,
      maxSpeedKmh: speeds.length ? Math.max(...speeds) * 3.6 : null,
      avgAccuracy: accuracies.length ? average(accuracies) : null,
      coveragePercent: estimateCoveragePercent(totalKm, sessions.length),
      lastUpdate: latestDate([
        ...enriched.map((row) => row.lastPing),
        ...photos.map((photo) => photo.taken_at || photo.created_at),
      ]),
    },
  };
}

export function enrichGpsRow(row) {
  const points = normalizePoints(row.points || []);
  const latest = points[points.length - 1] || null;
  const lastPing = lastActivityAt(row.session, points);
  const group = getSessionGroup(row.session);
  return {
    ...row,
    points,
    latest,
    lastPing,
    driverName: row.driverName || displayDriverName(row.session),
    group,
    groupName: row.groupName || group.name,
    driverStatus: classifyDriverStatus(lastPing),
    km: calculateDistanceKm(points),
    durationMs: sessionDurationMs(row.session),
    avgAccuracy: average(points.map((point) => Number(point.accuracy)).filter(Number.isFinite)),
    maxSpeedKmh: maxOrNull(points.map((point) => Number(point.speed)).filter(Number.isFinite).map((value) => value * 3.6)),
  };
}

export function detectGpsProfessionalAlarms(rows = []) {
  const alarms = [];
  rows.forEach((row) => {
    const sessionId = shortId(row.session?.id);
    const driver = row.driverName || 'Operatore';
    if (!row.points.length && ['started', 'paused'].includes(row.session?.status)) {
      alarms.push({ level: 'red', type: 'gps_missing', title: 'GPS assente', detail: `${driver} (${sessionId}) non ha punti GPS registrati.`, at: row.session?.started_at || row.session?.created_at });
    }
    if (row.driverStatus === 'offline' && row.session?.status === 'started') {
      alarms.push({ level: 'red', type: 'device_offline', title: 'Dispositivo offline', detail: `${driver} (${sessionId}) non invia aggiornamenti recenti.`, at: row.lastPing });
    }
    row.points.forEach((point) => {
      const accuracy = Number(point.accuracy);
      if (Number.isFinite(accuracy) && accuracy > ACCURACY_WARNING_METERS) {
        alarms.push({ level: 'yellow', type: 'low_accuracy', title: 'Precisione insufficiente', detail: `${driver}: accuracy ${Math.round(accuracy)} m.`, at: point.recorded_at || point.created_at });
      }
      const speed = Number(point.speed);
      if (Number.isFinite(speed) && speed > HIGH_SPEED_MPS) {
        alarms.push({ level: 'yellow', type: 'high_speed', title: 'Velocita anomala', detail: `${driver}: ${Math.round(speed * 3.6)} km/h.`, at: point.recorded_at || point.created_at });
      }
    });
    const stop = detectStop(row.points);
    if (stop) {
      alarms.push({ level: 'yellow', type: 'long_stop', title: 'Operatore fermo', detail: `${driver}: sosta oltre ${STOP_WINDOW_MINUTES} minuti.`, at: stop.at });
    }
  });
  return alarms.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 80);
}

export function buildGpsTimeline(rows = [], photos = []) {
  return [
    ...rows.flatMap((row) => [
      { type: 'start', at: row.session?.started_at, label: 'Partenza', detail: row.driverName },
      { type: 'pause', at: row.session?.paused_at, label: 'Pausa', detail: row.driverName },
      { type: 'resume', at: row.session?.updated_at, label: row.session?.status === 'started' ? 'Ripresa/heartbeat' : null, detail: row.driverName },
      { type: 'stop', at: row.session?.ended_at, label: 'Fine lavoro', detail: row.driverName },
      ...detectStopTimeline(row),
    ]),
    ...photos.map((photo) => ({ type: 'photo', at: photo.taken_at || photo.created_at, label: 'Foto proof', detail: photo.driver_id || photo.session_id || 'foto geolocalizzata' })),
  ].filter((item) => item.at && item.label)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 120);
}

export function buildHeatmapCells(points = []) {
  const cells = new Map();
  normalizePoints(points).forEach((point) => {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const prev = cells.get(key) || { lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)), count: 0 };
    prev.count += 1;
    cells.set(key, prev);
  });
  return Array.from(cells.values()).sort((a, b) => b.count - a.count).slice(0, 250);
}

export function buildPlaybackFrames(rows = []) {
  return rows.flatMap((row) => row.points.map((point) => ({
    sessionId: row.session?.id,
    driverName: row.driverName,
    lat: Number(point.lat),
    lng: Number(point.lng),
    speed: Number(point.speed),
    heading: Number(point.heading),
    accuracy: Number(point.accuracy),
    at: point.recorded_at || point.created_at,
  }))).filter((frame) => Number.isFinite(frame.lat) && Number.isFinite(frame.lng) && frame.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

export function formatGpsNumber(value, suffix = '') {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}${suffix}` : 'n/d';
}

export function formatGpsDuration(ms) {
  return formatDuration(ms || 0);
}

function normalizePoints(points) {
  return (points || [])
    .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
    .map((point) => ({ ...point, lat: Number(point.lat), lng: Number(point.lng) }))
    .sort((a, b) => new Date(a.recorded_at || a.created_at || 0) - new Date(b.recorded_at || b.created_at || 0));
}

function estimateMovingMs(rows) {
  let total = 0;
  rows.forEach((row) => {
    const points = row.points;
    for (let index = 1; index < points.length; index += 1) {
      const prevAt = new Date(points[index - 1].recorded_at || points[index - 1].created_at || 0).getTime();
      const currAt = new Date(points[index].recorded_at || points[index].created_at || 0).getTime();
      if (!Number.isFinite(prevAt) || !Number.isFinite(currAt)) continue;
      const moved = distanceMeters(points[index - 1].lat, points[index - 1].lng, points[index].lat, points[index].lng);
      if (moved > STOP_RADIUS_METERS) total += Math.max(0, currAt - prevAt);
    }
  });
  return total;
}

function detectStop(points = []) {
  const normalized = normalizePoints(points);
  if (normalized.length < 4) return null;
  const last = normalized[normalized.length - 1];
  const windowStart = new Date(last.recorded_at || last.created_at || 0).getTime() - STOP_WINDOW_MINUTES * 60000;
  const recent = normalized.filter((point) => new Date(point.recorded_at || point.created_at || 0).getTime() >= windowStart);
  if (recent.length < 3) return null;
  const maxDistance = Math.max(...recent.map((point) => distanceMeters(recent[0].lat, recent[0].lng, point.lat, point.lng)));
  return maxDistance <= STOP_RADIUS_METERS ? { at: last.recorded_at || last.created_at } : null;
}

function detectStopTimeline(row) {
  const stop = detectStop(row.points);
  return stop ? [{ type: 'stop-detected', at: stop.at, label: 'Sosta rilevata', detail: row.driverName }] : [];
}

function estimateCoveragePercent(km, sessions) {
  if (!sessions || !km) return 0;
  const target = Math.max(1, sessions * 2.5);
  return Math.min(100, Math.round((km / target) * 100));
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function maxOrNull(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? Math.max(...clean) : null;
}

function latestDate(values) {
  const dates = values.map((value) => new Date(value)).filter((date) => Number.isFinite(date.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : 'n/d';
}
