// poi-search — proxy server-side + cache per le query Overpass "attivita' / POI"
// del configuratore Step2 (usePoi -> src/lib/services/poi-api.js -> src/api/
// poiSearch.js).
//
// Perche' esiste (ticket "FIX DEFINITIVO POI OVERPASS VIA PROXY"):
// il browser su www.volantinipro.it non puo' chiamare Overpass direttamente
// (overpass.kumi.systems -> CORS, overpass-api.de -> 504). Qui il browser
// chiama SOLO questo endpoint; il fetch verso Overpass e i suoi fallback
// avvengono lato server. Gemello di functions/road-network.
//
// Sicurezza (ticket §9):
// - NON e' un open proxy: il client passa solo { centerLat, centerLng,
//   radiusKm, serviceType, targetSelection }. La Overpass QL e' costruita
//   interamente lato server (buildPoiQuery); i tag key/val vengono da
//   un'allowlist server (POI_TAGS in _shared/poiSearchProxy.ts); gli endpoint
//   Overpass sono hardcoded in _shared/roadNetworkProxy.ts.
// - Validazione di tipo/range/forma su ogni campo.
// - Rate limit in-memory per IP (stesso pattern di road-network).
// - Cache TTL in-memory per (servizio + target + coord arrotondate).
// - Nessun secret: nessun service role. Nessun accesso DB / RLS.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createTtlCache,
  fetchRoadsWithFallback,
} from "../_shared/roadNetworkProxy.ts";
import {
  buildPoiQuery,
  getServiceTargetTags,
  makePoiCacheKey,
  resolvePoiEndpoints,
  resultCap,
  validatePoiInput,
} from "../_shared/poiSearchProxy.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// ── Rate limiting in-memory per IP (stesso pattern di road-network) ────────
const RATE_LIMIT_MAX = envInt("POI_SEARCH_RATE_MAX", 40, 1, 300);
const RATE_LIMIT_WINDOW_MS = envInt("POI_SEARCH_RATE_WINDOW_MS", 60000, 1000, 3600000);
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}
function consumeRateLimit(req: Request): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientKey(req);
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now - cur.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (cur.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - cur.windowStart)) / 1000)) };
  }
  cur.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// ── Cache TTL server-side (istanza warm) ──────────────────────────────────
const CACHE_TTL_MS = envInt("POI_SEARCH_CACHE_TTL_MS", 3600000, 60000, 86400000);
// 12s per provider (audit 502): un mirror lento/morto viene scartato in fretta;
// worst case 3 provider = 36s invece di 75s. Allineato a POI_OVERPASS_QL_TIMEOUT_S.
const PROVIDER_TIMEOUT_MS = envInt("POI_SEARCH_TIMEOUT_MS", 12000, 5000, 55000);
const poiCache = createTtlCache<any[]>(CACHE_TTL_MS);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const rl = consumeRateLimit(req);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const check = validatePoiInput(raw);
  if (!check.ok) return json({ error: "INVALID_INPUT", detail: check.error }, 400);
  const input = check.input;

  const tags = getServiceTargetTags(input.serviceType, input.targetSelection);
  const query = buildPoiQuery({
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    radiusKm: input.radiusKm,
    tags,
    cap: resultCap(input.serviceType),
  });
  const cacheKey = makePoiCacheKey(input);

  const cached = poiCache.get(cacheKey);
  if (cached) return json({ elements: cached, cached: true });

  try {
    const result = await fetchRoadsWithFallback({
      fetchImpl: fetch as any,
      endpoints: resolvePoiEndpoints(Deno.env.get("OVERPASS_ENDPOINT")),
      query,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });
    // Anche una lista vuota e' un esito valido ("zero attivita' reali"): la si
    // mette in cache e la si restituisce con 200, MAI come errore.
    poiCache.set(cacheKey, result.elements);
    return json({ elements: result.elements, cached: false });
  } catch (err: any) {
    // Mai propagare URL provider / stack al client: solo un codice generico.
    const attempts = Number.isFinite(err?.attempts) ? err.attempts : undefined;
    return json({ error: "POI_SEARCH_UNAVAILABLE", ...(attempts != null ? { attempts } : {}) }, 502);
  }
});
