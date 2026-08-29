import { ensureSupabaseSessionBridge, supabase as sdkSupabase } from "../supabaseClient.js";

const SESSION_KEY = "vp_supabase_session";
export const AUTH_EXPIRED_MESSAGE = "Sessione scaduta. Accedi di nuovo per continuare.";

function supabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// url deve essere un http(s):// reale. Una build con env "Sensitive" non
// risolte (vercel build in locale) inlinea il placeholder "[SENSITIVE]":
// truthy ma non un URL. Trattandolo come "non configurato" il client shim
// resta null e supabaseRequest() lancia il suo errore controllato
// ("Supabase environment variables are not configured.") invece di un
// fetch("[SENSITIVE]/rest/v1/...") non gestito. Allineato al guard in
// ../supabaseClient.js.
export function hasSupabaseConfig() {
  const { url, anonKey } = supabaseEnv();
  return Boolean(url && anonKey && /^https?:\/\//i.test(String(url).trim()));
}

export function getStoredSupabaseSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function storedSessionToken(session = getStoredSupabaseSession()) {
  return session?.accessToken || session?.access_token || null;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string" || token.split(".").length < 2) return null;
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isStoredSupabaseSessionExpired(session = getStoredSupabaseSession()) {
  const payload = decodeJwtPayload(storedSessionToken(session));
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

function isAuthTokenExpiredMessage(message = "") {
  return /jwt expired|invalid jwt|token is expired|token has invalid claims|unable to parse or verify signature|401 unauthorized|403 invalid jwt/i.test(String(message));
}

export function isAuthTokenExpiredError(error) {
  return Boolean(error?.code === "AUTH_TOKEN_EXPIRED" || error?.isAuthTokenExpired || isAuthTokenExpiredMessage(error?.message));
}

export function clearExpiredSupabaseSession() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
  console.info("[AUTH_SESSION_CLEARED]");
}

function writeRestSessionFromSdkSession(sdkSession) {
  if (typeof window === "undefined" || !sdkSession?.access_token) return null;
  const next = {
    accessToken: sdkSession.access_token,
    access_token: sdkSession.access_token,
    refreshToken: sdkSession.refresh_token || "",
    refresh_token: sdkSession.refresh_token || "",
    expires_at: sdkSession.expires_at || null,
    expires_in: sdkSession.expires_in || null,
    token_type: sdkSession.token_type || "bearer",
    user: sdkSession.user || null,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  console.info("[AUTH_BRIDGE_REST_SESSION_UPDATED]");
  return next;
}

export async function ensureRestSessionFromSdk({ action } = {}) {
  console.info("[AUTH_BRIDGE_BEFORE_SAVE]", { action: action || null });
  try {
    await ensureSupabaseSessionBridge?.();
  } catch {
    // Best effort: the direct SDK getSession below is the source of truth here.
  }

  const stored = getStoredSupabaseSession();
  if (storedSessionToken(stored) && !isStoredSupabaseSessionExpired(stored)) return stored;

  const { data, error } = sdkSupabase?.auth?.getSession
    ? await sdkSupabase.auth.getSession()
    : { data: { session: null }, error: null };
  const sdkSession = data?.session || null;
  if (sdkSession?.access_token && !error) {
    console.info("[AUTH_BRIDGE_SDK_SESSION_FOUND]", { action: action || null });
    return writeRestSessionFromSdkSession(sdkSession);
  }

  console.warn("[AUTH_BRIDGE_NO_SESSION]", { action: action || null, error: error?.message || null });
  return stored || null;
}

async function supabaseRequest(path, { method = "GET", body, session, prefer = "return=representation" } = {}) {
  const { url, anonKey } = supabaseEnv();
  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }
  const token = session?.accessToken || session?.access_token || anonKey;
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",...(prefer ? { Prefer: prefer } : {}),
    },...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const supabase = hasSupabaseConfig()
  ? {
      from(table) {
        const state = { table, selectValue: "*", filters: [], orderValue: null, limitValue: null, singleValue: false };
        const builder = {
          select(value = "*") { state.selectValue = value; return builder; },
          eq(column, value) { state.filters.push({ column, operator: "eq", value }); return builder; },
          ilike(column, value) { state.filters.push({ column, operator: "ilike", value }); return builder; },
          limit(value) { state.limitValue = value; return builder; },
          order(column, options = {}) { state.orderValue = { column, ascending: options.ascending !== false }; return builder; },
          single() { state.singleValue = true; return builder; },
          async then(resolve) {
            try {
              const params = new URLSearchParams();
              params.set("select", state.selectValue);
              state.filters.forEach(({ column, operator, value }) => params.append(column, `${operator}.${value}`));
              if (state.orderValue) params.set("order", `${state.orderValue.column}.${state.orderValue.ascending ? "asc" : "desc"}`);
              if (state.limitValue) params.set("limit", state.limitValue);
              const rows = await supabaseRequest(`/rest/v1/${state.table}?${params.toString()}`, {
                session: getStoredSupabaseSession(),
                prefer: null,
              });
              resolve({ data: state.singleValue ? rows?.[0] || null : rows, error: null });
            } catch (error) {
              resolve({ data: state.singleValue ? null : [], error });
            }
          },
        };
        return builder;
      },
      rpc(name, body) {
        return {
          async then(resolve) {
            try {
              const res = await supabaseRequest(`/rest/v1/rpc/${name}`, {
                method: "POST",
                session: getStoredSupabaseSession(),
                prefer: null,
                body,
              });
              resolve({ data: res, error: null });
            } catch (error) {
              resolve({ data: null, error });
            }
          },
        };
      },
      auth: {
        async getUser() {
          const user = await getCurrentSupabaseUser();
          return { data: { user }, error: null };
        },
        async getSession() {
          const session = getStoredSupabaseSession();
          return { data: { session }, error: null };
        },
      },
    }
  : null;

export async function getCurrentSupabaseUser(session = getStoredSupabaseSession()) {
  if (!session?.accessToken && !session?.access_token) return null;
  return supabaseRequest("/auth/v1/user", { session, prefer: null });
}

export async function ensureCurrentClient(profile = {}) {
  const session = getStoredSupabaseSession();
  const user = await getCurrentSupabaseUser(session);
  if (!user?.id) throw new Error("Login Supabase richiesto per salvare la campagna.");
  const email = profile.email || user.email;
  const rows = await supabaseRequest("/rest/v1/profiles?on_conflict=id&select=*", {
    method: "POST",
    session,
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      id: user.id,
      full_name: profile.nome || email || null,
      phone: profile.telefono || null,
      company_name: profile.azienda || null,
      updated_at: new Date().toISOString(),
    },
  });
  return rows?.[0] || null;
}

export async function getCurrentClientProfile() {
  if (!hasSupabaseConfig()) return null;
  const user = await getCurrentSupabaseUser();
  if (!user?.id) return null;
  const rows = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=*`, {
    session: getStoredSupabaseSession(),
    prefer: null,
  });
  const row = rows?.[0] || null;
  return row ? { ...row, nome: row.full_name || row.company_name || null, email: user.email } : { nome: null, email: user.email };
}

export async function listCampaigns() {
  if (!hasSupabaseConfig()) return [];
  return supabaseRequest("/rest/v1/campaigns?select=*&order=created_at.desc", {
    session: getStoredSupabaseSession(),
    prefer: null,
  });
}

export async function getCampaignById(id) {
  if (!hasSupabaseConfig() || !id || id === "demo") return null;
  const rows = await supabaseRequest(`/rest/v1/campaigns?id=eq.${encodeURIComponent(id)}&select=*`, {
    session: getStoredSupabaseSession(), prefer: null,
  });
  const campagna = rows?.[0] || null;

  if (!campagna) return null;

  let gps = null;
  let gpsError = null;
  try {
    gps = await supabaseRequest(`/rest/v1/gps_tracking_points?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=recorded_at.asc`, {
      session: getStoredSupabaseSession(),
      prefer: null,
    });
  } catch (err) {
    gpsError = err;
  }

  const gpsRows = Array.isArray(gps) ? gps : [];
  return {
    ...campagna,
    gps_punti: gpsRows,
    gps_points_source: "gps_tracking_points",
    gps_points_unavailable: Boolean(gpsError),
    gps_points_error: gpsError ? gpsError.message || "GPS non disponibile." : null,
  };
}

export async function saveSmartPairingWaitlist(payload) {
  return supabaseRequest("/rest/v1/smart_pairing_waitlist", {
    method: "POST",
    prefer: "return=representation",
    body: {
      email: payload.email,
      telefono: payload.telefono || null,
      zone: payload.zone || "Zona da confermare",
      preferred_period: payload.preferred_period || null,
      note: payload.note || null,
      status: "open",
    },
  });
}

export async function saveCampaign(payload) {
  const profile = await ensureCurrentClient(payload.client || {});
  if (!profile?.id) throw new Error("Profilo Cliente Supabase non disponibile.");
  const metadata = {
    ...(payload.metadata || {}),
    campaign_zones: payload.campaignZones || [],
    payment_status: payload.stato_pagamento || null,
    payment_reference: payload.causale_bonifico || null,
    smart_pairing_discount: payload.smart_pairing_discount ?? null,
  };
  const canonicalStatus = ({ confermata: 'approved', in_preparazione: 'scheduled', in_distribuzione: 'in_progress', completata: 'completed' })[payload.status] || payload.status || 'draft';
  const cRows = await supabaseRequest("/rest/v1/campaigns", {
      method: "POST",
      session: getStoredSupabaseSession(),
      prefer: "return=representation",
      body: {
        user_id: profile.id,
        title: payload.title || `Campagna ${payload.city_name || "Multi-zona"}`,
        service_type: payload.service_type || payload.type || "d2d",
        status: canonicalStatus,
        city: payload.city_name || null,
        zone_name: payload.city_name || null,
        quantity: payload.total_flyers ?? payload.flyer_quantity ?? null,
        total_amount: payload.total_budget ?? payload.total_amount ?? null,
        start_date: payload.start_date || payload.startDate || null,
        end_date: payload.end_date || payload.endDate || null,
        client_name: payload.client?.nome || null,
        client_phone: payload.client?.telefono || null,
        client_email: payload.client?.email || null,
        metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    });
  return cRows?.[0] || null;
}

export async function confirmCampaignPayment(campagnaId) {
  if (!hasSupabaseConfig()) return null;
  const existing = await getCampaignById(campagnaId);
  if (!existing) return null;
  return supabaseRequest(`/rest/v1/campaigns?id=eq.${encodeURIComponent(campagnaId)}`, {
    method: "PATCH",
    session: getStoredSupabaseSession(),
    prefer: "return=representation",
    body: {
      metadata: { ...(existing.metadata || {}), payment_status: "pagato", payment_confirmed_at: new Date().toISOString() },
      // submit-campaign-request (Step4) crea sempre le campagne con status
      // "pending_review", mai "draft": senza includerlo qui la conferma
      // pagamento non promuoveva mai lo stato delle campagne reali arrivate
      // dallo Step4, bloccando l'intero flusso admin-grant-access a valle.
      status: (existing.status === 'draft' || existing.status === 'pending_review') ? 'approved' : existing.status,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function submitPublicCampaign(payload) {
  // La sessione dell'app vive nel client REST legacy. Prima di invocare la
  // function la replichiamo nel client SDK, cosi' il JWT autenticato arriva
  // nell'Authorization header e il backend puo' assegnare l'ownership reale.
  await ensureSupabaseSessionBridge();
  return sdkSupabase.functions.invoke('submit-campaign-request', { body: payload });
}

export async function adminGrantAccess(campaignId) {
  return sdkSupabase.functions.invoke('admin-grant-access', { body: { campaignId } });
}
