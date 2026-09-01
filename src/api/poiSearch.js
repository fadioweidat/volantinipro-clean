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

/**
 * @param {{centerLat:number, centerLng:number, radiusKm:number, serviceType:'d2d'|'h2h'|'b2b', targetSelection?:string[]}} params
 * @returns {Promise<Array<object>>} elementi Overpass grezzi
 */
export async function fetchPoiSearchElements({ centerLat, centerLng, radiusKm, serviceType, targetSelection = [] }) {
  const base = readEnv('VITE_API_BASE_URL') || readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');
  const endpoint = base ? `${String(base).replace(/\/+$/, '')}/functions/v1/poi-search` : null;
  if (!endpoint) throw new Error('POI_SEARCH_UNAVAILABLE');

  const headers = { 'Content-Type': 'application/json' };
  if (anonKey && endpoint.includes('/functions/v1/')) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        centerLat,
        centerLng,
        radiusKm,
        serviceType,
        targetSelection: Array.isArray(targetSelection) ? targetSelection : [],
      }),
    });
  } catch {
    throw new Error('POI_SEARCH_UNAVAILABLE');
  }
  if (!res.ok) throw new Error('POI_SEARCH_UNAVAILABLE');

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('POI_SEARCH_UNAVAILABLE');
  }
  if (!data || !Array.isArray(data.elements)) throw new Error('POI_SEARCH_UNAVAILABLE');
  return data.elements;
}
