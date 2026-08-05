import { createClient } from '@supabase/supabase-js'

// import.meta.env is always a real object under Vite (dev server and build),
// so reading .VITE_SUPABASE_URL directly off it is deterministic there. It is
// undefined when this module loads under the plain Node test runner (no Vite
// present), which the `env` fallback below accounts for.
let supabaseUrl = null;
let supabaseKey = null;
try {
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
} catch (e) {
  if (typeof process !== 'undefined' && process.env) {
    supabaseUrl = process.env.VITE_SUPABASE_URL;
    supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  }
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null

// The main app (volantinipro-final.jsx) authenticates via a separate
// lightweight REST client (src/lib/supabaseClient.js), storing the session
// under localStorage key "vp_supabase_session". This official SDK client is
// a DIFFERENT instance used only by the dashboard hooks (useCliente,
// useCampagne, useCampagnaDetail) — without bridging the session across,
// this client stays unauthenticated even right after a successful login, so
// any RLS-scoped select silently returns zero rows (dashboard looks empty
// even though saveCampaign just inserted the row via the other client).
let bridgedAccessToken = null
let bridgeInFlight = null
export async function ensureSupabaseSessionBridge() {
  if (!supabase) return
  try {
    const raw = localStorage.getItem('vp_supabase_session')
    if (!raw) return
    const stored = JSON.parse(raw)
    const accessToken = stored?.accessToken || stored?.access_token
    const refreshToken = stored?.refreshToken || stored?.refresh_token
    if (!accessToken || accessToken === bridgedAccessToken) return
    if (!bridgeInFlight) {
      bridgeInFlight = supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      }).then(({ error }) => {
        if (!error) bridgedAccessToken = accessToken
      }).finally(() => {
        bridgeInFlight = null
      })
    }
    await bridgeInFlight
  } catch {
    // best-effort bridge — queries fall back to anon/RLS-empty behavior
  }
}
