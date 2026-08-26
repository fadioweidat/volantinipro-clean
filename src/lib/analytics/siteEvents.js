// Privacy-safe first-party site analytics (no PII, no third-party
// provider). Writes go through the same anon-key browser Supabase client
// already used everywhere else (src/supabaseClient.js) and are restricted
// server-side by the site_events_insert_anon/site_events_insert_authenticated
// RLS policies (INSERT-only, event_name allowlist) — see
// supabase/migrations/20260825190000_site_traffic_events.sql. Tracking is
// always fire-and-forget: a failed/blocked insert must never affect the UI.

import { supabase } from "../../supabaseClient.js";

export const SITE_EVENT_NAMES = Object.freeze({
  PAGE_VIEW: "page_view",
  SESSION_STARTED: "session_started",
  QUOTE_STARTED: "quote_started",
  QUOTE_COMPLETED: "quote_completed",
  CONSULTATION_REQUESTED: "consultation_requested",
});

const ALLOWED_EVENTS = Object.values(SITE_EVENT_NAMES);

const ANON_ID_KEY = "vp_anon_session_id";
const SESSION_STARTED_KEY = "vp_session_started";
const QUOTE_STARTED_KEY = "vp_quote_started_fired";

function safeRandomUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback senza dipendenze esterne per browser molto vecchi.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Id pseudonimo persistente per browser (rappresenta un "visitatore", mai
// un utente identificato). Nessun dato personale: solo un UUID casuale.
export function getAnonymousSessionId() {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = safeRandomUuid();
      window.localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

async function insertSiteEvent(eventName, { path = null, campaignId = null, quoteId = null } = {}) {
  if (!ALLOWED_EVENTS.includes(eventName)) return;
  if (!supabase) return;
  const anonymousSessionId = getAnonymousSessionId();
  if (!anonymousSessionId) return;
  try {
    await supabase.from("site_events").insert({
      event_name: eventName,
      anonymous_session_id: anonymousSessionId,
      path,
      campaign_id: campaignId,
      quote_id: quoteId,
    });
  } catch {
    // Fire-and-forget: il tracking non deve mai bloccare o rompere l'esperienza utente.
  }
}

// Una sola "sessione" per apertura di scheda/finestra (sessionStorage, non
// localStorage): distingue "Sessioni oggi" (numero di visite) da
// "Visitatori oggi" (COUNT DISTINCT anonymous_session_id), coerente con la
// singola colonna anonymous_session_id richiesta dallo schema minimo.
function ensureSessionStarted(path) {
  if (typeof window === "undefined") {
    insertSiteEvent(SITE_EVENT_NAMES.SESSION_STARTED, { path });
    return;
  }
  try {
    if (window.sessionStorage.getItem(SESSION_STARTED_KEY)) return;
    window.sessionStorage.setItem(SESSION_STARTED_KEY, "1");
  } catch {}
  insertSiteEvent(SITE_EVENT_NAMES.SESSION_STARTED, { path });
}

export function trackPageView(path) {
  const resolvedPath = path || (typeof window !== "undefined" ? window.location.pathname : null);
  ensureSessionStarted(resolvedPath);
  insertSiteEvent(SITE_EVENT_NAMES.PAGE_VIEW, { path: resolvedPath });
}

// Una volta per sessione (sessionStorage): evita di gonfiare "Preventivi
// iniziati" quando l'utente torna avanti/indietro tra gli step nella stessa
// visita.
export function trackQuoteStarted() {
  if (typeof window !== "undefined") {
    try {
      if (window.sessionStorage.getItem(QUOTE_STARTED_KEY)) return;
      window.sessionStorage.setItem(QUOTE_STARTED_KEY, "1");
    } catch {}
  }
  insertSiteEvent(SITE_EVENT_NAMES.QUOTE_STARTED);
}

export function trackQuoteCompleted({ campaignId = null, quoteId = null } = {}) {
  insertSiteEvent(SITE_EVENT_NAMES.QUOTE_COMPLETED, { campaignId, quoteId });
}

export function trackConsultationRequested() {
  insertSiteEvent(SITE_EVENT_NAMES.CONSULTATION_REQUESTED);
}
