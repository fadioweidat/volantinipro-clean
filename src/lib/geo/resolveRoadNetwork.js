// Rete stradale reale (OSM/Overpass) per la traccia "Admin automatica"
// simulata sulle vie reali (P0).
//
// FIX PRODUZIONE (ticket "OVERPASS CORS / 504"): il browser NON chiama piu'
// Overpass direttamente. In produzione overpass.kumi.systems risponde senza
// header CORS e overpass-api.de va in 504: da qui la richiesta passa per il
// proxy server-side same-project `road-network` (supabase/functions/
// road-network), che fa il fetch verso Overpass, il fallback multi-provider
// e una cache TTL. Vedi src/api/roadNetwork.js.
//
// Nessuna scrittura DB: questo modulo restituisce solo dati derivati al
// volo, mai persistiti (vedi ZoneCoverageMap.jsx e il report del ticket per
// la motivazione della non-persistenza).
import { normalizeMunicipalityName } from '../step2/addressIntent.js';
import { fetchRoadNetworkElements } from '../../api/roadNetwork.js';

// Fase 4: classi stradali idonee a un giro porta a porta residenziale
// (residential / living_street / unclassified / service). Il filtro per
// classe e' applicato lato server nella query Overpass QL (buildRoadQuery in
// _shared/roadNetworkProxy.ts, stessa lista canonica); qui restano solo le
// esclusioni di dettaglio su `service` (EXCLUDED_SERVICE_VALUES) e la
// normalizzazione degli elementi.

const roadCache = new Map();
const roadInFlight = new Map();
const SESSION_STORAGE_PREFIX = 'vp_road_network_cache:';

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSessionCache(key, value) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // storage pieno/non disponibile: la cache in-memory della pagina resta valida.
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function wayLengthMeters(geometry) {
  let total = 0;
  for (let i = 1; i < geometry.length; i += 1) {
    total += haversineMeters(geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1]);
  }
  return total;
}

// Esportata (riusata da originRadialSelection.js per il fallback
// point-on-surface del centro comune) invece di duplicata.
export function largestRing(geometry) {
  if (!geometry?.coordinates) return null;
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || null;
  if (geometry.type === 'MultiPolygon') {
    let best = null;
    let bestArea = -1;
    for (const poly of geometry.coordinates) {
      const ring = poly?.[0];
      if (!Array.isArray(ring) || ring.length < 3) continue;
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const area = (maxLng - minLng) * (maxLat - minLat);
      if (area > bestArea) { bestArea = area; best = ring; }
    }
    return best;
  }
  return null;
}

// Overpass `poly:"lat lon lat lon ..."` ha un limite pratico di lunghezza
// query: un confine comunale dettagliato (centinaia/migliaia di vertici)
// viene decimato in modo deterministico (stride fisso, MAI Math.random) a un
// massimo di vertici gestibile — stessa filosofia di approssimazione
// dichiarata gia' usata altrove nel pannello (es. area poligono client-side).
const MAX_POLY_VERTICES = 120;
function ringToOverpassPoly(ring) {
  let pts = ring;
  if (pts.length > MAX_POLY_VERTICES) {
    const stride = Math.ceil(pts.length / MAX_POLY_VERTICES);
    pts = pts.filter((_, i) => i % stride === 0);
  }
  return pts.map(([lng, lat]) => `${lat} ${lng}`).join(' ');
}

// La query Overpass QL e' costruita lato server (buildRoadQuery in
// _shared/roadNetworkProxy.ts): il client passa SOLO il poligono decimato,
// mai QL arbitrario. `ELIGIBLE_HIGHWAY_CLASSES` resta qui perche' descrive la
// classificazione idonea usata da elementToWay/audit; il server usa la stessa
// lista canonica.

// service=parking_aisle/driveway sono spiazzi privati, non vie di
// distribuzione — esclusi anche se rientrano nella classe "service".
const EXCLUDED_SERVICE_VALUES = new Set(['parking_aisle', 'driveway', 'drive-through']);

function elementToWay(el) {
  if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return null;
  if (el.tags?.highway === 'service' && EXCLUDED_SERVICE_VALUES.has(el.tags?.service)) return null;
  const geometry = el.geometry
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
    .map((p) => [p.lat, p.lon]);
  if (geometry.length < 2) return null;
  return {
    id: el.id, // OSM way id reale — usato come chiave di ordinamento deterministica (Fase 6)
    highway: el.tags?.highway || null,
    name: el.tags?.name || null,
    geometry,
    lengthM: wayLengthMeters(geometry),
  };
}

/**
 * Recupera la rete stradale idonea (Fase 4) dentro il boundary reale del
 * comune, con cache in-memory + sessionStorage (Fase 10, stesso pattern di
 * resolveMunicipalityBoundary.js), dedup delle richieste concorrenti.
 * @returns {Promise<{ways: Array, totalLengthM: number}|null>} null = source non disponibile (MAI un fallback finto)
 */
export async function resolveRoadNetwork(municipalityName, boundaryGeometry) {
  const key = normalizeMunicipalityName(municipalityName) || null;
  if (!key || !boundaryGeometry) return null;

  if (roadCache.has(key)) return roadCache.get(key);
  const persisted = readSessionCache(key);
  if (persisted) {
    roadCache.set(key, persisted);
    return persisted;
  }
  if (roadInFlight.has(key)) return roadInFlight.get(key);

  const request = (async () => {
    const ring = largestRing(boundaryGeometry);
    if (!ring || ring.length < 3) return null;
    try {
      const poly = ringToOverpassPoly(ring);
      const elements = await fetchRoadNetworkElements({ municipality: municipalityName, poly });
      const ways = elements.map(elementToWay).filter(Boolean);
      // Ordinamento deterministico per OSM way id (Fase 6): stabile ad ogni
      // chiamata, indipendente dall'ordine (non garantito) restituito da Overpass.
      ways.sort((a, b) => a.id - b.id);
      const totalLengthM = ways.reduce((sum, w) => sum + w.lengthM, 0);
      const result = { ways, totalLengthM };
      roadCache.set(key, result);
      writeSessionCache(key, result);
      return result;
    } catch {
      // Source non disponibile (rete/timeout/entrambi gli endpoint giu'):
      // null propagato al chiamante, che NON deve generare nessuna traccia
      // finta (Fase 11) — mostra solo un messaggio, MAI cache di un fallimento
      // (un problema di rete temporaneo non deve "avvelenare" i prossimi
      // tentativi in questa stessa sessione pagina).
      return null;
    }
  })();

  roadInFlight.set(key, request);
  try {
    return await request;
  } finally {
    roadInFlight.delete(key);
  }
}

// P1: la selezione "solo OSM way id" (senza origine) e' stata sostituita da
// selectRoadsFromOrigin (originRadialSelection.js) — espansione radiale da un
// punto di partenza, richiesta esplicitamente al posto della distribuzione
// uniforme su tutto il comune. Rimossa qui invece di lasciata come codice
// morto parallelo.
