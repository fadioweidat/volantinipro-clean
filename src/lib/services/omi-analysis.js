/**
 * @typedef {Object} OmiAnalysisRequest
 * @property {number} lat
 * @property {number} lng
 * @property {number} radiusKm
 * @property {number} [year]
 * @property {number} [semester]
 * @property {boolean} [includeGeometry]
 */

/**
 * @typedef {Object} OmiAnalysisValues
 * @property {number} omi_rows_count
 * @property {number} omi_zone_count
 * @property {number} omi_municipality_count
 * @property {number} omi_typology_count
 * @property {number|null} omi_min_value
 * @property {number|null} omi_max_value
 */

/**
 * @typedef {Object} OmiAnalysisMetadata
 * @property {boolean} isEstimated
 * @property {boolean} available
 * @property {string} label
 * @property {string} source
 * @property {Object} request
 * @property {Object} summary
 */

/**
 * @typedef {Object} OmiZone
 * @property {string} [codice_zona]
 * @property {string} [linkage]
 * @property {string} [description]
 * @property {Object} [geometry]
 */

/**
 * @typedef {Object} OmiAnalysisResponse
 * @property {OmiZone[]} zones
 * @property {OmiAnalysisValues} values
 * @property {OmiAnalysisMetadata} metadata
 * @property {string[]} sources
 */

const FUNCTION_NAME = 'analysis-omi-zones';
const MAX_RADIUS_KM = 20;

/**
 * @param {OmiAnalysisRequest} input
 * @returns {string|null} error message or null if valid
 */
function validateOmiRequest(input) {
  if (typeof input.lat !== 'number' || isNaN(input.lat)) return 'lat deve essere un numero valido';
  if (typeof input.lng !== 'number' || isNaN(input.lng)) return 'lng deve essere un numero valido';
  if (typeof input.radiusKm !== 'number' || isNaN(input.radiusKm)) return 'radiusKm deve essere un numero valido';
  if (input.radiusKm <= 0) return 'radiusKm deve essere maggiore di 0';
  if (input.radiusKm > MAX_RADIUS_KM) return `radiusKm non può superare ${MAX_RADIUS_KM} km`;
  return null;
}

/** @returns {OmiAnalysisValues} */
function emptyValues() {
  return {
    omi_rows_count: 0,
    omi_zone_count: 0,
    omi_municipality_count: 0,
    omi_typology_count: 0,
    omi_min_value: null,
    omi_max_value: null,
  };
}

/** @returns {OmiAnalysisMetadata} */
function emptyMetadata() {
  return {
    isEstimated: false,
    available: false,
    label: 'Valori immobiliari OMI',
    source: 'Agenzia Entrate - OMI',
    request: {},
    summary: {},
  };
}

/**
 * Chiama la Supabase Edge Function `analysis-omi-zones` con metodo POST.
 * Separato da ISTAT/comuni: non usare il risultato per calcolare famiglie,
 * popolazione, volantini consigliati o copertura stimata.
 *
 * @param {OmiAnalysisRequest} input
 * @returns {Promise<OmiAnalysisResponse>}
 */
export async function fetchOmiZonesAnalysis(input) {
  const validationError = validateOmiRequest(input);
  if (validationError) throw new Error(validationError);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) throw new Error('OMI_BACKEND_NOT_CONFIGURED');

  const endpoint = `${supabaseUrl}/functions/v1/${FUNCTION_NAME}`;

  const body = {
    lat: input.lat,
    lng: input.lng,
    radiusKm: input.radiusKm,
    ...(input.year != null ? { year: input.year } : {}),
    ...(input.semester != null ? { semester: input.semester } : {}),
    ...(input.includeGeometry != null ? { includeGeometry: input.includeGeometry } : {}),
  };

  if (import.meta.env.DEV) {
    console.debug('[omi-analysis] POST', FUNCTION_NAME, { lat: input.lat, lng: input.lng, radiusKm: input.radiusKm });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const code = result?.error || result?.code || `HTTP_${response.status}`;
    throw new Error(code);
  }

  if (!result) throw new Error('INVALID_OMI_RESPONSE');

  return {
    zones: Array.isArray(result.zones) ? result.zones : [],
    values: result.values ?? emptyValues(),
    metadata: result.metadata ?? emptyMetadata(),
    sources: Array.isArray(result.sources) ? result.sources : [],
  };
}
