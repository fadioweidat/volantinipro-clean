// Analytics Visitatori — schema/validazione condivisa client + /api/track +
// test. PURO: nessun import di ambiente, DOM o rete.
//
// Confini privacy applicati QUI (l'unico punto): allowlist event_name,
// allowlist chiavi metadata, cap lunghezze, blocco PII. Vietato salvare
// email / nome / telefono / IP / coordinate / CAP / indirizzo.

export const ANALYTICS_EVENT_NAMES = Object.freeze([
  // esistenti (estesi)
  'page_view',
  'session_started',
  'quote_started',
  'quote_completed',
  'consultation_requested',
  // nuovi funnel commerciale
  'municipality_selected',
  'quantity_selected',
  'service_selected',
  'extras_selected',
  'quote_step_reached',
  'quote_abandoned',
]);

const EVENT_NAME_SET = new Set(ANALYTICS_EVENT_NAMES);

// Chiavi metadata ammesse — allowlist RIGIDA.
export const METADATA_ALLOWED_KEYS = Object.freeze([
  'municipality',
  'province',
  'region',
  'quantity_bucket',
  'service',
  'extras',
  'step',
  // classificazione traffico: enum di 4 valori, scritto SOLO da /api/track.
  // Non è un dato personale (deriva dall'host della request, mai da IP/UA raw).
  'origin_kind',
]);
const METADATA_KEY_SET = new Set(METADATA_ALLOWED_KEYS);
const ORIGIN_KIND_VALUES = new Set(['public', 'test', 'preview', 'unknown']);

// Chiavi/valori che NON devono MAI comparire (difesa in profondità).
const PII_KEY_RE = /(^|_)(email|mail|name|nome|cognome|surname|phone|tel|telefono|mobile|whatsapp|ip|address|indirizzo|cap|zip|postcode|lat|lng|latitude|longitude|coord|token|secret|password)($|_)/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LONG_DIGITS_RE = /\b\d{9,}\b/; // telefoni / IP interi / id lunghi
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

const MAX_STRING = 120;
const MAX_UTM = 120;
const MAX_PATH = 512;
const MAX_METADATA_BYTES = 1024;
const MAX_PAYLOAD_BYTES = 4096;
const QUANTITY_BUCKETS = Object.freeze(['<5k', '5-10k', '10-20k', '20-50k', '50-100k', '100k+']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const DEVICE_TYPES = new Set(['mobile', 'desktop', 'tablet', 'bot']);

export function isAllowedEventName(name) {
  return EVENT_NAME_SET.has(name);
}

export function quantityBucket(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 5000) return '<5k';
  if (n < 10000) return '5-10k';
  if (n < 20000) return '10-20k';
  if (n < 50000) return '20-50k';
  if (n < 100000) return '50-100k';
  return '100k+';
}

function looksLikePii(value) {
  if (typeof value !== 'string') return false;
  return EMAIL_RE.test(value) || IPV4_RE.test(value) || LONG_DIGITS_RE.test(value);
}

function clampString(v, max = MAX_STRING) {
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Ripulisce metadata: SOLO chiavi allowlist, valori corti, nessun PII.
// `extras` accetta un array di stringhe corte. `step` un intero 1..6.
export function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(input)) {
    if (!METADATA_KEY_SET.has(rawKey)) continue;
    if (PII_KEY_RE.test(rawKey)) continue;
    if (rawVal == null) continue;

    if (rawKey === 'step') {
      const s = Number(rawVal);
      if (Number.isInteger(s) && s >= 1 && s <= 6) out.step = s;
      continue;
    }
    if (rawKey === 'origin_kind') {
      const v = String(rawVal).toLowerCase();
      if (ORIGIN_KIND_VALUES.has(v)) out.origin_kind = v;
      continue;
    }
    if (rawKey === 'quantity_bucket') {
      const b = QUANTITY_BUCKETS.includes(rawVal) ? rawVal : quantityBucket(rawVal);
      if (b) out.quantity_bucket = b;
      continue;
    }
    if (rawKey === 'extras') {
      const list = Array.isArray(rawVal) ? rawVal : [rawVal];
      const clean = list
        .filter((x) => typeof x === 'string')
        .map((x) => clampString(x, 40))
        .filter((x) => x && !looksLikePii(x))
        .slice(0, 12);
      if (clean.length) out.extras = clean;
      continue;
    }
    // municipality / province / region / service
    if (typeof rawVal !== 'string' && typeof rawVal !== 'number') continue;
    const val = clampString(rawVal, 80);
    if (!val || looksLikePii(val)) continue;
    out[rawKey] = val;
  }
  try {
    if (JSON.stringify(out).length > MAX_METADATA_BYTES) return {};
  } catch {
    return {};
  }
  return out;
}

function sanitizeUtm(payload) {
  const out = {};
  const src = payload && typeof payload.utm === 'object' && payload.utm ? payload.utm : payload || {};
  for (const f of UTM_FIELDS) {
    const v = src[f];
    if (typeof v !== 'string') continue;
    const clean = clampString(v, MAX_UTM).toLowerCase();
    if (clean && !looksLikePii(clean)) out[f] = clean;
  }
  return out;
}

// Valida + normalizza un evento ricevuto (client o /api/track). Ritorna
// { ok, event } oppure { ok:false, reason }. `event` è pronto per l'INSERT
// su site_events (colonne piatte + metadata jsonb). La geo è accettata SOLO
// con allowGeo=true (cioè da /api/track, mai dal client).
export function validateAnalyticsEvent(payload, { allowGeo = false } = {}) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload-not-object' };
  try {
    if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'payload-too-large' };
  } catch {
    return { ok: false, reason: 'payload-unserializable' };
  }

  if (!isAllowedEventName(payload.event_name)) return { ok: false, reason: 'event-name-not-allowed' };

  const anonymousVisitorId = typeof payload.anonymous_session_id === 'string' && UUID_RE.test(payload.anonymous_session_id)
    ? payload.anonymous_session_id.toLowerCase() : null;
  if (!anonymousVisitorId) return { ok: false, reason: 'bad-anonymous-session-id' };

  const sessionId = typeof payload.session_id === 'string' && UUID_RE.test(payload.session_id)
    ? payload.session_id.toLowerCase() : null;

  const path = typeof payload.path === 'string'
    ? payload.path.split('?')[0].split('#')[0].slice(0, MAX_PATH) : null;

  const referrerHost = typeof payload.referrer_host === 'string'
    ? (clampString(payload.referrer_host, 120).toLowerCase() || null) : null;
  const referrerType = typeof payload.referrer_type === 'string'
    ? (clampString(payload.referrer_type, 24).toLowerCase() || null) : null;

  const utm = sanitizeUtm(payload);

  const deviceType = DEVICE_TYPES.has(payload.device_type) ? payload.device_type : null;
  const browser = typeof payload.browser === 'string' ? (clampString(payload.browser, 32) || null) : null;
  const os = typeof payload.os === 'string' ? (clampString(payload.os, 32) || null) : null;

  let country = null;
  let region = null;
  let city = null;
  if (allowGeo && payload.geo && typeof payload.geo === 'object') {
    country = typeof payload.geo.country === 'string'
      ? (payload.geo.country.slice(0, 2).toUpperCase().replace(/[^A-Z]/g, '') || null) : null;
    region = typeof payload.geo.region === 'string' ? (clampString(payload.geo.region, 80) || null) : null;
    city = typeof payload.geo.city === 'string' ? (clampString(payload.geo.city, 80) || null) : null;
    if (looksLikePii(region)) region = null;
    if (looksLikePii(city)) city = null;
  }

  const campaignId = typeof payload.campaign_id === 'string' && UUID_RE.test(payload.campaign_id) ? payload.campaign_id : null;
  const quoteId = typeof payload.quote_id === 'string' && UUID_RE.test(payload.quote_id) ? payload.quote_id : null;

  return {
    ok: true,
    event: {
      event_name: payload.event_name,
      anonymous_session_id: anonymousVisitorId,
      session_id: sessionId,
      path,
      referrer_host: referrerHost,
      referrer_type: referrerType,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      utm_content: utm.utm_content || null,
      utm_term: utm.utm_term || null,
      country,
      region,
      city,
      device_type: deviceType,
      browser,
      os,
      campaign_id: campaignId,
      quote_id: quoteId,
      metadata: sanitizeMetadata(payload.metadata),
    },
  };
}

export const ANALYTICS_LIMITS = Object.freeze({
  MAX_STRING, MAX_UTM, MAX_PATH, MAX_METADATA_BYTES, MAX_PAYLOAD_BYTES, QUANTITY_BUCKETS,
});
