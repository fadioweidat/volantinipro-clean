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

// createClient() (supabase-js) rifiuta un supabaseUrl che non inizia con
// http(s):// lanciando "Invalid supabaseUrl: Must be a valid HTTP or HTTPS
// URL." a tempo di valutazione del modulo. Questo modulo e' importato da ~30
// file (hook dashboard, servizi, pagine): se il costruttore lancia qui,
// l'intero bundle non si inizializza e l'app va in crash ("Impossibile
// caricare il programma", schermo bianco + Uncaught Error in console).
//
// Caso reale che l'ha innescato: le env VITE_* di produzione sono marcate
// "Sensitive" su Vercel; una build eseguita con `vercel build` in locale
// (vercel pull) riceve il placeholder letterale "[SENSITIVE]" al posto del
// valore vero, e Vite lo inlinea come URL. "[SENSITIVE]" e' truthy ma non e'
// un URL -> crash.
//
// Fail-safe: se l'URL non e' un http(s):// valido lo trattiamo come "non
// configurato" (supabase = null, gia' gestito da tutti i chiamanti con
// degradazione controllata) e logghiamo UNA riga chiara, senza mai stampare
// chiave o valori.
const isValidHttpUrl = (value) =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

let supabaseInstance = null;
if (supabaseUrl && supabaseKey && isValidHttpUrl(supabaseUrl)) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        // detectSessionInUrl: false — questo client non e' mai il consumatore
        // previsto dell'hash #access_token=... del magic link (vedi sotto: il
        // flusso reale e' interamente manuale via vp_supabase_session,
        // bridgeato qui SOLO dopo il fatto). Lasciato al default (true), la
        // detection automatica del GoTrue-js interno intercetta l'hash per
        // conto proprio, prima o in corsa con consumeSupabaseAuthHash() in
        // LoginPage: se vince lei, salva la sessione sotto la propria chiave
        // sb-<ref>-auth-token (mai letta dall'app) e ripulisce l'hash
        // dall'URL, lasciando l'app senza nulla da consumare — la route
        // ricade quindi su Home invece che su /dashboard. Riprodotto dal
        // vivo: risolve il bug "magic link torna alla Home".
        //
        // persistSession/autoRefreshToken esplicitati per rendere il
        // contratto di sessione verificabile: nel browser la SDK persiste
        // nella sua chiave standard sb-<project-ref>-auth-token e rinnova il
        // JWT prima della scadenza.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    // Non deve mai propagare: l'app deve poter caricare anche senza client.
    console.error('[SUPABASE_CLIENT_INIT_FAILED]', error?.message || String(error));
    supabaseInstance = null;
  }
} else if (supabaseUrl || supabaseKey) {
  console.error(
    '[SUPABASE_CONFIG_INVALID] VITE_SUPABASE_URL non e\' un URL http(s) valido: client Supabase disabilitato. Verificare le env di build.',
  );
}

export const supabase = supabaseInstance

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

// P0: quando supabase.auth.getUser() rifiuta il token bridgeato (access_token
// scaduto E refresh_token non piu' valido — /auth/v1/user 403 seguito da
// /auth/v1/token?grant_type=refresh_token 400, riprodotto dal vivo), il blob
// "vp_supabase_session" resta comunque in localStorage: nessun meccanismo lo
// invalidava, quindi DashboardPage continuava a mostrare "Sessione attiva"
// (badge basato solo sulla presenza del blob, mai sulla sua validita') mentre
// ogni query reale falliva silenziosamente. I chiamanti (useCliente,
// useCampagne) invocano questa funzione SOLO quando supabase.auth.getUser()
// restituisce un errore reale, cosi' da:
//   - ripulire la sessione bridgeata stale (mai il pending campaign claim,
//     che vive sotto una chiave separata e deve sopravvivere al logout)
//   - azzerare la cache in-memory cosi' un login successivo bridgea pulito
export function clearBridgedSupabaseSession() {
  try { localStorage.removeItem('vp_supabase_session') } catch {}
  bridgedAccessToken = null
}
