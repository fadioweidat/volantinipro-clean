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
