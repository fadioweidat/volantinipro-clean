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

// Stesso testo di ASSISTANT_OFF_TEXT in ai-core: arriva quando OpenAI non ha
// credito. La chat lo riconosce e lascia il posto ai contatti.
export const ASSISTANT_OFF_TEXT = "L'assistente non è disponibile in questo momento. Scrivici su WhatsApp +39 351 767 3737 o via email a info@volantinipro.it.";

let assistantOff = false;

export function isAssistantOff() {
  return assistantOff;
}

export function markAssistantOffIfNeeded(text) {
  if (typeof text === "string" && text.includes(ASSISTANT_OFF_TEXT)) assistantOff = true;
  return assistantOff;
}
