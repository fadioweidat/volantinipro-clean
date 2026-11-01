import { getStoredSupabaseSession, isStoredSupabaseSessionValid } from "../auth/session.js";

// Assistente AI spento per i visitatori anonimi (decisione del 2026-11-01:
// risposte false e 7 scartate su 10). Stesso interruttore in ai-core
// (ANONYMOUS_AI_ENABLED): si riattiva solo dopo la suite delle risposte attese.
export const ANONYMOUS_AI_ENABLED = false;

export function canUseAssistant() {
  if (ANONYMOUS_AI_ENABLED) return true;
  const session = getStoredSupabaseSession();
  // Un token scaduto con refresh token e' ancora un cliente collegato: il bridge lo rinnova.
  return isStoredSupabaseSessionValid(session) || Boolean(session?.accessToken && (session.refreshToken || session.refresh_token));
}
