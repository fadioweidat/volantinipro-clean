/* Client per l'Edge Function `road-network`.
 *
 * Sostituisce il fetch diretto browser -> Overpass (bloccato in produzione da
 * CORS su overpass.kumi.systems e 504 su overpass-api.de). Il browser chiama
 * SOLO questo endpoint same-project; il fallback multi-provider e la cache
 * vivono lato server (supabase/functions/road-network).
 *
 * - Passa solo `municipality` + `poly` (lista vertici "lat lng" del confine).
 *   Mai un URL Overpass, mai QL arbitrario.
 * - Usa la anon key come gli altri client in src/api/*. Nessun secret.
 * - Contratto: risolve con `Array<elementoOverpass>` (grezzo, `out geom`);
 *   lancia `Error('ROAD_NETWORK_UNAVAILABLE')` su qualunque fallimento, cosi'
 *   che resolveRoadNetwork.js lo mappi a `null` (nessuna traccia finta).
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

export async function fetchRoadNetworkElements({ municipality, poly }) {
  const base = readEnv('VITE_API_BASE_URL') || readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');
  const explicit = readEnv('VITE_ROAD_NETWORK_URL');
  const endpoint = explicit || (base ? `${String(base).replace(/\/+$/, '')}/functions/v1/road-network` : null);
  if (!endpoint) throw new Error('ROAD_NETWORK_UNAVAILABLE');

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
      body: JSON.stringify({ municipality: municipality || null, poly }),
    });
  } catch {
    throw new Error('ROAD_NETWORK_UNAVAILABLE');
  }
  if (!res.ok) throw new Error('ROAD_NETWORK_UNAVAILABLE');

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('ROAD_NETWORK_UNAVAILABLE');
  }
  if (!data || !Array.isArray(data.elements)) throw new Error('ROAD_NETWORK_UNAVAILABLE');
  return data.elements;
}
