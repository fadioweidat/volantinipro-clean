// Dati territoriali reali per il Business Mode. Riuso ESCLUSIVO di fonti già
// esistenti nel prodotto — nessuna nuova tabella, nessuna nuova Edge
// Function, nessun nuovo endpoint:
//   - analysis-istat (stessa Edge Function usata da Step2 per popolazione /
//     famiglie / geometria comunale, chiamata qui in sola lettura,
//     analysisLevel=comune) per popolazione e famiglie del comune.
//   - GEO_DATA (già usato altrove) per il centro lat/lng del comune.
// Se una fonte non risponde o il comune non è risolvibile, il valore torna
// `null` — mai un numero inventato. Il chiamante mostra "Dato non disponibile".
import { NOT_AVAILABLE } from './feasibilityBusinessSchemas.js';

function firstNum(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * @returns {Promise<{ population: number|null, households: number|null,
 *   avgHouseholdSize: number|null, source: string, available: boolean }>}
 */
export async function fetchBusinessTerritorialData({ lat, lng, municipalityName, radiusKm = 3, signal } = {}) {
  const empty = { population: null, households: null, avgHouseholdSize: null, source: NOT_AVAILABLE, available: false };
  if (lat == null || lng == null || !municipalityName) return empty;

  const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const apiUrl = import.meta.env.VITE_ANALYSIS_ISTAT_URL || (baseUrl ? `${baseUrl}/functions/v1/analysis-istat` : null);
  if (!apiUrl) return empty;

  try {
    const headers = {};
    if (anonKey && apiUrl.includes('/functions/v1/')) {
      headers.Authorization = `Bearer ${anonKey}`;
      headers.apikey = anonKey;
    }
    const url = `${apiUrl}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radiusKm)}&service=d2d&municipality=${encodeURIComponent(municipalityName)}&analysisLevel=comune`;
    const response = await fetch(url, { headers, signal });
    if (!response.ok) return empty;
    const json = await response.json().catch(() => null);
    if (!json || json.error) return empty;

    const breakdown = Array.isArray(json.comuni_breakdown) ? json.comuni_breakdown : [];
    const row = breakdown[0] || null;
    const v = json.values || {};

    const population = row
      ? firstNum(row.population_total, row.population, row.popolazione, row.popolazione_stimata, row.residenti, row.abitanti)
      : firstNum(v.popolazione_stimata, v.population);
    const households = row
      ? firstNum(row.households_total, row.households, row.famiglie, row.famiglie_stimate, row.nuclei_familiari)
      : firstNum(v.famiglie_stimate, v.households);
    const avgHouseholdSize = population != null && households != null && households > 0
      ? Math.round((population / households) * 100) / 100
      : null;

    if (population == null && households == null) return empty;
    return { population, households, avgHouseholdSize, source: 'ISTAT · analysis-istat', available: true };
  } catch {
    return empty;
  }
}
