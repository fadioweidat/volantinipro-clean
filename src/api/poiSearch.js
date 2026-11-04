/* Client per l'Edge Function `poi-search`.
 *
 * Sostituisce il fetch diretto browser -> Overpass del path POI (bloccato in
 * produzione: un mirror pubblico risponde senza header CORS, l'altro va in
 * 504). Il browser chiama SOLO questo endpoint same-project; la query, il
 * fallback multi-provider, la cache e il rate limit vivono lato server
 * (supabase/functions/poi-search). Pattern identico a src/api/roadNetwork.js.
 *
 * - Passa solo { centerLat, centerLng, radiusKm, serviceType, targetSelection }.
 *   Mai un URL Overpass, mai QL arbitraria.
 * - Usa la anon key come gli altri client in src/api/*. Nessun secret.
 * - Contratto: risolve con `Array<elementoOverpass>` (grezzo, `out center`),
 *   pronto per toPoi/dedup/sort lato client; lancia
 *   `Error('POI_SEARCH_UNAVAILABLE')` su qualunque fallimento, cosi' che
 *   usePoi lo tratti come error-state (mai come "zero risultati").
 * - Timeout client (POI_SEARCH_CLIENT_TIMEOUT_MS, default 7s): i POI sono
 *   arricchimento opzionale, non devono mai tenere Step 2 in "loading" a
 *   lungo. Poco sopra il budget totale server (~4.5s) + latenza. Allo scadere
 *   si aborta e si lancia POI_SEARCH_UNAVAILABLE (degrado UI non bloccante).
 * - Il server puo' rispondere 200 con { temporaryUnavailable: true } (degrado
 *   senza stale): va trattato come fallimento, NON come "zero risultati".
 */

function readEnv(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] != null) {
      return import.meta.env[key];
    }
  } catch {
    /* import.meta non disponibile fuori da Vite (es. node:test) */
  }
  if (typeof process !== 'undefined' && process.env && process.env[key] != null) return process.env[key];
  return undefined;
}

// Copia locale (browser) degli ultimi POI verificati. Serve solo quando il
// server non ha dati: la risposta viene dichiarata come cache con la sua data,
// mai come dato aggiornato. Nessun dato lascia il browser.
const BROWSER_CACHE_PREFIX = 'vp-poi-cache:v1:';
const BROWSER_CACHE_MAX_ENTRIES = 12;
const BROWSER_CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function browserCacheKey({ centerLat, centerLng, radiusKm, serviceType, targetSelection }) {
  const targets = (Array.isArray(targetSelection) ? [...targetSelection] : []).sort().join(',') || '-';
  return `${BROWSER_CACHE_PREFIX}${serviceType}:${Number(centerLat).toFixed(3)},${Number(centerLng).toFixed(3)}:r${Math.round(Number(radiusKm) * 10) / 10}:${targets}`;
}

function browserStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function saveBrowserCopy(params, elements, fetchedAt, source) {
  const store = browserStorage();
  if (!store) return;
  try {
    const keys = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k && k.startsWith(BROWSER_CACHE_PREFIX)) keys.push(k);
    }
    const key = browserCacheKey(params);
    const others = keys.filter((k) => k !== key)
      .map((k) => { try { return [k, Date.parse(JSON.parse(store.getItem(k)).fetchedAt) || 0]; } catch { return [k, 0]; } })
      .sort((a, b) => a[1] - b[1]);
    while (others.length >= BROWSER_CACHE_MAX_ENTRIES) store.removeItem(others.shift()[0]);
    store.setItem(key, JSON.stringify({ fetchedAt, elements, source }));
  } catch {
    /* quota piena o storage bloccato: la copia locale e' facoltativa */
  }
}

function readBrowserCopy(params, now = Date.now()) {
  const store = browserStorage();
  if (!store) return null;
  try {
    const hit = JSON.parse(store.getItem(browserCacheKey(params)) || 'null');
    const at = Date.parse(hit?.fetchedAt);
    if (!Array.isArray(hit?.elements) || !Number.isFinite(at) || now - at > BROWSER_CACHE_MAX_AGE_MS) return null;
    return { elements: hit.elements, fetchedAt: hit.fetchedAt, source: typeof hit.source === 'string' ? hit.source : null };
  } catch {
    return null;
  }
}

/**
 * Come fetchPoiSearch, ma restituisce solo gli elementi (contratto storico).
 * @returns {Promise<Array<object>>} elementi Overpass grezzi
 */
export async function fetchPoiSearchElements(params) {
  return (await fetchPoiSearch(params)).elements;
}

/**
 * Tre esiti distinti:
 * - { elements, stale:false, fetchedAt }: POI letti ora da Overpass (o dalla
 *   cache fresca del server, entro un'ora). elements [] = zero confermato.
 * - { elements, stale:true, fetchedAt }: Overpass non risponde; ultimo dato
 *   verificato (server o copia locale), con la data della lettura.
 * - Error('POI_SEARCH_UNAVAILABLE'): nessun dato disponibile.
 * @param {{centerLat:number, centerLng:number, radiusKm:number, serviceType:'d2d'|'h2h'|'b2b', targetSelection?:string[]}} params
 */
export async function fetchPoiSearch(params) {
  try {
    const result = await fetchPoiSearchFromServer(params);
    if (!result.stale && result.fetchedAt) saveBrowserCopy(params, result.elements, result.fetchedAt, result.source);
    return result;
  } catch (err) {
    const copy = readBrowserCopy(params);
    if (copy) return { ...copy, stale: true };
    throw err;
  }
}

async function fetchPoiSearchFromServer({ centerLat, centerLng, radiusKm, serviceType, targetSelection = [] }) {
  const base = readEnv('VITE_API_BASE_URL') || readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');
  // Interruttore SOLO per i POI (VITE_API_BASE_URL e' condivisa da altri
  // client): se VITE_POI_SEARCH_URL e' impostata (es. "/api/poi-search",
  // endpoint Vercel gemello 1:1) si usa quella; altrimenti resta l'Edge
  // Function Supabase. Payload, risposta e gestione errori sono identici.
  const override = String(readEnv('VITE_POI_SEARCH_URL') || '').trim();
  // Il proxy Node e' disponibile sulle build Vercel anche senza override env.
  // In locale Vite non serve /api: resta il percorso Supabase.
  const vercelBuild = typeof __VERCEL_BUILD__ !== 'undefined' && __VERCEL_BUILD__;
  const endpoint = override || (vercelBuild ? '/api/poi-search' : (base ? `${String(base).replace(/\/+$/, '')}/functions/v1/poi-search` : null));
  if (!endpoint) throw new Error('POI_SEARCH_UNAVAILABLE');

  const headers = { 'Content-Type': 'application/json' };
  if (anonKey && endpoint.includes('/functions/v1/')) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  const clientTimeoutMs = Number(readEnv('POI_SEARCH_CLIENT_TIMEOUT_MS')) || 18000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), clientTimeoutMs) : null;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        centerLat,
        centerLng,
        radiusKm,
        serviceType,
        targetSelection: Array.isArray(targetSelection) ? targetSelection : [],
      }),
    });
  } catch {
    // include AbortError (timeout client): degrado non bloccante
    throw new Error('POI_SEARCH_UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) throw new Error('POI_SEARCH_UNAVAILABLE');

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('POI_SEARCH_UNAVAILABLE');
  }
  if (!data || !Array.isArray(data.elements)) throw new Error('POI_SEARCH_UNAVAILABLE');
  // Degrado server senza stale: 200 { elements: [], temporaryUnavailable: true }.
  // NON e' "zero attivita' reali" -> deve risultare error-state in usePoi
  // (badge "temporaneamente non disponibili"), non il badge "nessuna attivita'".
  if (data.temporaryUnavailable === true) throw new Error('POI_SEARCH_UNAVAILABLE');
  // Degrado con stale (elements popolati): si servono comunque, la mappa mostra
  // l'ultimo dato buono invece di svuotarsi, dichiarandone la data.
  const fetchedAt = typeof data.fetchedAt === 'string' ? data.fetchedAt : null;
  const source = typeof data.source === 'string' ? data.source : null;
  return { elements: data.elements, stale: data.stale === true, fetchedAt, source };
}
