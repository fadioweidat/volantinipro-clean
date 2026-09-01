// Analytics Visitatori — tracking first-party, privacy-safe, senza provider
// di terze parti. Scritture anonime, sempre fire-and-forget: un insert
// fallito/bloccato non deve MAI toccare la UI.
//
// Percorso di invio:
//   1) POST {origin}/api/track  — Vercel function: aggiunge la geo
//      approssimativa (country/region/city) dagli header, MAI l'IP, e
//      inserisce con service role lato server.
//   2) fallback: INSERT anon diretto su /rest/v1/site_events (SENZA geo),
//      solo apikey + Authorization = chiave pubblica, mai un JWT di sessione.
//
// Storico: il tracking usava il client @supabase/supabase-js principale, che
// allega la sessione di login e restituiva 401 con JWT scaduto. Ora posta
// come anon esplicito con la sola chiave pubblica, mai tramite quel client.

import { parseUtm, classifyReferrer } from './utm.js';
import { detectClientDevice } from './device.js';
import { sanitizeMetadata, quantityBucket } from './eventSchema.js';

function analyticsEnv() {
  try {
    return { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY };
  } catch {
    if (typeof process !== 'undefined' && process.env) {
      return { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY };
    }
    return { url: undefined, anonKey: undefined };
  }
}

export const SITE_EVENT_NAMES = Object.freeze({
  PAGE_VIEW: 'page_view',
  SESSION_STARTED: 'session_started',
  QUOTE_STARTED: 'quote_started',
  QUOTE_COMPLETED: 'quote_completed',
  CONSULTATION_REQUESTED: 'consultation_requested',
  MUNICIPALITY_SELECTED: 'municipality_selected',
  QUANTITY_SELECTED: 'quantity_selected',
  SERVICE_SELECTED: 'service_selected',
  EXTRAS_SELECTED: 'extras_selected',
  QUOTE_STEP_REACHED: 'quote_step_reached',
  QUOTE_ABANDONED: 'quote_abandoned',
});
const ALLOWED_EVENTS = Object.values(SITE_EVENT_NAMES);

const OPT_OUT_KEY = 'vp_analytics_optout';
const VISITOR_KEY = 'vp_anon_visitor';           // localStorage { id, exp }
const LEGACY_VISITOR_KEY = 'vp_anon_session_id';  // schema precedente (senza TTL)
const SESSION_ID_KEY = 'vp_anon_session';         // sessionStorage
const SESSION_STARTED_KEY = 'vp_session_started';
const QUOTE_STARTED_KEY = 'vp_quote_started_fired';
const UTM_KEY = 'vp_analytics_ctx';               // sessionStorage: utm + referrer catturati 1x
const DEDUP_KEY = 'vp_analytics_dedup';           // sessionStorage
const VISITOR_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90 giorni (decisione FASE 2)
const DEDUP_WINDOW_MS = 30 * 1000;

function safeRandomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function ls() { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } }
function ss() { try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; } }

export function isAnalyticsOptedOut() {
  try { return ls()?.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}
export function setAnalyticsOptOut(optedOut) {
  const store = ls();
  if (!store) return;
  try {
    if (optedOut) store.setItem(OPT_OUT_KEY, '1');
    else store.removeItem(OPT_OUT_KEY);
  } catch { /* storage non disponibile */ }
}

// Visitatore pseudonimo con TTL 90 giorni. Nessun dato personale: UUID
// casuale che scade e viene rigenerato.
export function getAnonymousVisitorId() {
  const store = ls();
  if (!store) return null;
  try {
    const raw = store.getItem(VISITOR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string' && typeof parsed.exp === 'number' && parsed.exp > Date.now()) {
        return parsed.id;
      }
    }
    // migrazione una-tantum dal vecchio id senza TTL, poi lo si lascia scadere
    const legacy = store.getItem(LEGACY_VISITOR_KEY);
    const id = (typeof legacy === 'string' && legacy) ? legacy : safeRandomUuid();
    store.setItem(VISITOR_KEY, JSON.stringify({ id, exp: Date.now() + VISITOR_TTL_MS }));
    return id;
  } catch {
    return null;
  }
}

// Alias di compatibilità: errorLog.js importa ancora questo nome.
export function getAnonymousSessionId() {
  return getAnonymousVisitorId();
}

function readTabSessionId() {
  const store = ss();
  if (!store) return safeRandomUuid();
  try {
    let id = store.getItem(SESSION_ID_KEY);
    if (!id) { id = safeRandomUuid(); store.setItem(SESSION_ID_KEY, id); }
    return id;
  } catch {
    return safeRandomUuid();
  }
}

// UTM + referrer catturati UNA volta per sessione (prima pagina della visita).
function analyticsContext() {
  const store = ss();
  if (typeof window === 'undefined') return { utm: {}, referrer_host: null, referrer_type: null };
  try {
    const cached = store?.getItem(UTM_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* ignora */ }

  const utm = parseUtm(window.location?.search || '');
  const host = window.location?.hostname || null;
  const ref = classifyReferrer(typeof document !== 'undefined' ? document.referrer : null, host);
  const ctx = { utm, referrer_host: ref.host, referrer_type: ref.type };
  try { store?.setItem(UTM_KEY, JSON.stringify(ctx)); } catch { /* ignora */ }
  return ctx;
}

// Dedup: evita doppio conteggio (StrictMode / re-render SPA). key con TTL 30s.
function isDuplicate(key) {
  const store = ss();
  if (!store) return false;
  try {
    const now = Date.now();
    const map = JSON.parse(store.getItem(DEDUP_KEY) || '{}');
    for (const k of Object.keys(map)) if (now - map[k] > DEDUP_WINDOW_MS) delete map[k];
    if (map[key] && now - map[key] <= DEDUP_WINDOW_MS) { store.setItem(DEDUP_KEY, JSON.stringify(map)); return true; }
    map[key] = now;
    store.setItem(DEDUP_KEY, JSON.stringify(map));
    return false;
  } catch {
    return false;
  }
}

function safeOrigin() {
  try {
    const o = typeof window !== 'undefined' ? window.location?.origin : null;
    return typeof o === 'string' && /^https?:\/\//.test(o) ? o : null;
  } catch {
    return null;
  }
}

function buildPayload(eventName, { path = null, metadata = null, campaignId = null, quoteId = null } = {}) {
  const ctx = analyticsContext();
  const device = detectClientDevice();
  return {
    event_name: eventName,
    anonymous_session_id: getAnonymousVisitorId(),
    session_id: readTabSessionId(),
    path,
    referrer_host: ctx.referrer_host || null,
    referrer_type: ctx.referrer_type || null,
    utm_source: ctx.utm?.utm_source || null,
    utm_medium: ctx.utm?.utm_medium || null,
    utm_campaign: ctx.utm?.utm_campaign || null,
    utm_content: ctx.utm?.utm_content || null,
    utm_term: ctx.utm?.utm_term || null,
    device_type: device.device_type,
    browser: device.browser,
    os: device.os,
    campaign_id: campaignId || null,
    quote_id: quoteId || null,
    metadata: sanitizeMetadata(metadata),
  };
}

async function dispatch(eventName, opts = {}) {
  if (!ALLOWED_EVENTS.includes(eventName)) return;
  if (isAnalyticsOptedOut()) return;
  const { url, anonKey } = analyticsEnv();
  if (!url || !anonKey) return;
  const anonymousVisitorId = getAnonymousVisitorId();
  if (!anonymousVisitorId) return;

  const payload = buildPayload(eventName, opts);
  const body = JSON.stringify(payload);
  const origin = safeOrigin();

  // 1) /api/track (aggiunge geo lato server, mai l'IP)
  if (origin) {
    try {
      const res = await fetch(`${origin}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
      if (res && res.ok) return;
    } catch { /* passa al fallback */ }
  }

  // 2) fallback anon diretto — SENZA geo. Solo chiave pubblica.
  try {
    await fetch(`${url}/rest/v1/site_events`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
      keepalive: true,
    });
  } catch {
    // Fire-and-forget: il tracking non deve mai bloccare o rompere la UX.
  }
}

function ensureSessionStarted(path) {
  const store = ss();
  if (typeof window !== 'undefined' && store) {
    try {
      if (store.getItem(SESSION_STARTED_KEY)) return;
      store.setItem(SESSION_STARTED_KEY, '1');
    } catch { /* ignora */ }
  }
  if (isDuplicate('session_started')) return;
  dispatch(SITE_EVENT_NAMES.SESSION_STARTED, { path });
}

// ── API pubblica ─────────────────────────────────────────────────────
export function trackPageView(path) {
  const resolvedPath = (path || (typeof window !== 'undefined' ? window.location.pathname : null) || '').split('?')[0].split('#')[0] || null;
  ensureSessionStarted(resolvedPath);
  if (isDuplicate(`page_view:${resolvedPath}`)) return;
  dispatch(SITE_EVENT_NAMES.PAGE_VIEW, { path: resolvedPath });
}

export function trackQuoteStarted() {
  const store = ss();
  if (typeof window !== 'undefined' && store) {
    try {
      if (store.getItem(QUOTE_STARTED_KEY)) return;
      store.setItem(QUOTE_STARTED_KEY, '1');
    } catch { /* ignora */ }
  }
  dispatch(SITE_EVENT_NAMES.QUOTE_STARTED);
}

export function trackQuoteStepReached(step) {
  const s = Number(step);
  if (!Number.isInteger(s) || s < 1 || s > 6) return;
  if (isDuplicate(`quote_step_reached:${s}`)) return;
  dispatch(SITE_EVENT_NAMES.QUOTE_STEP_REACHED, { metadata: { step: s } });
}

export function trackMunicipalitySelected({ municipality = null, province = null, region = null } = {}) {
  if (!municipality) return;
  dispatch(SITE_EVENT_NAMES.MUNICIPALITY_SELECTED, { metadata: { municipality, province, region } });
}

export function trackQuantitySelected(quantity) {
  const bucket = quantityBucket(quantity);
  if (!bucket) return;
  dispatch(SITE_EVENT_NAMES.QUANTITY_SELECTED, { metadata: { quantity_bucket: bucket } });
}

export function trackServiceSelected(service) {
  if (!service) return;
  dispatch(SITE_EVENT_NAMES.SERVICE_SELECTED, { metadata: { service } });
}

export function trackExtrasSelected(extras) {
  const list = Array.isArray(extras) ? extras : [extras];
  const clean = list.filter((x) => typeof x === 'string' && x.trim());
  if (clean.length === 0) return;
  dispatch(SITE_EVENT_NAMES.EXTRAS_SELECTED, { metadata: { extras: clean } });
}

export function trackQuoteAbandoned(step) {
  const s = Number(step);
  const meta = Number.isInteger(s) && s >= 1 && s <= 6 ? { step: s } : null;
  dispatch(SITE_EVENT_NAMES.QUOTE_ABANDONED, meta ? { metadata: meta } : {});
}

export function trackQuoteCompleted({ campaignId = null, quoteId = null, municipality = null, province = null, quantity = null, service = null } = {}) {
  const metadata = {};
  if (municipality) metadata.municipality = municipality;
  if (province) metadata.province = province;
  const b = quantityBucket(quantity);
  if (b) metadata.quantity_bucket = b;
  if (service) metadata.service = service;
  metadata.step = 4;
  dispatch(SITE_EVENT_NAMES.QUOTE_COMPLETED, { campaignId, quoteId, metadata });
}

export function trackConsultationRequested() {
  dispatch(SITE_EVENT_NAMES.CONSULTATION_REQUESTED);
}
