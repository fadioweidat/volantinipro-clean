// Real, privacy-safe error/incident logging for the Admin "Centro Controllo
// Sito". Same anon-key browser client and fire-and-forget discipline as
// src/lib/analytics/siteEvents.js — a logging failure must never break the
// app it's trying to report on. See
// supabase/migrations/20260825220000_error_log.sql for the base schema/RLS
// and 20260901120000_error_log_hardening.sql for fingerprint/upsert.

import { supabase } from "../../supabaseClient.js";
import { getAnonymousSessionId } from "../analytics/siteEvents.js";

export const ERROR_CATEGORIES = Object.freeze({
  FRONTEND: "frontend",
  API: "api",
  SUPABASE: "supabase",
  EDGE_FUNCTION: "edge_function",
  AUTH: "auth",
  SUBMIT_CAMPAIGN: "submit_campaign",
  QUOTE: "quote",
  GPS: "gps",
  DRIVER: "driver",
});

export const ERROR_SEVERITY = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
});

const ALLOWED_CATEGORIES = Object.values(ERROR_CATEGORIES);
const ALLOWED_SEVERITIES = Object.values(ERROR_SEVERITY);
const MAX_MESSAGE_LENGTH = 500;

// Non salvare mai token/JWT/chiavi che potrebbero comparire per errore in un
// messaggio di errore concatenato (es. un URL con ?apikey=... in un fetch
// fallito). Difesa in profondita': il messaggio non dovrebbe MAI contenerne,
// ma se succede viene redatto prima dell'insert, non solo troncato.
const SECRET_LIKE_PATTERN = /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})|(sb_(secret|publishable)_[a-zA-Z0-9_-]+)|(apikey=[^&\s]+)|(authorization:\s*bearer\s+\S+)/gi;

function sanitizeMessage(rawMessage) {
  const text = String(rawMessage ?? "").replace(SECRET_LIKE_PATTERN, "[redacted]");
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
}

// Fingerprint = hash stabile di (category | module | messaggio normalizzato).
// Normalizzazione: minuscolo, UUID/numeri/spazi collassati, secret redatti —
// cosi' "Failed to fetch /x/abc-123" e "Failed to fetch /x/def-456" collidono
// sullo stesso fingerprint e diventano UNA riga con occurrence_count, non due.
function normalizeForFingerprint(text) {
  return String(text ?? "")
    .replace(SECRET_LIKE_PATTERN, "[redacted]")
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function computeErrorFingerprint(category, moduleName, message) {
  return fingerprintFor(category, moduleName, message);
}

function fingerprintFor(category, moduleName, message) {
  const basis = `${category}|${moduleName || ""}|${normalizeForFingerprint(message)}`;
  // djb2 — deterministico, nessuna dipendenza da crypto (sync, browser-safe).
  let hash = 5381;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (((hash << 5) + hash) + basis.charCodeAt(i)) | 0;
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

function currentOrigin() {
  try {
    if (typeof window !== "undefined" && window.location && window.location.host) {
      return String(window.location.host).slice(0, 200);
    }
  } catch {
    // window non disponibile (SSR/test): nessun origin.
  }
  return null;
}

function currentRelease() {
  // __COMMIT_SHA__ e' un define di Vite (vite.config.js). `typeof` su un
  // identificatore non dichiarato NON lancia: fuori da Vite → null.
  try {
    if (typeof __COMMIT_SHA__ !== "undefined" && __COMMIT_SHA__) {
      return String(__COMMIT_SHA__).slice(0, 40);
    }
  } catch {
    // no-op
  }
  return null;
}

// fingerprint puo' essere passato esplicitamente dai chiamati che vogliono un
// raggruppamento stabile a prescindere dal testo del messaggio (es.
// platformHealth.js passa `health:<key>` cosi' un warning di health gia'
// mostrato nel pannello non genera una riga nuova ad ogni run).
export async function logError({ category, module = null, message, severity = ERROR_SEVERITY.ERROR, requestId = null, campaignId = null, fingerprint = null } = {}) {
  if (!ALLOWED_CATEGORIES.includes(category)) return;
  if (!ALLOWED_SEVERITIES.includes(severity)) severity = ERROR_SEVERITY.ERROR;
  if (!supabase) return;
  const anonymousSessionId = getAnonymousSessionId();
  const cleanMessage = sanitizeMessage(message);
  const fp = fingerprint || fingerprintFor(category, module, cleanMessage);
  try {
    // RPC (non insert diretto): fa l'upsert per fingerprint aperto —
    // occurrence_count+1 / last_seen_at=now() se l'errore si ripete, riga
    // nuova altrimenti. anon non puo' fare ON CONFLICT DO UPDATE da solo.
    await supabase.rpc("error_log_record", {
      p_category: category,
      p_module: module,
      p_message: cleanMessage,
      p_severity: severity,
      p_fingerprint: fp,
      p_origin: currentOrigin(),
      p_release: currentRelease(),
      p_request_id: requestId,
      p_campaign_id: campaignId,
      p_anonymous_session_id: anonymousSessionId,
    });
  } catch {
    // Fire-and-forget: il logging non deve mai propagare un secondo errore.
  }
}
