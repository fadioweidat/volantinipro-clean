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
