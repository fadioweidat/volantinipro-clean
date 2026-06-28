const SESSION_KEY = "vp_supabase_session";

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
  const rows = await supabaseRequest("/rest/v1/clienti?on_conflict=user_id&select=*", {
    method: "POST",
    session,
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      user_id: user.id,
      email,
      nome: profile.nome || null,
      telefono: profile.telefono || null,
      azienda: profile.azienda || null,
      updated_at: new Date().toISOString(),
    },
  });
  return rows?.[0] || null;
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
  const cliente = await ensureCurrentClient(payload.client || {});
  if (!cliente?.id) throw new Error("Cliente Supabase non disponibile.");

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

  const legacyBody = {
    cliente_id: cliente.id,
    service_type: payload.service_type || payload.type || "d2d",
    status: payload.status || "confermata",
    city_name: payload.city_name || "Multi-zona",
    zone_ids: payload.zone_ids || [],
    flyer_quantity: payload.total_flyers || payload.flyer_quantity || 0,
    flyer_format: payload.flyer_format || payload.flyerFormat || null,
    start_date: payload.start_date || payload.startDate || null,
    end_date: payload.end_date || payload.endDate || null,
    smart_pairing_discount: payload.smart_pairing_discount || 0,
    total_amount: payload.total_budget || payload.total_amount || 0,
    stato_pagamento: payload.stato_pagamento || "in_attesa",
    pagamento_tipo: payload.pagamento_tipo || "bonifico",
    causale_bonifico: payload.causale_bonifico || null,
    metadata: {
      ...payload.metadata,
      is_multi_zone: true,
      campaign_zones: payload.campaignZones || [],
    },
  };

  if (campId) {
    legacyBody.id = campId;
  }

  const legacyCamp = await supabaseRequest("/rest/v1/campagne", {
    method: "POST",
    session: getStoredSupabaseSession(),
    prefer: "return=representation",
    body: legacyBody,
  });

  return legacyCamp?.[0] || camp;
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
