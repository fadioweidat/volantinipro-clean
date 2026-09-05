// Confine reale di un Comune (Polygon/MultiPolygon GeoJSON), stessa logica
// gia' usata e testata da Step2.jsx (fetch + validazione Nominatim, fallback
// analysis-istat) — estratta qui come helper riutilizzabile perche' non ne
// esisteva uno condiviso. Step2.jsx NON viene toccato: resta con la propria
// implementazione inline, invariata e a rischio zero.
import { geoJsonContainsPoint } from './pointInPolygon.js';
import { normalizeMunicipalityName } from '../step2/addressIntent.js';

const boundaryCache = new Map();
// Chiamate in corso per lo stesso comune: se due componenti (es. Driver
// Programma e Driver Mappa nella stessa pagina, o il doppio mount di
// React.StrictMode in dev) chiedono lo stesso nome mentre la prima richiesta
// e' ancora in volo, la seconda si aggancia alla stessa Promise invece di
// aprire una seconda chiamata Nominatim/ISTAT identica.
const boundaryInFlight = new Map();
// Cache che sopravvive a una navigazione con reload completo (es. il
// pulsante "Mappa" del Driver usa window.location.href, non un route change
// SPA: senza persistenza, il confine gia' risolto nella pagina Programma
// andrebbe perso e ri-scaricato da zero aprendo la Mappa). Solo risultati
// POSITIVI vengono persistiti qui: un fallimento temporaneo (rete/Nominatim
// giu') non deve "avvelenare" i prossimi page load con un null permanente.
const SESSION_STORAGE_PREFIX = 'vp_boundary_cache:';
function readSessionCache(normalizedName) {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_PREFIX + normalizedName);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSessionCache(normalizedName, geometry) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_PREFIX + normalizedName, JSON.stringify(geometry));
  } catch {
    // storage pieno/non disponibile (es. modalita' privata): la cache
    // in-memory della singola pagina resta comunque valida, nessun impatto.
  }
}

function isUsableCenter(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

async function queryNominatimSearch(query, lat, lng) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=geojson&polygon_geojson=1&limit=10&dedupe=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VolantiniPro/1.0' } });
  const json = await res.json();
  const candidates = (json.features || []).filter((f) => {
    const g = f?.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return false;
    const addressType = f?.properties?.addresstype;
    if (['county', 'state', 'region', 'province'].includes(addressType)) return false;
    return true;
  });
  const hasCenter = isUsableCenter(lat, lng);
  const valid = hasCenter ? candidates.find((f) => geoJsonContainsPoint(f.geometry, lat, lng)) : candidates[0];
  return valid?.geometry || null;
}

async function fetchFromNominatim(name, lat, lng) {
  // 1. Direct query: "<name>, Italy"
  let geom = await queryNominatimSearch(`${name}, Italy`, lat, lng).catch(() => null);
  if (geom) return geom;

  // 2. Sub-district / NIL query if in Milan area (lat ~45.3-45.6, lng ~9.0-9.4)
  const isNearMilan = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 45.3 && lat <= 45.6 && lng >= 9.0 && lng <= 9.4;
  if (isNearMilan || !geom) {
    geom = await queryNominatimSearch(`${name}, Milano, Italy`, lat, lng).catch(() => null);
    if (geom) return geom;
    geom = await queryNominatimSearch(`${name}, Lombardia, Italy`, lat, lng).catch(() => null);
    if (geom) return geom;
  }
  return null;
}

async function fetchFromAnalysisIstat(name, lat, lng, normalizedName) {
  if (!isUsableCenter(lat, lng)) return null;
  const env = (typeof import.meta !== 'undefined' && import.meta?.env) || {};
  const baseUrl = env.VITE_API_BASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const apiUrl = env.VITE_ANALYSIS_ISTAT_URL || (baseUrl ? `${baseUrl}/functions/v1/analysis-istat` : null);
  if (!apiUrl) return null;
  const headers = {};
  if (anonKey && apiUrl.includes('/functions/v1/')) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }
  
  // Try comune breakdown first, then nil breakdown
  for (const analysisLevel of ['comune', 'nil']) {
    try {
      const res = await fetch(`${apiUrl}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=5&service=d2d&municipality=${encodeURIComponent(name)}&analysisLevel=${analysisLevel}`, { headers });
      const json = await res.json();
      const rows = [...(json?.comuni_breakdown || []), ...(json?.nil_breakdown || [])];
      const row = rows.find((entry) => {
        const entryName = normalizeMunicipalityName(entry?.nil_name || entry?.comune_name || entry?.municipality_name);
        return entryName === normalizedName && entry?.geometry_geojson;
      });
      if (row) {
        const geometry = typeof row.geometry_geojson === 'string' ? JSON.parse(row.geometry_geojson) : row.geometry_geojson;
        if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) return geometry;
      }
    } catch {
      // Continue to next analysis level
    }
  }
  return null;
}

// name: nome del Comune reale (es. "Saronno"), MAI il nome di una sotto-zona
// (es. "Saronno Centro"): il chiamante deve gia' aver risolto il Comune.
// { lat, lng }: punto noto della zona, usato solo per scegliere il poligono
// giusto tra piu' risultati Nominatim omonimi (mai per disegnare un cerchio).
// Ritorna la geometria o null (mai un fallback grafico inventato).
export async function resolveMunicipalityBoundary(name, { lat, lng } = {}) {
  const DEBUG_TIMING = Boolean(typeof import.meta !== 'undefined' && import.meta?.env?.DEV);
  const normalizedName = normalizeMunicipalityName(name);
  if (!normalizedName) return null;
  if (boundaryCache.has(normalizedName)) {
    if (DEBUG_TIMING) console.info(`[BOUNDARY] ${normalizedName} source=memory-cache ms=0`);
    return boundaryCache.get(normalizedName);
  }

  // Cache tra page load (sessionStorage): se un'altra pagina Driver ha gia'
  // risolto questo comune in questa scheda/sessione, nessuna chiamata di
  // rete — risultato immediato.
  const persisted = readSessionCache(normalizedName);
  if (persisted) {
    boundaryCache.set(normalizedName, persisted);
    if (DEBUG_TIMING) console.info(`[BOUNDARY] ${normalizedName} source=session-cache ms=0`);
    return persisted;
  }

  // Dedup richieste concorrenti per lo stesso comune (stesso page load):
  // la seconda chiamata attende la Promise gia' in volo invece di aprirne
  // una nuova identica.
  if (boundaryInFlight.has(normalizedName)) {
    if (DEBUG_TIMING) console.info(`[BOUNDARY] ${normalizedName} source=in-flight-dedup`);
    return boundaryInFlight.get(normalizedName);
  }

  const nLat = Number(lat);
  const nLng = Number(lng);
  const request = (async () => {
    const start = DEBUG_TIMING ? performance.now() : 0;
    let geometry = null;
    let source = 'none';
    try {
      geometry = await fetchFromNominatim(name, nLat, nLng);
      if (geometry) source = 'nominatim';
    } catch {
      // rete/Nominatim non disponibile: si tenta comunque il fallback sotto,
      // il GPS tracking non dipende da questo risultato.
    }
    if (DEBUG_TIMING) console.info(`[BOUNDARY] ${normalizedName} NOMINATIM ms=${Math.round(performance.now() - start)} found=${Boolean(geometry)}`);
    if (!geometry) {
      const istatStart = DEBUG_TIMING ? performance.now() : 0;
      try {
        geometry = await fetchFromAnalysisIstat(name, nLat, nLng, normalizedName);
        if (geometry) source = 'analysis-istat';
      } catch {
        // entrambe le fonti non disponibili: geometry resta null, il
        // chiamante mostra "Confine area non disponibile", mai una forma finta.
      }
      if (DEBUG_TIMING) console.info(`[BOUNDARY] ${normalizedName} ISTAT_FALLBACK ms=${Math.round(performance.now() - istatStart)} found=${Boolean(geometry)}`);
    }

    boundaryCache.set(normalizedName, geometry);
    if (geometry) writeSessionCache(normalizedName, geometry);
    if (DEBUG_TIMING) console.info(`[BOUNDARY] ${normalizedName} TOTAL source=${source} ms=${Math.round(performance.now() - start)}`);
    return geometry;
  })();

  boundaryInFlight.set(normalizedName, request);
  try {
    return await request;
  } finally {
    boundaryInFlight.delete(normalizedName);
  }
}

export function clearMunicipalityBoundaryCache() {
  boundaryCache.clear();
  boundaryInFlight.clear();
}
