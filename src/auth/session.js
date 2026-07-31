export function getSupabaseEnv() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  const nodeEnv = (typeof process !== "undefined" && process.env) || {};
  return {
    url: env.VITE_SUPABASE_URL || nodeEnv.VITE_SUPABASE_URL || "",
    anonKey: env.VITE_SUPABASE_ANON_KEY || nodeEnv.VITE_SUPABASE_ANON_KEY || ""
  };
}

export function hasSupabaseConfig() {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey);
}

export function getStoredSupabaseSession() {
  try {
    return JSON.parse(localStorage.getItem("vp_supabase_session") || "null");
  } catch {
    return null;
  }
}

export function saveStoredSupabaseSession(sessionData) {
  localStorage.setItem("vp_supabase_session", JSON.stringify(sessionData));
}

export function clearStoredSupabaseSession() {
  localStorage.removeItem("vp_supabase_session");
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
  } catch {
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
// magic link: per il caso di errore Supabase non onora redirect_to (vedi
// sopra), quindi il parametro ?context=admin nella query non arriva indietro.
// sessionStorage (non localStorage) perche' l'intento vale solo per il
// tentativo di login corrente in questa tab.
const PENDING_AUTH_CONTEXT_KEY = "vp_pending_auth_context";

export function rememberPendingAuthContext(context) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_AUTH_CONTEXT_KEY, context);
  } catch {
    // sessionStorage non disponibile (es. modalita' privata): degrada
    // silenziosamente, il fallback restera' "customer".
  }
}

export function readPendingAuthContext() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_AUTH_CONTEXT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingAuthContext() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_AUTH_CONTEXT_KEY);
  } catch {
    // no-op
  }
}
