// poi-search — guscio Vercel (Node) del proxy Overpass "attivita' / POI" di
// Step 2. Gemello 1:1 di supabase/functions/poi-search/index.ts (guscio Deno):
// stesso payload, stesse risposte, stessi budget/timeout, stesse cache e
// stesso rate limit. La logica vive nei moduli condivisi, importati tali e
// quali (nessun motore duplicato):
//   supabase/functions/_shared/poiSearchProxy.ts   (validazione, QL, provider)
//   supabase/functions/_shared/roadNetworkProxy.ts (fallback, cache TTL)
//
// Perche' esiste: dal runtime Supabase i mirror Overpass rispondono 403/406
// (diagnosi POI 2026-09-30), mentre le stesse query da una rete normale
// rispondono 200. Questo endpoint esegue le STESSE richieste da Vercel.
//
// Sicurezza (invariata rispetto all'Edge Function):
// - NON e' un open proxy: il client passa solo { centerLat, centerLng,
//   radiusKm, serviceType, targetSelection }; la Overpass QL e gli endpoint
//   sono costruiti/hardcoded lato server.
// - Rate limit in-memory per IP, cache TTL in-memory per istanza warm.
// - Nessun secret, nessun accesso DB.
import {
  createTtlCache,
  fetchRoadsWithFallback,
} from "../supabase/functions/_shared/roadNetworkProxy.js";
import {
  buildPoiQuery,
  classifyPoiFailure,
  getServiceTargetTags,
  isTransientPoiFailure,
  makePoiCacheKey,
  resolvePoiEndpoints,
  resultCap,
  validatePoiInput,
} from "../supabase/functions/_shared/poiSearchProxy.js";

declare const process: any;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function envInt(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function headerValue(headers: any, name: string): string {
  const v = headers?.[name];
  return Array.isArray(v) ? String(v[0] || "") : String(v || "");
}

const round3 = (n: number) => Number(n.toFixed(3));

/**
 * Factory (per i test: fetch/env iniettabili, cache e rate limit isolati per
 * istanza). In produzione si usa l'handler di default in fondo al file.
 */
export function createPoiSearchHandler(deps: { fetchImpl?: any; env?: Record<string, string | undefined>; log?: (line: string) => void } = {}) {
  const env = deps.env || (typeof process !== "undefined" ? process.env : {}) || {};
  const fetchImpl = deps.fetchImpl || ((url: string, init: any) => fetch(url, init));
  const log = deps.log || ((line: string) => console.log(line));

  // ── Rate limiting in-memory per IP (stessi default dell'Edge Function) ────
  const RATE_LIMIT_MAX = envInt(env, "POI_SEARCH_RATE_MAX", 40, 1, 300);
  const RATE_LIMIT_WINDOW_MS = envInt(env, "POI_SEARCH_RATE_WINDOW_MS", 60000, 1000, 3600000);
  const rateBuckets = new Map<string, { windowStart: number; count: number }>();

  function clientKey(req: any): string {
    const fwd = headerValue(req.headers, "x-forwarded-for").split(",")[0].trim();
    return fwd || headerValue(req.headers, "x-real-ip").trim() || "unknown";
  }
  function consumeRateLimit(req: any): { allowed: boolean; retryAfterSeconds: number } {
    const key = clientKey(req);
    const now = Date.now();
    const cur = rateBuckets.get(key);
    if (!cur || now - cur.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateBuckets.set(key, { windowStart: now, count: 1 });
      if (rateBuckets.size > 5000) { // evita crescita illimitata su istanza warm
        for (const [k, v] of rateBuckets) if (now - v.windowStart >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(k);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (cur.count >= RATE_LIMIT_MAX) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - cur.windowStart)) / 1000)) };
    }
    cur.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // ── Cache / budget: stessi nomi env e stessi default dell'Edge Function ───
  const CACHE_TTL_MS = envInt(env, "POI_SEARCH_CACHE_TTL_MS", 3600000, 60000, 86400000);
  const TOTAL_BUDGET_MS = envInt(env, "POI_SEARCH_TOTAL_BUDGET_MS", 16000, 1500, 30000);
  const PROVIDER_TIMEOUT_MS = envInt(env, "POI_SEARCH_TIMEOUT_MS", 8500, 1000, 20000);
  const RETRY_BACKOFF_MS = envInt(env, "POI_SEARCH_RETRY_BACKOFF_MS", 300, 0, 2000);
  const STALE_TTL_MS = envInt(env, "POI_SEARCH_STALE_TTL_MS", 86400000, 3600000, 604800000);
  const NEGATIVE_TTL_MS = envInt(env, "POI_SEARCH_NEGATIVE_TTL_MS", 10000, 2000, 600000);
  const poiCache = createTtlCache<any[]>(CACHE_TTL_MS);
  const poiStaleCache = createTtlCache<any[]>(STALE_TTL_MS, 400);
  const poiNegativeCache = createTtlCache<{ reason: string }>(NEGATIVE_TTL_MS, 400);

  const safeLog = (payload: Record<string, unknown>) => {
    try { log(JSON.stringify({ tag: "poi-search", runtime: "vercel", ...payload })); } catch { /* no-op */ }
  };

  function send(res: any, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
    for (const [k, v] of Object.entries({ ...corsHeaders, "Content-Type": "application/json", ...extraHeaders })) res.setHeader(k, v);
    res.status(status);
    res.end(JSON.stringify(body));
  }

  // Degrado NON bloccante: sempre HTTP 200 con lista vuota + flag (o stale).
  const degradedBody = (reason: string, elements: any[] = [], debugErr?: any) => ({
    elements,
    ok: false,
    degraded: true,
    temporaryUnavailable: elements.length === 0,
    stale: elements.length > 0,
    cached: elements.length > 0,
    source: elements.length > 0 ? "cache" : "none",
    reason,
    ...(debugErr ? { debug: String(debugErr?.message || debugErr), attemptsLog: debugErr?.attemptsLog } : {}),
  });

  return async function handler(req: any, res: any) {
    if (req.method === "OPTIONS") {
      for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
      res.status(200);
      return res.end("ok");
    }
    if (req.method !== "POST") return send(res, 405, { error: "METHOD_NOT_ALLOWED" });

    const rl = consumeRateLimit(req);
    if (!rl.allowed) return send(res, 429, { error: "RATE_LIMITED" }, { "Retry-After": String(rl.retryAfterSeconds) });

    // Vercel parsa il body JSON; un JSON malformato lancia all'accesso.
    let raw: any;
    try {
      raw = req.body;
      if (typeof raw === "string") raw = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "INVALID_JSON" });
    }
    if (raw == null) return send(res, 400, { error: "INVALID_JSON" });

    const check = validatePoiInput(raw);
    // Confronto esplicito: senza strictNullChecks (build Vercel senza tsconfig)
    // `!check.ok` non restringe l'unione e `check.error` risulta inesistente.
    if (check.ok === false) return send(res, 400, { error: "INVALID_INPUT", detail: check.error });
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
    const endpoints = resolvePoiEndpoints(env.POI_OVERPASS_ENDPOINT || env.OVERPASS_ENDPOINT);
    const center = [round3(input.centerLat), round3(input.centerLng)];

    const cached = poiCache.get(cacheKey);
    if (cached) {
      safeLog({ outcome: "cache_fresh", serviceType: input.serviceType, center, radiusKm: input.radiusKm, targets: input.targetSelection, count: cached.length });
      return send(res, 200, { elements: cached, cached: true, source: "cache" });
    }

    // Cache negativa: la stessa bbox ha appena fallito -> stale o degrado subito.
    const negative = poiNegativeCache.get(cacheKey);
    if (negative) {
      const staleForNeg = poiStaleCache.get(cacheKey);
      safeLog({ outcome: "negative_cache", reason: negative.reason, serviceType: input.serviceType, center, radiusKm: input.radiusKm, elapsedMs: Date.now() - t0, count: staleForNeg?.length ?? 0 });
      return send(res, 200, degradedBody(negative.reason, staleForNeg ?? []));
    }

    const deadline = t0 + TOTAL_BUDGET_MS;
    const runFallback = () => fetchRoadsWithFallback({
      fetchImpl,
      endpoints,
      query,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      deadlineMs: deadline,
    });

    let lastErr: any = null;
    // Passata 1 + retry unico (solo transitori, solo se resta budget).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await runFallback();
        poiCache.set(cacheKey, result.elements);
        poiStaleCache.set(cacheKey, result.elements);
        // Lista vuota = esito valido ("zero attivita' reali"): 200, MAI errore.
        safeLog({ outcome: "ok", serviceType: input.serviceType, center, radiusKm: input.radiusKm, targets: input.targetSelection, providers: endpoints.length, provider: endpoints[result.endpointIndex], elapsedMs: Date.now() - t0, count: result.elements.length, retried: attempt > 0 });
        return send(res, 200, { elements: result.elements, cached: false, source: "live" });
      } catch (err: any) {
        lastErr = err;
        const budgetLeft = deadline - Date.now();
        if (attempt === 0 && isTransientPoiFailure(err) && !err?.deadlineExceeded && budgetLeft > PROVIDER_TIMEOUT_MS * 0.6) {
          await new Promise((r) => setTimeout(r, Math.min(RETRY_BACKOFF_MS, Math.max(0, budgetLeft - 200))));
          continue;
        }
        break;
      }
    }

    const reason = classifyPoiFailure(lastErr);
    const attempts = Number.isFinite(lastErr?.attempts) ? lastErr.attempts : undefined;

    // bad_request = query rifiutata da TUTTI i provider: 400, nessun degrado.
    if (reason === "bad_request") {
      safeLog({ outcome: "bad_request", reason, serviceType: input.serviceType, elapsedMs: Date.now() - t0, attempts, error: String(lastErr?.message || lastErr) });
      return send(res, 400, { error: "POI_SEARCH_UNAVAILABLE", reason, detail: String(lastErr?.message || lastErr), ...(attempts != null ? { attempts } : {}) });
    }

    poiNegativeCache.set(cacheKey, { reason });
    const stale = poiStaleCache.get(cacheKey);
    safeLog({ outcome: stale ? "degraded_stale" : "degraded_empty", reason, serviceType: input.serviceType, center, radiusKm: input.radiusKm, providers: endpoints.length, elapsedMs: Date.now() - t0, attempts, count: stale?.length ?? 0 });
    return send(res, 200, degradedBody(reason, stale ?? [], lastErr));
  };
}

export default createPoiSearchHandler();
