export function getSupabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || "",
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ""
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
