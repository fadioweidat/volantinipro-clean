// road-network — proxy server-side + cache per le query Overpass "rete
// stradale reale" usate dall'editor copertura automatica (Admin:
// ZoneCoverageMap / CoverageAdjustmentPanel, tramite
// src/lib/geo/resolveRoadNetwork.js).
//
// Perche' esiste (ticket "FIX PRODUZIONE — OVERPASS CORS / 504"):
// il browser su www.volantinipro.it non puo' piu' chiamare Overpass
// direttamente (overpass.kumi.systems -> CORS, overpass-api.de -> 504).
// Qui il browser chiama SOLO questo endpoint; il fetch verso Overpass e i
// suoi fallback avvengono lato server.
//
// Sicurezza (ticket §5):
// - NON e' un open proxy: il client passa solo `municipality` (stringa) e
//   `poly` (lista vertici "lat lng" del confine, gia' decimata). La query
//   Overpass QL e' costruita interamente lato server (buildRoadQuery), gli
//   endpoint sono hardcoded in _shared/roadNetworkProxy.ts.
// - Validazione forma/dimensione su ogni input.
// - Rate limit in-memory per IP (stesso pattern di send-graphic-request).
// - Cache TTL in-memory per (municipality + hash della query) per non
//   martellare Overpass ad ogni click ed evitare i rate limit provider.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildRoadQuery,
  createTtlCache,
  fetchRoadsWithFallback,
  makeCacheKey,
  resolveEndpoints,
  sanitizeMunicipality,
  validatePoly,
} from "../_shared/roadNetworkProxy.ts";

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

// ── Rate limiting in-memory per IP (stesso pattern di send-graphic-request) ─
const RATE_LIMIT_MAX = envInt("ROAD_NETWORK_RATE_MAX", 30, 1, 300);
const RATE_LIMIT_WINDOW_MS = envInt("ROAD_NETWORK_RATE_WINDOW_MS", 60000, 1000, 3600000);
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

// ── Cache TTL server-side (istanza warm) ───────────────────────────────────
const CACHE_TTL_MS = envInt("ROAD_NETWORK_CACHE_TTL_MS", 3600000, 60000, 86400000);
const PROVIDER_TIMEOUT_MS = envInt("ROAD_NETWORK_TIMEOUT_MS", 25000, 5000, 55000);
const roadCache = createTtlCache<any[]>(CACHE_TTL_MS);

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
  if (!raw || typeof raw !== "object") return json({ error: "INVALID_BODY" }, 400);

  const polyCheck = validatePoly(raw.poly);
  if (!polyCheck.ok) return json({ error: "INVALID_POLY", detail: polyCheck.error }, 400);
  const municipality = sanitizeMunicipality(raw.municipality);

  const query = buildRoadQuery(polyCheck.poly);
  const cacheKey = makeCacheKey(municipality, polyCheck.poly);

  const cached = roadCache.get(cacheKey);
  if (cached) return json({ elements: cached, cached: true });

  try {
    const result = await fetchRoadsWithFallback({
      fetchImpl: fetch as any,
      endpoints: resolveEndpoints(Deno.env.get("OVERPASS_ENDPOINT")),
      query,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });
    roadCache.set(cacheKey, result.elements);
    return json({ elements: result.elements, cached: false });
  } catch (err: any) {
    // Mai propagare URL provider / stack al client: solo un codice generico.
    const attempts = Number.isFinite(err?.attempts) ? err.attempts : undefined;
    return json({ error: "ROAD_NETWORK_UNAVAILABLE", ...(attempts != null ? { attempts } : {}) }, 502);
  }
});
