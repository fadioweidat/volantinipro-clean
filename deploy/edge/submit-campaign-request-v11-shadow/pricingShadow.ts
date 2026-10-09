// Phase 3B.4-P1 shadow pricing glue for the deployed submit-campaign-request v11.
// Shadow only: the result is stored in metadata.price_authorization for later analysis.
// It never rejects a request, never changes total_amount and never throws to the caller.
// Kill switch: PRICING_SHADOW_MODE=off (default: on). No 409 exists in this code.
import { computeShadowPricing } from "./_pricing/server/shadowPricing.js";

const SHADOW_TIMEOUT_MS = 1500;
const MUNICIPALITY_PAGE = 1000; // PostgREST max rows per request
const MUNICIPALITY_CACHE_MS = 6 * 60 * 60 * 1000;
let municipalityCache: { rows: any[]; at: number } | null = null;

/** Test hook: the municipality cache is per function instance (module scope). */
export function resetPricingShadowCache() {
  municipalityCache = null;
}

function shadowFailure(errorCode: string) {
  return { version: 1, mode: "shadow", enforcement: "none", computedAt: new Date().toISOString(), status: "error", classification: "error", errorCode };
}

export function createGeoLookup(supabase: any) {
  return {
    async municipalities() {
      if (municipalityCache && Date.now() - municipalityCache.at < MUNICIPALITY_CACHE_MS) return municipalityCache.rows;
      const rows: any[] = [];
      for (let from = 0; from < 20000; from += MUNICIPALITY_PAGE) {
        const { data, error } = await supabase
          .from("geo_municipalities")
          .select("municipality_code,municipality_name,density_per_km2")
          .order("municipality_code", { ascending: true })
          .range(from, from + MUNICIPALITY_PAGE - 1);
        if (error) throw new Error("GEO_LOOKUP_FAILED");
        rows.push(...(data || []));
        if (!data || data.length < MUNICIPALITY_PAGE) break;
      }
      municipalityCache = { rows, at: Date.now() };
      return rows;
    },
    // Codes of the municipalities whose PostGIS geometry contains the point (existing
    // read-only RPC, 1 m radius). null = unavailable (never treated as a match).
    async containing(lat: number, lng: number) {
      const { data, error } = await supabase.rpc("get_comuni_breakdown_in_radius", { p_lat: lat, p_lng: lng, p_radius_km: 0.001 });
      if (error || !Array.isArray(data)) return null;
      return data.map((r: any) => String(r.municipality_code));
    },
  };
}

export async function runPriceShadow(supabase: any, body: unknown) {
  const mode = String(Deno.env.get("PRICING_SHADOW_MODE") || "on").toLowerCase();
  if (mode === "off") return { version: 1, mode: "shadow", enforcement: "none", status: "disabled", classification: "disabled" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(shadowFailure("SHADOW_TIMEOUT")), SHADOW_TIMEOUT_MS); });
  try {
    const record: any = await Promise.race([computeShadowPricing(body, { lookup: createGeoLookup(supabase) }), timeout]);
    if (record && record.classification !== "match") {
      // Codes and cents only: never names, e-mails, phones or free text.
      console.warn("[price-shadow]", JSON.stringify({ classification: record.classification, status: record.status, deltaCents: record.deltaCents ?? null,
        issueCodes: record.issueCodes ?? [], errorCode: record.errorCode ?? null, pricingVersion: record.pricingVersion ?? null }));
    }
    return record;
  } catch {
    return shadowFailure("SHADOW_EXCEPTION");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The shadow record is kept in the database only: responses to the client never carry it. */
export function stripPriceShadow(row: any) {
  if (!row || typeof row !== "object" || !row.metadata || typeof row.metadata !== "object") return row;
  const { price_authorization: _omit, ...metadata } = row.metadata;
  return { ...row, metadata };
}
