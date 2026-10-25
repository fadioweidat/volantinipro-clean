import { calculateFilteredDistanceKm, summarizeGpsQuality } from '../gps/pointQuality.js';

// Only "the function is not installed yet" (PostgREST PGRST202 / Postgres 42883): any other
// error stays an explicit error, never a silent fallback.
export function isMissingRpcError(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return error?.code === 'PGRST202' || error?.code === '42883'
    || /could not find the function|function [^ ]*gps_admin_session_summaries[^ ]* does not exist/i.test(text);
}

// Previous reading (getLiveDrivers, all points downloaded) in the summary shape. Used only while
// gps_admin_session_summaries is not installed: www keeps working between the frontend release
// and the migration. Marked legacySummary: its counts can still hit the 1.000-row REST limit.
export function legacyRowsToSummaries(rows = []) {
  return rows.map((row) => {
    const points = Array.isArray(row.points) ? row.points : [];
    return {
      ...row,
      points: [],
      pointCount: points.length,
      valid_count: summarizeGpsQuality(points).validCount,
      km: calculateFilteredDistanceKm(points),
      first_point_at: points[0]?.recorded_at ?? null,
      last_point_at: points[points.length - 1]?.recorded_at ?? null,
      campaignName: row.campaignName ?? null,
      groupName: row.groupName ?? row.group?.name ?? null,
      legacySummary: true,
    };
  });
}

// Admin read model: summaries never depend on downloading raw tracks.
export function createAdminGpsHistory(client, bridge = async () => {}, { legacySummaries = null } = {}) {
  return {
    async summaries({ start = null, end = null, status = 'all_history', signal } = {}) {
      await bridge();
      let query = client.rpc('gps_admin_session_summaries', {
        p_from: start?.toISOString() ?? null, p_to: end?.toISOString() ?? null, p_status: status,
      });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error && legacySummaries && isMissingRpcError(error)) return legacyRowsToSummaries(await legacySummaries());
      if (error) throw new Error(`Riepilogo GPS non disponibile: ${error.message}`);
      if (!Array.isArray(data?.rows)) throw new Error('Risposta riepilogo GPS non valida.');
      return data.rows.map(row => ({ ...row, points: [], pointCount: Number(row.point_count),
        km: Number(row.km), lastPing: row.activityAt, driverName: row.session.driver_name,
        status: 'offline', group: { id: row.session.group_id, name: row.groupName },
      }));
    },
    async trace(sessionId, { expectedCount, lastPointAt, signal } = {}) {
      if (!sessionId) throw new Error('Sessione GPS mancante.');
      await bridge();
      const points = [], ids = new Set();
      // 500 is below the configured PostgREST max_rows (1000).
      for (let offset = 0; ; offset += 500) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        let query = client.from('gps_tracking_points')
          .select('id,session_id,campaign_id,driver_id,lat,lng,accuracy,speed,heading,recorded_at,created_at')
          .eq('session_id', sessionId).order('recorded_at', { ascending: true })
          .order('id', { ascending: true });
        if (lastPointAt) query = query.lte('recorded_at', lastPointAt);
        query = query.range(offset, offset + 499);
        if (signal) query = query.abortSignal(signal);
        const { data, error } = await query;
        if (error) throw new Error(`Traccia GPS non disponibile: ${error.message}`);
        if (!Array.isArray(data)) throw new Error('Risposta traccia GPS non valida.');
        for (const point of data) {
          if (point.session_id !== sessionId || ids.has(point.id))
            throw new Error('Traccia modificata durante la lettura. Aggiorna per riprovare.');
          ids.add(point.id); points.push(point);
        }
        if (data.length < 500) break;
      }
      if (expectedCount != null && points.length !== expectedCount)
        throw new Error('Traccia non completa o aggiornata durante la lettura. Aggiorna per riprovare.');
      return points;
    },
  };
}

export function sessionZoneStatus(session, detected) {
  return ['completed', 'cancelled'].includes(session?.status) ? 'session_ended' : detected;
}
export function zoneStatusLabel(status, labels) {
  return status === 'session_ended' ? 'Sessione conclusa' : labels[status] || labels.zone_unavailable;
}
