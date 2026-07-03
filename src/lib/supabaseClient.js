const SESSION_KEY = "vp_supabase_session";
export const AUTH_EXPIRED_MESSAGE = "Sessione scaduta. Accedi di nuovo per continuare.";

function supabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

export function hasSupabaseConfig() {
  const { url, anonKey } = supabaseEnv();
  return Boolean(url && anonKey);
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

function makeAuthTokenExpiredError(message = AUTH_EXPIRED_MESSAGE) {
  const error = new Error(message);
  error.code = "AUTH_TOKEN_EXPIRED";
  error.isAuthTokenExpired = true;
  return error;
}

export function clearExpiredSupabaseSession() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
  console.info("[AUTH_SESSION_CLEARED]");
}

export function requireFreshSupabaseSession({ action } = {}) {
  const session = getStoredSupabaseSession();
  if (!storedSessionToken(session)) return session;
  if (!isStoredSupabaseSessionExpired(session)) return session;
  console.warn("[AUTH_TOKEN_EXPIRED]", { action: action || null, reason: "local_exp_claim" });
  clearExpiredSupabaseSession();
  console.warn("[AUTH_RELOGIN_REQUIRED]", { action: action || null });
  throw makeAuthTokenExpiredError();
}

async function supabaseRequest(path, { method = "GET", body, session, prefer = "return=representation" } = {}) {
  const { url, anonKey } = supabaseEnv();
  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }
  const token = session?.accessToken || session?.access_token || anonKey;
  const usedSessionToken = Boolean(session?.accessToken || session?.access_token);
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
    const statusMessage = `${response.status} ${response.statusText || ""}`.trim();
    if (usedSessionToken && (response.status === 401 || isAuthTokenExpiredMessage(text) || isAuthTokenExpiredMessage(statusMessage))) {
      console.warn("[AUTH_TOKEN_EXPIRED]", { status: response.status, path });
      clearExpiredSupabaseSession();
      console.warn("[AUTH_RELOGIN_REQUIRED]", { path });
      throw makeAuthTokenExpiredError();
    }
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const supabase = hasSupabaseConfig()
  ? {
      from(table) {
        const state = {
          table,
          selectValue: "*",
          filters: [],
          orderValue: null,
          limitValue: null,
          singleValue: false,
          maybeSingleValue: false,
          method: "GET",
          body: null,
          upsert: null,
          notFilters: [],
        };
        const builder = {
          select(value = "*") { state.selectValue = value; return builder; },
          eq(column, value) { state.filters.push({ column, operator: "eq", value }); return builder; },
          neq(column, value) { state.filters.push({ column, operator: "neq", value }); return builder; },
          ilike(column, value) { state.filters.push({ column, operator: "ilike", value }); return builder; },
          not(column, operator, value) { state.notFilters.push({ column, operator, value }); return builder; },
          limit(value) { state.limitValue = value; return builder; },
          order(column, options = {}) { state.orderValue = { column, ascending: options.ascending !== false }; return builder; },
          single() { state.singleValue = true; return builder; },
          maybeSingle() { state.maybeSingleValue = true; return builder; },
          in(column, values) {
            const quoted = values.map(v => `"${v}"`).join(',');
            state.filters.push({ column, operator: "in", value: `(${quoted})` });
            return builder;
          },
          insert(values) {
            state.method = "POST";
            state.body = Array.isArray(values) ? values : [values];
            return builder;
          },
          update(values) {
            state.method = "PATCH";
            state.body = values;
            return builder;
          },
          upsert(values, { onConflict } = {}) {
            state.method = "POST";
            state.body = Array.isArray(values) ? values : [values];
            state.upsert = onConflict || true;
            return builder;
          },
          delete() {
            state.method = "DELETE";
            return builder;
          },
          async then(resolve) {
            try {
              const params = new URLSearchParams();
              if (state.method === "GET") {
                params.set("select", state.selectValue);
              }
              state.filters.forEach(({ column, operator, value }) => {
                if (operator === "in") {
                  params.append(column, `in.${value}`);
                } else {
                  params.append(column, `${operator}.${value}`);
                }
              });
              state.notFilters.forEach(({ column, operator, value }) => {
                params.append(column, `not.${operator}.${value}`);
              });
              if (state.orderValue) params.set("order", `${state.orderValue.column}.${state.orderValue.ascending ? "asc" : "desc"}`);
              if (state.limitValue) params.set("limit", state.limitValue);
              if (state.upsert) {
                const onConflict = typeof state.upsert === "string" ? state.upsert : "id";
                params.set("on_conflict", onConflict);
              }

              const preferParts = [];
              if (state.upsert) preferParts.push("resolution=merge-duplicates");
              if (state.method !== "GET") preferParts.push("return=representation");
              const prefer = preferParts.length ? preferParts.join(",") : null;

              const rows = await supabaseRequest(`/rest/v1/${state.table}?${params.toString()}`, {
                method: state.method,
                body: state.body,
                session: getStoredSupabaseSession(),
                prefer,
              });
              const isSingle = state.singleValue || state.maybeSingleValue;
              resolve({ data: isSingle ? (Array.isArray(rows) ? rows[0] || null : rows || null) : (rows || []), error: null });
            } catch (error) {
              const isSingle = state.singleValue || state.maybeSingleValue;
              resolve({ data: isSingle ? null : [], error });
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
        async signInWithOtp({ email, options } = {}) {
          const { url, anonKey } = supabaseEnv();
          try {
            const res = await fetch(`${url}/auth/v1/otp`, {
              method: "POST",
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email,
                create_user: true,
                type: "magiclink",
                options: options || {},
              }),
            });
            if (res.status === 429) {
              const err = new Error("429 Too Many Requests");
              err.status = 429;
              return { data: null, error: err };
            }
            if (!res.ok) {
              const text = await res.text();
              const err = new Error(text || "magic_link_failed");
              err.status = res.status;
              return { data: null, error: err };
            }
            return { data: {}, error: null };
          } catch (error) {
            return { data: null, error };
          }
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

  // The live `clienti` table has no user_id/updated_at columns — email is
  // the only reliable correlator. Look up by email first; insert only if
  // missing (no on_conflict/upsert, since a unique constraint on email
  // cannot be assumed on the live schema).
  const existing = await supabaseRequest(`/rest/v1/clienti?email=eq.${encodeURIComponent(email)}&select=*`, {
    session,
    prefer: null,
  });
  if (existing?.[0]) return existing[0];

  const createPayload = {
    email,
    nome: profile.nome || null,
    telefono: profile.telefono || null,
    azienda: profile.azienda || null,
  };
  if (import.meta.env.DEV) console.log("[CLIENT_AUTO_CREATE_PAYLOAD]", createPayload);
  try {
    const rows = await supabaseRequest("/rest/v1/clienti?select=*", {
      method: "POST",
      session,
      prefer: "return=representation",
      body: createPayload,
    });
    const created = rows?.[0] || null;
    if (import.meta.env.DEV) console.log("[CLIENT_AUTO_CREATE_SUCCESS]", created);
    return created;
  } catch (err) {
    if (import.meta.env.DEV) console.error("[CLIENT_AUTO_CREATE_ERROR]", err?.message || err);
    // Race: another request may have created the row between our SELECT and
    // INSERT — check once more rather than retrying the insert in a loop.
    const retry = await supabaseRequest(`/rest/v1/clienti?email=eq.${encodeURIComponent(email)}&select=*`, { session, prefer: null }).catch(() => []);
    if (retry?.[0]) return retry[0];
    throw err;
  }
}

export async function getCurrentClientProfile() {
  if (!hasSupabaseConfig()) return null;
  const user = await getCurrentSupabaseUser();
  if (!user?.email) return null;
  const rows = await supabaseRequest(`/rest/v1/clienti?email=eq.${encodeURIComponent(user.email)}&select=*`, {
    session: getStoredSupabaseSession(),
    prefer: null,
  });
  return rows?.[0] || { nome: user.email, email: user.email };
}

export async function listCampaigns() {
  if (!hasSupabaseConfig()) return [];
  return supabaseRequest("/rest/v1/campagne?select=*&order=created_at.desc", {
    session: getStoredSupabaseSession(),
    prefer: null,
  });
}

export async function getCampaignById(id) {
  if (!hasSupabaseConfig() || !id || id === "demo") return null;
  let campagna = null;
  try {
    const rows = await supabaseRequest(`/rest/v1/campaigns?id=eq.${encodeURIComponent(id)}&select=*`, {
      session: getStoredSupabaseSession(),
      prefer: null,
    });
    campagna = rows?.[0] || null;
    if (campagna) {
      const zones = await supabaseRequest(`/rest/v1/campaign_zones?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=zone_order.asc`, {
        session: getStoredSupabaseSession(),
        prefer: null,
      }).catch(() => []);
      campagna.campaignZones = zones || [];
    }
  } catch (err) {
    console.warn("Errore caricamento da tabella campaigns, fallback su legacy:", err);
  }

  if (!campagna) {
    const rows = await supabaseRequest(`/rest/v1/campagne?id=eq.${encodeURIComponent(id)}&select=*`, {
      session: getStoredSupabaseSession(),
      prefer: null,
    });
    campagna = rows?.[0] || null;
    if (campagna && campagna.metadata?.campaign_zones) {
      campagna.campaignZones = campagna.metadata.campaign_zones;
    }
  }

  if (!campagna) return null;
  const gps = await supabaseRequest(`/rest/v1/tracking_gps?campagna_id=eq.${encodeURIComponent(id)}&select=*&order=recorded_at.asc`, {
    session: getStoredSupabaseSession(),
    prefer: null,
  }).catch(() => []);
  return {...campagna, gps_punti: gps || [] };
}

export async function saveSmartPairingWaitlist(payload) {
  // Live schema for smart_pairing_waitlist has no telefono/status/preferred_period
  // columns (confirmed against the live REST schema) — only these are real:
  // id, cliente_id, email, note, created_at, nome, comune. "zone" from the
  // caller maps to the real "comune" column.
  const session = getStoredSupabaseSession();
  try {
    requireFreshSupabaseSession({ action: "smart_pairing" });
  } catch (err) {
    if (isAuthTokenExpiredError(err)) {
      console.warn("[SMART_PAIRING_BLOCKED_EXPIRED_SESSION]");
    }
    throw err;
  }

  // Best-effort: if the visitor happens to be logged in, resolve their
  // cliente_id and send their auth token — the live RLS policy may require
  // row ownership (cliente_id) and/or an authenticated request. This form is
  // also usable by anonymous visitors, so never force a login just to submit
  // a waitlist request — proceed without cliente_id if resolution fails.
  let clienteId = null;
  let cliente = null;
  if (session?.accessToken || session?.access_token) {
    try {
      cliente = await ensureCurrentClient({ email: payload.email });
      clienteId = cliente?.id || null;
    } catch {
      clienteId = null;
    }
  }

  // "nome" is NOT NULL on the live schema — always fill it via fallback chain.
  const nome = payload.nome || payload.name || cliente?.nome || payload.email || "Richiesta Smart Pairing";

  const finalPayload = {
    ...(clienteId ? { cliente_id: clienteId } : {}),
    nome,
    email: payload.email,
    comune: payload.zone || payload.comune || "Zona da confermare",
    note: payload.note || null,
  };
  if (import.meta.env.DEV) console.log("[SMART_PAIRING_WAITLIST_PAYLOAD]", finalPayload);
  try {
    const result = await supabaseRequest("/rest/v1/smart_pairing_waitlist", {
      method: "POST",
      session,
      prefer: "return=representation",
      body: finalPayload,
    });
    if (import.meta.env.DEV) console.log("[SMART_PAIRING_WAITLIST_SAVE_SUCCESS]", result);
    return result;
  } catch (err) {
    const msg = String(err?.message || err || "");
    const isRlsBlocked = /row-level security/i.test(msg) || /42501/.test(msg) || /permission denied/i.test(msg);
    if (isRlsBlocked) {
      console.error("[SMART_PAIRING_WAITLIST_RLS_BLOCKED]", { payload: finalPayload, error: msg });
      const rlsError = new Error("Richiesta Smart Pairing non salvata: permessi Supabase da configurare.");
      rlsError.isRlsBlocked = true;
      throw rlsError;
    }
    if (import.meta.env.DEV) console.error("[SMART_PAIRING_WAITLIST_SAVE_ERROR]", { payload: finalPayload, error: msg });
    throw err;
  }
}

export async function saveCampaign(payload) {
  try {
    return await saveCampaignInternal(payload);
  } catch (err) {
    console.error("[CAMPAIGN_SAVE_ERROR]", err?.message || err);
    throw err;
  }
}

const CAMPAGNE_CANDIDATE_COLUMNS = [
  "id",
  "cliente_id",
  "email",
  "zona",
  "comune",
  "servizio",
  "quantita",
  "flyer_quantity",
  "status",
  "stato",
  "totale_euro",
  "total_amount",
  "metadata",
  "created_at",
  "updated_at",
  "city_name",
  "campaign_type",
  "format",
  "material",
  "coverage_pct",
  "comuni_count",
];

let campagneSchemaColumnsCache = null;

async function getCampagneSchemaColumns() {
  if (campagneSchemaColumnsCache) return campagneSchemaColumnsCache;

  const checks = await Promise.all(
    CAMPAGNE_CANDIDATE_COLUMNS.map(async (column) => {
      try {
        await supabaseRequest(`/rest/v1/campagne?select=${encodeURIComponent(column)}&limit=1`, {
          session: null,
          prefer: null,
        });
        return [column, true];
      } catch {
        return [column, false];
      }
    })
  );

  campagneSchemaColumnsCache = checks.filter(([, exists]) => exists).map(([column]) => column);
  console.info("[CAMPAIGN_SCHEMA_COLUMNS_CHECKED]", {
    table: "campagne",
    existing: campagneSchemaColumnsCache,
    missing: checks.filter(([, exists]) => !exists).map(([column]) => column),
  });
  return campagneSchemaColumnsCache;
}

function addExistingColumn(body, columns, column, value) {
  if (!columns.includes(column) || value === undefined) return;
  body[column] = value;
}

function buildCampagnePayload(payload, cliente, campId, columns) {
  const body = {};
  const quantity = parseInt(payload.total_flyers ?? payload.flyer_quantity ?? payload.flyerQuantity ?? payload.quantity ?? 0, 10) || 0;
  const total = Number(payload.total_budget ?? payload.total_amount ?? payload.totalAmount ?? 0) || 0;
  const status = payload.stato || payload.status || "confermata";
  const service = payload.servizio || payload.service_type || payload.type || payload.campaign_type || "d2d";

  addExistingColumn(body, columns, "id", campId || undefined);
  addExistingColumn(body, columns, "cliente_id", cliente.id);
  addExistingColumn(body, columns, "email", payload.client?.email || cliente.email || undefined);
  addExistingColumn(body, columns, "zona", payload.city_name || payload.cityName || payload.zone || "Multi-zona");
  addExistingColumn(body, columns, "comune", payload.city_name || payload.cityName || payload.comune || undefined);
  addExistingColumn(body, columns, "servizio", service);
  addExistingColumn(body, columns, "quantita", quantity);
  addExistingColumn(body, columns, "flyer_quantity", quantity);
  addExistingColumn(body, columns, "status", status);
  addExistingColumn(body, columns, "stato", status);
  addExistingColumn(body, columns, "totale_euro", total);
  addExistingColumn(body, columns, "total_amount", total);
  addExistingColumn(body, columns, "city_name", payload.city_name || payload.cityName || "Multi-zona");
  addExistingColumn(body, columns, "campaign_type", service);
  addExistingColumn(body, columns, "format", payload.flyer_format || payload.flyerFormat || undefined);
  addExistingColumn(body, columns, "material", payload.material || undefined);
  addExistingColumn(body, columns, "coverage_pct", payload.coverage_pct || payload.coveragePct || undefined);
  addExistingColumn(body, columns, "comuni_count", payload.comuni_count || payload.comuniCount || undefined);
  addExistingColumn(body, columns, "created_at", new Date().toISOString());

  if (columns.includes("metadata")) {
    body.metadata = {
      ...payload.metadata,
      is_multi_zone: true,
      campaign_zones: payload.campaignZones || [],
      zone_ids: payload.zone_ids || [],
      flyer_format: payload.flyer_format || payload.flyerFormat || null,
      start_date: payload.start_date || payload.startDate || null,
      end_date: payload.end_date || payload.endDate || null,
      smart_pairing_discount: payload.smart_pairing_discount || 0,
      stato_pagamento: payload.stato_pagamento || "in_attesa",
      pagamento_tipo: payload.pagamento_tipo || "bonifico",
      causale_bonifico: payload.causale_bonifico || null,
    };
  }

  return body;
}

async function saveCampaignInternal(payload) {
  try {
    requireFreshSupabaseSession({ action: "save_campaign" });
  } catch (err) {
    if (isAuthTokenExpiredError(err)) {
      console.warn("[CAMPAIGN_SAVE_BLOCKED_EXPIRED_SESSION]");
    }
    throw err;
  }
  const cliente = await ensureCurrentClient(payload.client || {});
  if (!cliente?.id) throw new Error("Cliente Supabase non disponibile.");
  const session = getStoredSupabaseSession();
  const campagneColumns = await getCampagneSchemaColumns();

  let campId = null;
  let camp = null;
  try {
    const cRows = await supabaseRequest("/rest/v1/campaigns", {
      method: "POST",
      session: getStoredSupabaseSession(),
      prefer: "return=representation",
      body: {
        customer_id: cliente.id,
        title: payload.title || `Campagna ${payload.city_name || "Multi-zona"}`,
        campaign_type: payload.campaign_type || "standard",
        total_flyers: payload.total_flyers || payload.flyer_quantity || 0,
        total_budget: payload.total_budget || payload.total_amount || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    });
    camp = cRows?.[0] || null;
    campId = camp?.id;

    if (campId && payload.campaignZones && payload.campaignZones.length > 0) {
      const zonesToInsert = payload.campaignZones.map((z, idx) => ({
        campaign_id: campId,
        zone_order: idx + 1,
        service_type: z.service_type || z.serviceType || "d2d",
        service_variant: z.service_variant || z.serviceVariant || z.flyerFormat || "a5",
        zone_label: z.zone_label || z.zoneLabel || z.municipality_name || `Zona ${idx + 1}`,
        store_name: z.store_name || z.storeName || "",
        center_lat: z.city?.lat || z.center_lat || null,
        center_lng: z.city?.lng || z.center_lng || null,
        radius_km: parseFloat(z.radius ?? z.radius_km ?? z.selectedRadius ?? 3),
        municipality_code: z.municipality_code || z.municipalityCode || null,
        municipality_name: z.municipality_name || z.municipalityName || z.cityName || "",
        assigned_flyers: parseInt(z.assigned_flyers ?? z.assignedFlyers ?? z.flyerQuantity ?? z.qty ?? 0),
        assigned_budget: parseFloat(z.assigned_budget ?? z.assignedBudget ?? 0),
        coverage_percent: parseFloat(z.coverage_percent ?? z.coveragePercent ?? z.coverage ?? 0),
        recommended_flyers: parseInt(z.recommended_flyers ?? z.recommendedFlyers ?? 0),
        start_date: z.start_date || z.startDate || payload.start_date || null,
        end_date: z.end_date || z.endDate || payload.end_date || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await supabaseRequest("/rest/v1/campaign_zones", {
        method: "POST",
        session: getStoredSupabaseSession(),
        body: zonesToInsert,
      });
    }
  } catch (err) {
    console.error("Errore scrittura tabelle campaigns/campaign_zones:", err);
	}

  const legacyBody = buildCampagnePayload(payload, cliente, campId, campagneColumns);
  console.info("[CAMPAIGN_SAVE_PAYLOAD]", legacyBody);

  const legacyCamp = await supabaseRequest("/rest/v1/campagne", {
    method: "POST",
    session,
    prefer: "return=representation",
    body: legacyBody,
  });

  const savedRow = legacyCamp?.[0] || camp;
  console.info("[CAMPAIGN_SAVE_SUCCESS]", { table: "campagne", cliente_id: cliente.id });
  console.info("[CAMPAIGN_SAVE_ID]", savedRow?.id ?? null);
  return savedRow;
}

export async function confirmCampaignPayment(campagnaId) {
  if (!hasSupabaseConfig()) return null;
  return supabaseRequest(`/rest/v1/campagne?id=eq.${encodeURIComponent(campagnaId)}`, {
    method: "PATCH",
    session: getStoredSupabaseSession(),
    prefer: "return=representation",
    body: {
      stato_pagamento: "pagato",
      pagamento_confermato_at: new Date().toISOString(),
      status: "confermata",
      updated_at: new Date().toISOString(),
    },
  });
}
