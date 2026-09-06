// Nucleo puro (nessun import Deno) del proxy Overpass "rete stradale".
// Testabile da node:test via tsx — l'endpoint `road-network/index.ts` e' solo
// il guscio Deno (serve + rate limit + cache) sopra queste funzioni.
//
// Regole di sicurezza (ticket §5):
// - Gli endpoint Overpass sono HARDCODED qui/lato server, MAI passati dal
//   client.
// - Il client passa SOLO il poligono del confine (lista di vertici "lat lng").
//   La query Overpass QL e' costruita interamente lato server: il client non
//   puo' iniettare QL arbitrario.
// - Ogni input e' validato per forma e dimensione prima dell'uso.

export const ELIGIBLE_HIGHWAY_CLASSES = ['residential', 'living_street', 'unclassified', 'service'];

// Ordine di fallback provider (ticket §3). Il primo elemento e' rimpiazzato a
// runtime dall'endpoint di OVERPASS_ENDPOINT se configurato (vedi
// resolveEndpoints). Tutti pubblici, compatibili con la stessa Overpass QL.
export const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function resolveEndpoints(envEndpoint?: string | null): string[] {
  const list: string[] = [];
  const push = (u: unknown) => {
    const v = String(u || '').trim();
    if (v && /^https:\/\//i.test(v) && !list.includes(v)) list.push(v);
  };
  push(envEndpoint);
  for (const u of DEFAULT_OVERPASS_ENDPOINTS) push(u);
  return list;
}

// ── Validazione input ──────────────────────────────────────────────────────
export const POLY_MIN_VERTICES = 3;
export const POLY_MAX_VERTICES = 200;
export const POLY_MAX_CHARS = 8000;
export const MUNICIPALITY_MAX_CHARS = 120;

export type PolyValidation =
  | { ok: true; poly: string; vertices: number }
  | { ok: false; error: string };

/**
 * Il poligono arriva come stringa "lat lng lat lng ..." (spazio-separata),
 * gia' decimata client-side. Qui si accettano SOLO cifre, punto, meno e
 * spazio: qualunque tentativo di iniettare Overpass QL (`[`, `]`, `"`, `(`,
 * `;`, lettere) fa fallire la validazione.
 */
export function validatePoly(raw: unknown): PolyValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'POLY_NOT_STRING' };
  const poly = raw.trim().replace(/\s+/g, ' ');
  if (poly.length < 5) return { ok: false, error: 'POLY_TOO_SHORT' };
  if (poly.length > POLY_MAX_CHARS) return { ok: false, error: 'POLY_TOO_LONG' };
  if (!/^[0-9 .\-]+$/.test(poly)) return { ok: false, error: 'POLY_INVALID_CHARS' };

  const tokens = poly.split(' ');
  if (tokens.length % 2 !== 0) return { ok: false, error: 'POLY_ODD_TOKENS' };
  const vertices = tokens.length / 2;
  if (vertices < POLY_MIN_VERTICES) return { ok: false, error: 'POLY_TOO_FEW_VERTICES' };
  if (vertices > POLY_MAX_VERTICES) return { ok: false, error: 'POLY_TOO_MANY_VERTICES' };

  for (let i = 0; i < tokens.length; i += 2) {
    const lat = Number(tokens[i]);
    const lng = Number(tokens[i + 1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'POLY_NON_NUMERIC' };
    if (lat < -90 || lat > 90) return { ok: false, error: 'POLY_LAT_OUT_OF_RANGE' };
    if (lng < -180 || lng > 180) return { ok: false, error: 'POLY_LNG_OUT_OF_RANGE' };
  }
  return { ok: true, poly, vertices };
}

export function sanitizeMunicipality(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MUNICIPALITY_MAX_CHARS);
}

// ── Query builder (server-controlled) ──────────────────────────────────────
export function buildRoadQuery(poly: string): string {
  const classes = ELIGIBLE_HIGHWAY_CLASSES.join('|');
  return `[out:json][timeout:25];\n(\n  way["highway"~"^(${classes})$"](poly:"${poly}");\n);\nout geom;`;
}

// ── Fallback multi-provider con timeout per provider ───────────────────────
export type FetchLike = (url: string, init: any) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

export type RoadFetchResult = { elements: any[]; endpointIndex: number; attempts: number };

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 504 || (status >= 500 && status <= 599);
}

/**
 * Prova gli endpoint in ordine. Per ogni endpoint: timeout dedicato via
 * AbortController. Passa al successivo su timeout / 429 / 5xx / errore di
 * rete. Non aspetta mai indefinitamente. Se TUTTI falliscono lancia
 * `ROAD_NETWORK_UNAVAILABLE` (con `.attempts` = numero di tentativi).
 *
 * `deadlineMs` (opzionale, epoch ms assoluto — usato SOLO da poi-search, non da
 * road-network): budget TOTALE per l'intera cascata di provider. Prima di ogni
 * provider si controlla il tempo residuo; il timeout del singolo provider viene
 * ridotto a quel residuo. Superata la deadline si smette (nessun altro
 * provider) e si lancia con `.deadlineExceeded = true`. Serve a garantire un
 * tempo di risposta massimo per un arricchimento opzionale (POI) invece di
 * sommare N timeout per-provider.
 */
export async function fetchRoadsWithFallback(opts: {
  fetchImpl: FetchLike;
  endpoints: string[];
  query: string;
  timeoutMs: number;
  deadlineMs?: number;
  AbortCtor?: typeof AbortController;
}): Promise<RoadFetchResult> {
  const { fetchImpl, endpoints, query, timeoutMs, deadlineMs } = opts;
  const AC = opts.AbortCtor || AbortController;
  const MIN_PROVIDER_MS = 700;
  if (!endpoints.length) {
    const e: any = new Error('ROAD_NETWORK_UNAVAILABLE');
    e.attempts = 0;
    throw e;
  }
  const body = `data=${encodeURIComponent(query)}`;
  let attempts = 0;
  let lastError: any = null;

  for (let i = 0; i < endpoints.length; i += 1) {
    // Budget totale esaurito: non provare altri provider.
    if (deadlineMs != null) {
      const remaining = deadlineMs - Date.now();
      if (remaining <= MIN_PROVIDER_MS) {
        const e: any = new Error('OVERPASS_TIMEOUT');
        e.attempts = attempts;
        e.deadlineExceeded = true;
        e.cause = lastError;
        throw e;
      }
    }
    attempts += 1;
    const effectiveTimeout = deadlineMs != null
      ? Math.max(MIN_PROVIDER_MS, Math.min(timeoutMs, deadlineMs - Date.now()))
      : timeoutMs;
    const ctrl = new AC();
    const timer = setTimeout(() => ctrl.abort(), effectiveTimeout);
    try {
      const res = await fetchImpl(endpoints[i], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VolantiniPro/1.0 (road-network proxy)',
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        if (isRetriableStatus(res.status)) {
          lastError = new Error(`OVERPASS_HTTP_${res.status}`);
          continue;
        }
        // 4xx non-retriabile (query malformata ecc.): inutile insistere sugli
        // altri provider con la stessa query.
        const e: any = new Error(`OVERPASS_HTTP_${res.status}`);
        e.attempts = attempts;
        e.fatal = true;
        throw e;
      }
      const data = await res.json();
      return { elements: Array.isArray(data?.elements) ? data.elements : [], endpointIndex: i, attempts };
    } catch (err: any) {
      if (err?.fatal) throw err;
      lastError = err?.name === 'AbortError' ? new Error('OVERPASS_TIMEOUT') : err;
    } finally {
      clearTimeout(timer);
    }
  }

  const e: any = new Error('ROAD_NETWORK_UNAVAILABLE');
  e.attempts = attempts;
  e.cause = lastError;
  throw e;
}

// ── Cache TTL in-memory (per il guscio Deno; istanza warm) ─────────────────
export function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function makeCacheKey(municipality: string, poly: string): string {
  return `${municipality || '-'}::${djb2(poly)}`;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 200) {
  const store = new Map<string, { value: T; expires: number }>();
  return {
    get(key: string): T | null {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() > hit.expires) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key: string, value: T): void {
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    get size() {
      return store.size;
    },
  };
}
