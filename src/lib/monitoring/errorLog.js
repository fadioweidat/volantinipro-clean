// Real, privacy-safe error/incident logging for the Admin "Centro Controllo
// Sito". Same anon-key browser client and fire-and-forget discipline as
// src/lib/analytics/siteEvents.js — a logging failure must never break the
// app it's trying to report on. See
// supabase/migrations/20260825220000_error_log.sql for the schema/RLS.

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

export async function logError({ category, module = null, message, severity = ERROR_SEVERITY.ERROR, requestId = null, campaignId = null } = {}) {
  if (!ALLOWED_CATEGORIES.includes(category)) return;
  if (!ALLOWED_SEVERITIES.includes(severity)) severity = ERROR_SEVERITY.ERROR;
  if (!supabase) return;
  const anonymousSessionId = getAnonymousSessionId();
  try {
    await supabase.from("error_log").insert({
      category,
      module,
      message: sanitizeMessage(message),
      severity,
      request_id: requestId,
      campaign_id: campaignId,
      anonymous_session_id: anonymousSessionId,
    });
  } catch {
    // Fire-and-forget: il logging non deve mai propagare un secondo errore.
  }
}
