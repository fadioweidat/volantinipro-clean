// Trova il NIL (Nucleo di Identità Locale, Milano) che contiene un punto.
// Riuso della STESSA fonte già usata da Step2/resolveMunicipalityBoundary.js
// per il breakdown NIL (analysis-istat, analysisLevel=nil) e dello stesso
// point-in-polygon già condiviso (pointInPolygon.js) — nessuna nuova fonte,
// nessun poligono NIL "inventato" o duplicato qui.
import { geoJsonContainsPoint } from './pointInPolygon.js';

// Milano è l'unico Comune con NIL nel prodotto: fuori da questo bbox
// approssimativo non ha senso interrogare analysis-istat per un NIL.
export function isNearMilan(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= 45.35 && nLat <= 45.55 && nLng >= 9.0 && nLng <= 9.3;
}

/**
 * @returns {Promise<{ name: string, code: string|null } | null>} il NIL che
 * contiene (lat, lng), o null se non risolvibile (mai un NIL indovinato).
 */
export async function resolveNilForPoint(lat, lng, { municipalityName = 'Milano', signal } = {}) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (!isNearMilan(nLat, nLng)) return null;

  const baseUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL) || (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL);
  const anonKey = typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_ANON_KEY;
  const apiUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_ANALYSIS_ISTAT_URL) || (baseUrl ? `${baseUrl}/functions/v1/analysis-istat` : null);
  if (!apiUrl) return null;

  const headers = {};
  if (anonKey && apiUrl.includes('/functions/v1/')) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  try {
    const url = `${apiUrl}?lat=${encodeURIComponent(nLat)}&lng=${encodeURIComponent(nLng)}&radius=1&service=d2d&municipality=${encodeURIComponent(municipalityName)}&analysisLevel=nil`;
    const res = await fetch(url, { headers, signal });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const rows = Array.isArray(json?.nil_breakdown) ? json.nil_breakdown : [];
    for (const row of rows) {
      const geometry = typeof row.geometry_geojson === 'string' ? JSON.parse(row.geometry_geojson) : row.geometry_geojson;
      if (geometry && geoJsonContainsPoint(geometry, nLat, nLng)) {
        const name = row.nil_name || row.name || null;
        if (name) return { name, code: row.nil_code || row.id || null };
      }
    }
    return null;
  } catch {
    return null;
  }
}
