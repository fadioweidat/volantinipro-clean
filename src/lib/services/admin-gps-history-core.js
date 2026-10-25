// Admin read model: summaries never depend on downloading raw tracks.
export function createAdminGpsHistory(client, bridge = async () => {}) {
  return {
    async summaries({ start = null, end = null, status = 'all_history', signal } = {}) {
      await bridge();
      let query = client.rpc('gps_admin_session_summaries', {
        p_from: start?.toISOString() ?? null, p_to: end?.toISOString() ?? null, p_status: status,
      });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
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
