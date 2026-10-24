import { createHash } from 'node:crypto';
import { parseTraccarRequest, ProtocolError } from '../../server/traccar/protocol.js';

// Additive endpoint. Never calls start/resume, never changes an existing RPC.
export function createTraccarHandler({ fetchImpl = fetch, env = process.env, log = console.error } = {}) {
  return async function handler(req, res) {
    const reply = (status, body) => {
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(status).end(JSON.stringify(body));
    };
    let fix;
    try { fix = parseTraccarRequest(req); }
    catch (error) { return reply(error instanceof ProtocolError ? error.status : 400, { ok: false }); }
    // Uniform acknowledgement avoids revealing registered Device IDs.
    if (!fix.key || fix.ignored) return reply(200, { ok: true });
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || env.TRACCAR_BACKUP_ENABLED !== 'true') {
      // Requested contract: even valid requests during an outage get HTTP 200.
      // Traccar will NOT retry these. See operational notes in the guide.
      log('traccar_backup_unavailable');
      return reply(200, { ok: false, error: 'temporarily_unavailable' });
    }
    try {
      const p = fix.point;
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/traccar_ingest_point`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_device_id: fix.deviceId,
          p_token_hash: createHash('sha256').update(fix.key).digest('hex'),
          p_recorded_at: p.recordedAt, p_lat: p.lat, p_lng: p.lng,
          p_accuracy: p.accuracy, p_speed: p.speed, p_heading: p.heading,
          p_altitude: p.altitude, p_battery_level: p.batteryLevel, p_is_charging: p.isCharging,
        }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('ingest unavailable');
      await response.json();
      return reply(200, { ok: true });
    } catch {
      // Never log payload, coordinates, Device ID, secret, URL or upstream body.
      log('traccar_backup_ingest_failed');
      return reply(200, { ok: false, error: 'temporarily_unavailable' });
    }
  };
}

export default createTraccarHandler();
