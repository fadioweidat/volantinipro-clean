// Intento di login (dove l'utente VUOLE andare) per il callback del magic link. Modulo puro, senza rete, DOM o import.meta: testabile sotto
// `node --test`.
//
// SICUREZZA: nulla qui concede privilegi. Il context ("admin", ...) esprime solo
// la destinazione voluta; la callback (LoginPage) manda a /admin solo con intento
// Admin E ruolo verificato dal backend (verifySupabaseAdminRole / jwt_is_admin), e
// /admin resta protetto da AdminGuard (allowlist email + jwt_is_admin). Un
// ?context=admin forgiato da un account non-admin porta alla dashboard cliente.

export const AUTH_CALLBACK_PATH = "/auth/callback";

// Path di ritorno del magic link. Il context viaggia nel link stesso (non solo
// in localStorage, che esiste solo nel browser che ha richiesto il link): un link
// Admin aperto su un altro browser/dispositivo (es. telefono) mantiene l'intento.
// Solo il valore fisso "admin" viene serializzato: nessun input libero finisce
// nell'URL (nessun open redirect, nessuna injection nel redirect_to).
export function buildAuthCallbackPath(context) {
  return context === "admin" ? `${AUTH_CALLBACK_PATH}?context=admin` : AUTH_CALLBACK_PATH;
}

// Precedenza: ?context= nella query, poi il context ricordato all'invio del
// magic link. Valori fuori allowlist ricadono su "customer".
export function resolveLoginContext({ queryContext = null, pendingContext = null } = {}) {
  if (queryContext === "admin") return "admin";
  if (queryContext === "customer") return "customer";
  if (queryContext === "driver") return "driver";
  if (pendingContext === "admin") return "admin";
  if (pendingContext === "driver") return "driver";
  if (queryContext === "supplier" || pendingContext === "supplier") return "supplier";
  return "customer";
}
