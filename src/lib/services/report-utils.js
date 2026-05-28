export const REPORT_COLORS = ['#e8571a', '#2ecc8a', '#60a5fa', '#fbbf24', '#a78bfa', '#ef4444', '#14b8a6'];

export function deriveCampaignStatus(sessions) {
  if (!sessions?.length) return 'non iniziata';
  if (sessions.some((session) => session.status === 'started')) return 'in corso';
  if (sessions.some((session) => session.status === 'paused')) return 'pausa';
  if (sessions.every((session) => session.status === 'completed')) return 'completata';
  if (sessions.some((session) => session.status === 'cancelled')) return 'annullata';
  return sessions[0]?.status || 'dato non disponibile';
}

export function estimateProgress(sessions) {
  if (!sessions?.length) return 'dato non disponibile';
  const completed = sessions.filter((session) => session.status === 'completed').length;
  const active = sessions.filter((session) => session.status === 'started' || session.status === 'paused').length;
  return `${Math.min(95, Math.round(((completed + active * 0.5) / sessions.length) * 100))}%`;
}

export function sessionDurationMs(session) {
  if (!session?.started_at) return 0;
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.ended_at || session.paused_at || Date.now()).getTime();
  return Math.max(0, end - start);
}

export function lastActivityAt(session, points = []) {
  const latestPoint = points[points.length - 1];
  return latestPoint?.recorded_at || latestPoint?.created_at || session?.updated_at || session?.ended_at || session?.paused_at || session?.started_at || session?.created_at || null;
}

export function filterOperationalRows(rows, filters = {}) {
  const range = resolveDateRange(filters.period || 'all', filters.fromDate, filters.toDate);
  const driverQuery = String(filters.driver || '').trim().toLowerCase();
  const groupQuery = String(filters.group || '').trim().toLowerCase();
  return (rows || [])
    .filter((item) => !filters.campaign || filters.campaign === 'all' || item.session?.campaign_id === filters.campaign)
    .filter((item) => !filters.status || filters.status === 'all' || item.session?.status === filters.status || item.status === filters.status)
    .filter((item) => !driverQuery || String(item.driverName || item.session?.driver_name || item.session?.driver_id || '').toLowerCase().includes(driverQuery))
    .filter((item) => !groupQuery || String(item.groupName || item.group?.name || item.group?.id || item.session?.group_name || item.session?.group_id || '').toLowerCase().includes(groupQuery))
    .filter((item) => {
      if (!range) return true;
      const value = item.activityAt || lastActivityAt(item.session, item.points);
      if (!value) return false;
      const time = new Date(value).getTime();
      return time >= range.start.getTime() && time <= range.end.getTime();
    });
}

export function resolveDateRange(period, fromDate, toDate) {
  if (period === 'all') return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return { start: startOfToday, end: endOfDay(startOfToday) };
  if (period === 'yesterday') {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() - 1);
    return { start: day, end: endOfDay(day) };
  }
  if (period === '7d') {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 6);
    return { start, end: now };
  }
  if (period === 'custom' && (fromDate || toDate)) {
    const start = fromDate ? new Date(`${fromDate}T00:00:00`) : new Date(0);
    const end = toDate ? new Date(`${toDate}T23:59:59.999`) : now;
    return { start, end };
  }
  return null;
}

function endOfDay(date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function buildSessionCsv(campaignId, rows, displayDriverName, calculateDistanceKm) {
  return toCsv([
    ['campaign_id', 'session_id', 'operator', 'driver_id', 'status', 'started_at', 'paused_at', 'ended_at', 'last_activity_at', 'points', 'km'],
    ...(rows || []).map((item) => [
      campaignId || item.session?.campaign_id || '',
      item.session?.id || '',
      displayDriverName(item.session),
      item.session?.driver_id || '',
      item.session?.status || '',
      item.session?.started_at || '',
      item.session?.paused_at || '',
      item.session?.ended_at || '',
      item.activityAt || lastActivityAt(item.session, item.points),
      item.points?.length || 0,
      calculateDistanceKm(item.points || []).toFixed(3),
    ]),
  ]);
}

export function buildGpsCsv(campaignId, rows) {
  const points = (rows || []).flatMap((item) => (item.points || []).map((point) => ({ point, session: item.session })));
  return toCsv([
    ['campaign_id', 'session_id', 'driver_id', 'point_id', 'lat', 'lng', 'accuracy', 'speed', 'heading', 'recorded_at'],
    ...points.map(({ point, session }) => [
      campaignId || point.campaign_id || session?.campaign_id || '',
      point.session_id || session?.id || '',
      point.driver_id || session?.driver_id || '',
      point.id || '',
      point.lat || '',
      point.lng || '',
      point.accuracy ?? '',
      point.speed ?? '',
      point.heading ?? '',
      point.recorded_at || point.created_at || '',
    ]),
  ]);
}

export function downloadTextFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows) {
  return rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('it-IT') : 'n/d';
}

export function formatDuration(ms) {
  const minutes = Math.floor((ms || 0) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

export function shortId(value) {
  return value ? String(value).slice(0, 8) : 'n/d';
}

export function detectAnomalies(rows) {
  const anomalies = [];
  (rows || []).forEach((item) => {
    const sessionId = shortId(item.session?.id);
    if (!item.points?.length) {
      anomalies.push({ level: 'warning', label: 'GPS assente', detail: `Sessione ${sessionId} senza punti GPS registrati.` });
      return;
    }
    const gaps = findLongGpsGaps(item.points);
    gaps.forEach((gap) => anomalies.push({
      level: 'warning',
      label: 'Offline lungo',
      detail: `Sessione ${sessionId}: assenza GPS di ${formatDuration(gap.ms)} dalle ${formatDateTime(gap.from)}.`,
    }));
    const veryLowAccuracy = item.points.filter((point) => Number(point.accuracy) > 120).length;
    if (veryLowAccuracy > Math.max(4, item.points.length * 0.2)) {
      anomalies.push({ level: 'info', label: 'GPS instabile', detail: `Sessione ${sessionId}: molti punti con accuracy oltre 120 m.` });
    }
  });
  return anomalies;
}

function findLongGpsGaps(points) {
  const gaps = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]?.recorded_at || points[index - 1]?.created_at;
    const to = points[index]?.recorded_at || points[index]?.created_at;
    const ms = new Date(to).getTime() - new Date(from).getTime();
    if (Number.isFinite(ms) && ms > 20 * 60000) gaps.push({ from, to, ms });
  }
  return gaps;
}
