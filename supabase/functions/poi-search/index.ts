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
  classifyPoiFailure,
  getServiceTargetTags,
  isTransientPoiFailure,
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
// Un solo retry, solo per fallimenti transitori, con backoff breve.
const RETRY_BACKOFF_MS = envInt("POI_SEARCH_RETRY_BACKOFF_MS", 500, 0, 5000);
// Cache "stale": conserva l'ultimo risultato buono molto piu' a lungo del TTL
// fresco, per degradare senza 502 quando Overpass e' momentaneamente down.
const STALE_TTL_MS = envInt("POI_SEARCH_STALE_TTL_MS", 86400000, 3600000, 604800000);
const poiCache = createTtlCache<any[]>(CACHE_TTL_MS);
const poiStaleCache = createTtlCache<any[]>(STALE_TTL_MS, 400);

const safeLog = (payload: Record<string, unknown>) => {
  try { console.log(JSON.stringify({ tag: "poi-search", ...payload })); } catch { /* no-op */ }
};

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
  const t0 = Date.now();
  const endpoints = resolvePoiEndpoints(Deno.env.get("OVERPASS_ENDPOINT"));

  const cached = poiCache.get(cacheKey);
  if (cached) {
    safeLog({ outcome: "cache_fresh", serviceType: input.serviceType, center: [Number(input.centerLat.toFixed(3)), Number(input.centerLng.toFixed(3))], radiusKm: input.radiusKm, targets: input.targetSelection, count: cached.length });
    return json({ elements: cached, cached: true });
  }

  const runFallback = () => fetchRoadsWithFallback({
    fetchImpl: fetch as any,
    endpoints,
    query,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  });

  let lastErr: any = null;
  // Passata 1 + (retry unico solo se il fallimento e' transitorio).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await runFallback();
      poiCache.set(cacheKey, result.elements);
      poiStaleCache.set(cacheKey, result.elements);
      // Lista vuota = esito valido ("zero attivita' reali"): 200, MAI errore.
      safeLog({ outcome: "ok", serviceType: input.serviceType, center: [Number(input.centerLat.toFixed(3)), Number(input.centerLng.toFixed(3))], radiusKm: input.radiusKm, targets: input.targetSelection, providers: endpoints.length, elapsedMs: Date.now() - t0, count: result.elements.length, retried: attempt > 0 });
      return json({ elements: result.elements, cached: false });
    } catch (err: any) {
      lastErr = err;
      if (attempt === 0 && isTransientPoiFailure(err)) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
        continue;
      }
      break;
    }
  }

  const reason = classifyPoiFailure(lastErr);
  const attempts = Number.isFinite(lastErr?.attempts) ? lastErr.attempts : undefined;

  // §3/§6 — degrado: se Overpass e' momentaneamente giu' ma esiste un ultimo
  // risultato buono per la stessa zona/bbox, lo si restituisce con 200 e
  // `degraded/stale`, cosi' Step 2 (mappa, confine, territorio, quantita')
  // continua a funzionare. 502 solo se non c'e' NULLA da servire.
  const stale = reason !== "bad_request" ? poiStaleCache.get(cacheKey) : null;
  if (stale) {
    safeLog({ outcome: "degraded_stale", reason, serviceType: input.serviceType, center: [Number(input.centerLat.toFixed(3)), Number(input.centerLng.toFixed(3))], radiusKm: input.radiusKm, providers: endpoints.length, elapsedMs: Date.now() - t0, attempts, count: stale.length });
    return json({ elements: stale, cached: true, stale: true, degraded: true, reason });
  }

  safeLog({ outcome: "unavailable", reason, serviceType: input.serviceType, center: [Number(input.centerLat.toFixed(3)), Number(input.centerLng.toFixed(3))], radiusKm: input.radiusKm, providers: endpoints.length, elapsedMs: Date.now() - t0, attempts });
  const status = reason === "bad_request" ? 400 : reason === "rate_limited" ? 429 : 502;
  return json({ error: "POI_SEARCH_UNAVAILABLE", reason, ...(attempts != null ? { attempts } : {}) }, status);
});
