import { supabase } from "../supabaseClient.js";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "../lib/monitoring/errorLog.js";

const APP_SESSION_KEY = "vp_supabase_session";

export function getSupabaseEnv() {
  let url = "";
  let anonKey = "";
  try {
    url = import.meta.env.VITE_SUPABASE_URL || "";
    anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  } catch (e) {
    if (typeof process !== "undefined" && process.env) {
      url = process.env.VITE_SUPABASE_URL || "";
      anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
    }
  }
  return { url, anonKey };
}

export function hasSupabaseConfig() {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey);
}

export function getStoredSupabaseSession() {
  try {
    return JSON.parse(localStorage.getItem(APP_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveStoredSupabaseSession(sessionData) {
  localStorage.setItem(APP_SESSION_KEY, JSON.stringify(sessionData));
}

export function clearStoredSupabaseSession() {
  globalRestorePromise = null;
  localStorage.removeItem(APP_SESSION_KEY);
}

function toStoredSession(session) {
  if (!session?.access_token) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token || null,
    expiresAt: session.expires_at || null,
    tokenType: session.token_type || "bearer"
  };
}

let authStateSyncStarted = false;

// Mantiene la sessione REST storica dell'app allineata alla sessione ufficiale
// Supabase. TOKEN_REFRESHED sostituisce anche il refresh token ruotato: senza
// questo mirror /admin potrebbe continuare a usare un JWT ormai scaduto.
function ensureAuthStateSync() {
  if (!supabase || authStateSyncStarted || typeof window === "undefined") return;
  authStateSyncStarted = true;
  supabase.auth.onAuthStateChange((event, sdkSession) => {
    const stored = toStoredSession(sdkSession);
    if (stored) saveStoredSupabaseSession(stored);
    else if (event === "SIGNED_OUT") clearStoredSupabaseSession();
  });
}

// Source of truth per cold load/refresh: prima lascia che la SDK carichi la
// propria sessione persistita (getSession la rinnova se necessario), poi
// bridgea la sessione storica dell'app quando il callback manuale ha appena
// ricevuto access_token + refresh_token.
let globalRestorePromise = null;

export function restoreSupabaseSession(preferredSession = null) {
  if (!preferredSession && globalRestorePromise) {
    return globalRestorePromise;
  }

  const promise = _restoreSupabaseSession(preferredSession).finally(() => {
    // Dedup solo per le chiamate concorrenti in volo: una volta risolta,
    // la promise condivisa va sganciata subito, altrimenti ogni restore
    // successivo (anche a distanza di minuti/ore) riceverebbe per sempre
    // lo stesso risultato della primissima chiamata invece di rivalutare
    // lo stato reale della sessione.
    if (globalRestorePromise === promise) {
      globalRestorePromise = null;
    }
  });
  if (!preferredSession) {
    globalRestorePromise = promise;
  }
  return promise;
}

async function _restoreSupabaseSession(preferredSession = null) {
  const stored = preferredSession || getStoredSupabaseSession();

  if (!supabase) {
    if (isStoredSupabaseSessionValid(stored)) return stored;
    clearStoredSupabaseSession();
    return null;
  }

  ensureAuthStateSync();

  try {
    if (preferredSession) {
      const accessToken = preferredSession.accessToken || preferredSession.access_token;
      const refreshToken = preferredSession.refreshToken || preferredSession.refresh_token;
      if (!accessToken || !refreshToken) return null;
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error || !data?.session) return null;
      const normalized = toStoredSession(data.session);
      saveStoredSupabaseSession(normalized);
      return normalized;
    }

    const { data, error } = await supabase.auth.getSession();
    if (!error && data?.session) {
      const normalized = toStoredSession(data.session);
      saveStoredSupabaseSession(normalized);
      return normalized;
    }

    const accessToken = stored?.accessToken || stored?.access_token;
    const refreshToken = stored?.refreshToken || stored?.refresh_token;
    if (accessToken && refreshToken) {
      const bridged = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (!bridged.error && bridged.data?.session) {
        const normalized = toStoredSession(bridged.data.session);
        saveStoredSupabaseSession(normalized);
        return normalized;
      }
    }
  } catch (err) {
    // Una sessione che non puo' essere ripristinata non autorizza l'Admin
    // (comportamento invariato). Un'eccezione qui e' pero' anomala — non e'
    // il normale "nessuna sessione salvata" (quei rami sopra restituiscono
    // null senza mai lanciare), e' un fallimento reale della SDK/rete
    // durante getSession()/setSession(). Mai l'access/refresh token nel log
    // (mai letti in questo blocco: solo err?.message, gia' sanitizzato da
    // logError per pattern simili a JWT/apikey come ulteriore difesa).
    logError({
      category: ERROR_CATEGORIES.AUTH,
      module: "session_restore",
      message: err?.message || "Ripristino sessione fallito con eccezione",
      severity: ERROR_SEVERITY.WARNING,
    });
  }

  if (isStoredSupabaseSessionValid(stored)) return stored;
  clearStoredSupabaseSession();
  return null;
}

// Una sessione senza expiresAt e considerata valida (comportamento storico,
// invariato per non rompere sessioni salvate prima di questo fix).
export function isStoredSupabaseSessionValid(session) {
  if (!session || !session.accessToken) return false;
  const expiresAt = Number(session.expiresAt ?? session.expires_at ?? 0);
  if (!expiresAt) return true;
  return expiresAt * 1000 > Date.now();
}

// Verifica reale del ruolo Admin lato backend tramite l'RPC public.jwt_is_admin(),
// gia' presente in produzione (supabase/migrations/019_gps_tracking.sql) e usata
// per proteggere le RLS di delivery_sessions/gps_tracking_points (percorso GPS).
// Nessun ruolo viene dedotto lato client: la risposta arriva dal database,
// valutata sui claim reali del JWT dell'utente (auth.jwt() ->> 'role'/'app_role',
// oppure auth.role() = 'service_role'). Fallisce chiuso (nega l'accesso) su
// qualunque errore di rete, risposta non ok o valore diverso da true — non
// esiste un percorso in cui un errore viene interpretato come "e' admin".
export async function verifySupabaseAdminRole(session) {
  const { url, anonKey } = getSupabaseEnv();
  const token = session?.accessToken || session?.access_token;
  if (!url || !anonKey || !token) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/jwt_is_admin`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    if (!res.ok) return false;
    const result = await res.json();
    return result === true;
  } catch (err) {
    // Fail-closed invariato (return false). L'eccezione qui e' un
    // fallimento infrastrutturale reale (rete/DNS/CORS verso l'RPC
    // jwt_is_admin), non "l'utente non e' admin" — merita un log tecnico
    // distinto affinche' l'Admin possa accorgersi se il controllo ruolo
    // smette di funzionare per TUTTI, non solo per un utente non
    // autorizzato. Mai il token nel log (solo err?.message).
    logError({
      category: ERROR_CATEGORIES.AUTH,
      module: "admin_role_check",
      message: err?.message || "Verifica ruolo Admin fallita con eccezione",
      severity: ERROR_SEVERITY.CRITICAL,
    });
    return false;
  }
}

// Consuma l'hash #access_token=... lasciato da un magic link Supabase: lo
// persiste con lo stesso schema usato da DashboardPage, poi ripulisce l'URL
// cosi' il token non resta visibile/riusabile nella barra indirizzi o nella history.
export function consumeSupabaseAuthHash(cleanPath) {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  if (!accessToken) return null;
  const session = {
    accessToken,
    refreshToken: hash.get("refresh_token"),
    expiresAt: hash.get("expires_at"),
    tokenType: hash.get("token_type") || "bearer"
  };
  saveStoredSupabaseSession(session);
  window.history.replaceState(null, "", cleanPath || window.location.pathname);
  return session;
}

// Supabase reindirizza un magic link scaduto/gia' usato/non valido a
// {SITE_URL}#error=...&error_code=...&error_description=..., senza onorare il
// redirect_to originale (a differenza del caso di successo, che porta invece
// su {redirect_to}#access_token=...). Per questo il pathname puo' essere "/"
// invece di "/login": va rilevato indipendentemente dal path corrente, prima
// che il routing basato su pathname decida quale pagina mostrare.
export function hasSupabaseAuthHashError() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams((window.location.hash || "").replace(/^#/, "")).has("error");
}

// Anche il caso di SUCCESSO puo' atterrare su "/" invece che sul redirect_to
// richiesto: se l'URL di redirect non e' nell'allowlist "Redirect URLs" del
// progetto Supabase, il verify ripiega su SITE_URL e il token arriva come
// {SITE_URL}#access_token=.... Senza questo rilevamento il routing basato su
// pathname mostrerebbe la Homepage con il token ancora nell'hash, mai
// consumato (verificato dal vivo: e' esattamente il sintomo osservato).
export function hasSupabaseAuthHashToken() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams((window.location.hash || "").replace(/^#/, "")).has("access_token");
}

// Messaggio unico e leggibile per qualunque codice di errore restituito da
// Supabase per un magic link (scaduto, gia' usato, non valido, accesso
// negato): dal punto di vista dell'utente l'azione da fare e' sempre la
// stessa, richiedere un nuovo link.
export function parseSupabaseAuthHashError() {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const error = hash.get("error");
  if (!error) return null;
  return {
    error,
    errorCode: hash.get("error_code") || "",
    description: hash.get("error_description") || "",
    message: "Il magic link è scaduto o non è più valido."
  };
}

// Ripulisce l'hash di errore dalla barra indirizzi/history una volta letto,
// con lo stesso pattern di consumeSupabaseAuthHash.
export function clearSupabaseAuthHashError(cleanPath) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", cleanPath || window.location.pathname);
}

// Preserva l'intento (login Admin vs Cliente) attraverso il round-trip del
// magic link, quando Supabase atterra su SITE_URL senza la query
// ?context=... originale (errore, oppure successo con redirect_to fuori
// allowlist). localStorage e non sessionStorage: il link nella email si apre
// in una NUOVA tab, dove sessionStorage e' sempre vuoto — solo localStorage
// sopravvive al passaggio di tab sulla stessa origin. Il valore viene
// comunque pulito appena consumato (successo o errore) e la query
// ?context=..., quando presente, ha sempre la precedenza.
const PENDING_AUTH_CONTEXT_KEY = "vp_pending_auth_context";

export function rememberPendingAuthContext(context) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_AUTH_CONTEXT_KEY, context);
  } catch {
    // storage non disponibile (es. modalita' privata): degrada
    // silenziosamente, il fallback restera' "customer".
  }
}

export function readPendingAuthContext() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PENDING_AUTH_CONTEXT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingAuthContext() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_AUTH_CONTEXT_KEY);
  } catch {
    // no-op
  }
}

// Percorso a cui tornare dopo il login (es. /driver/tracking/<campaignId>):
// necessario perche' /driver/tracking/* e' un entry point standalone fuori
// da AppRouter (vedi src/main.jsx), quindi il ritorno dopo il magic link non
// puo' passare per goTo/onNav ma richiede una navigazione reale del browser.
// Stesso motivo e stesso storage di rememberPendingAuthContext: localStorage,
// non sessionStorage, per sopravvivere all'apertura del link email in una
// nuova tab.
const PENDING_AUTH_RETURN_PATH_KEY = "vp_pending_auth_return_path";

export function rememberPendingAuthReturnPath(path) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_AUTH_RETURN_PATH_KEY, path);
  } catch {
    // storage non disponibile: degrada al fallback "/" del chiamante.
  }
}

export function readPendingAuthReturnPath() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PENDING_AUTH_RETURN_PATH_KEY);
  } catch {
    return null;
  }
}

export function clearPendingAuthReturnPath() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_AUTH_RETURN_PATH_KEY);
  } catch {
    // no-op
  }
}

// Origin (es. http://192.168.0.105:5173) da cui e' partito il login Driver,
// salvato insieme a pendingAuthReturnPath: history.replaceState non puo' mai
// cambiare origin (solo path/query/hash), quindi se Supabase atterra su un
// origin DIVERSO da quello di partenza (SITE_URL configurato su un IP LAN
// diverso, o su localhost se raggiungibile), solo una navigazione reale verso
// origin+returnPath — non un semplice path relativo, che resterebbe
// sull'origin sbagliato — puo' riportare l'utente sull'host giusto.
const PENDING_AUTH_ORIGIN_KEY = "vp_pending_auth_origin";

export function rememberPendingAuthOrigin(origin) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_AUTH_ORIGIN_KEY, origin);
  } catch {
    // no-op
  }
}

export function readPendingAuthOrigin() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PENDING_AUTH_ORIGIN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingAuthOrigin() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_AUTH_ORIGIN_KEY);
  } catch {
    // no-op
  }
}
