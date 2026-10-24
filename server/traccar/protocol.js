// Protocol references and units: docs/TRACCAR_BACKUP.md. No arbitrary extras
// or client-supplied campaign/session/driver IDs ever reach the database.
export const MAX_BODY_BYTES = 16 * 1024;
export const DEVICE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const KEY_RE = /^[a-f0-9]{64}$/;

export class ProtocolError extends Error {
  constructor(status = 400) { super('Invalid Traccar request'); this.status = status; }
}

function scalar(value) {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) throw new ProtocolError();
  return value;
}
function number(value, { required = false, min = -Infinity, max = Infinity, sentinel = false } = {}) {
  scalar(value);
  if (value == null || value === '') {
    if (required) throw new ProtocolError();
    return null;
  }
  if (typeof value !== 'number' && typeof value !== 'string') throw new ProtocolError();
  if (typeof value === 'string' && !value.trim()) throw new ProtocolError();
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ProtocolError();
  if (sentinel && n === -1) return null; // mobile location APIs: unavailable
  if (n < min || n > max) throw new ProtocolError();
  return n;
}
function timestamp(value) {
  scalar(value);
  if (value == null || value === '') throw new ProtocolError();
  let ms;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    const n = number(value, { required: true, min: 0 });
    ms = n < 1e11 ? n * 1000 : n;
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    ms = Date.parse(value);
  }
  // Never substitute reception time for the device's fix time.
  if (!Number.isFinite(ms) || ms < 946684800000 || ms > 8640000000000000) throw new ProtocolError();
  return new Date(ms).toISOString();
}
function charging(value) {
  scalar(value);
  if (value == null || value === '') return null;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  throw new ProtocolError();
}
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProtocolError();
  return value;
}
function params(input) {
  const result = Object.create(null);
  for (const [key, value] of new URLSearchParams(input)) {
    if (Object.hasOwn(result, key)) throw new ProtocolError();
    result[key] = value;
  }
  return result;
}

export function parseTraccarRequest(req) {
  if (!['GET', 'POST'].includes(req.method)) throw new ProtocolError(405);
  const url = new URL(req.url || '/', 'https://local.invalid');
  const query = params(url.search);
  let input = query;
  const ct = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  const raw = req.body;
  if (req.method === 'POST' && raw != null) {
    let size;
    try { size = Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)); }
    catch { throw new ProtocolError(); }
    if (size > MAX_BODY_BYTES) throw new ProtocolError(413);
    if (ct === 'application/json') {
      try { input = object(typeof raw === 'string' ? JSON.parse(raw) : raw); }
      catch { throw new ProtocolError(); }
    } else if (ct === 'application/x-www-form-urlencoded') {
      input = typeof raw === 'string' ? params(raw) : object(raw);
      // Reject conflicting position fields between the URL and form body.
      for (const [key, value] of Object.entries(query)) {
        if (key !== 'key' && Object.hasOwn(input, key) && input[key] !== value) throw new ProtocolError();
      }
      input = { ...query, ...input };
    } else if (raw !== '') {
      throw new ProtocolError(415);
    }
  }
  if (url.search.length > MAX_BODY_BYTES) throw new ProtocolError(413);
  const json = ct === 'application/json' && req.method === 'POST';
  const deviceId = scalar(json ? input.device_id : (input.id ?? input.deviceid));
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) throw new ProtocolError();
  if (!json && input.id != null && input.deviceid != null && input.id !== input.deviceid) throw new ProtocolError();
  const loc = json ? object(input.location) : input;
  const coords = json ? object(loc.coords) : input;
  // Ignore explicitly invalid or mocked fixes, rather than fabricating a fix.
  const ignored = loc.mock === true || loc.mock === 'true' || (!json && ['false', '0', false, 0].includes(input.valid));
  const battery = json && loc.battery != null ? object(loc.battery) : {};
  const speed = number(coords.speed, { min: 0, sentinel: json });
  const level = number(json ? battery.level : input.batt, { min: 0, max: json ? 1 : 100, sentinel: json });
  return {
    deviceId,
    key: typeof query.key === 'string' && KEY_RE.test(query.key) ? query.key : null,
    ignored,
    point: {
      recordedAt: timestamp(loc.timestamp),
      lat: number(json ? coords.latitude : input.lat, { required: true, min: -90, max: 90 }),
      lng: number(json ? coords.longitude : input.lon, { required: true, min: -180, max: 180 }),
      accuracy: number(coords.accuracy, { min: 0, sentinel: json }),
      speed: speed == null ? null : json ? speed : speed * (1852 / 3600),
      heading: number(json ? coords.heading : (input.bearing ?? input.heading), { min: 0, max: 360, sentinel: json }),
      altitude: number(coords.altitude),
      batteryLevel: level == null ? null : json ? level * 100 : level,
      isCharging: charging(json ? battery.is_charging : input.charge),
    },
  };
}
