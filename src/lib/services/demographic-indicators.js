/**
 * @typedef {Object} DemographicIndicators
 * @property {'municipality'} level
 * @property {string} source
 * @property {string} municipalityCode
 * @property {string} geographyRef
 * @property {number} referenceYear
 * @property {number|null} populationTotal
 * @property {number|null} householdsTotal
 * @property {number|null} avgHouseholdSize
 * @property {number|null} shareAge014   raw decimal (0–1) from DB
 * @property {number|null} shareAge1534
 * @property {number|null} shareAge3564
 * @property {number|null} shareAge65Plus
 * @property {number|null} age_0_14_pct   normalized 0–100
 * @property {number|null} age_15_34_pct
 * @property {number|null} age_35_64_pct
 * @property {number|null} age_65_plus_pct
 */

const GEOGRAPHY_TYPE = 'municipality';
const DEFAULT_YEAR = 2025;

/**
 * Strips the '3' prefix added by some internal ISTAT datasets (e.g. '3015146' → '015146').
 * demographic_indicators always uses the 6-digit bare ISTAT code.
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
function normalizeGeoRef(code) {
  if (!code) return null;
  const s = String(code).trim();
  if (s.startsWith('3') && s.length === 7) return s.slice(1);
  return s.length >= 4 ? s : null;
}

/**
 * Converts a raw DB share value (decimal 0–1 or already-percent >1) to a 0–100 percent.
 * @param {any} value
 * @returns {number|null}
 */
function normalizePercent(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? n * 100 : n;
  return Math.round(pct * 10) / 10;
}

/**
 * Queries public.demographic_indicators via PostgREST.
 *
 * @param {{ geographyRef: string, year?: number }} input
 * @returns {Promise<DemographicIndicators|null>}
 */
export async function fetchDemographicIndicators({ geographyRef, year = DEFAULT_YEAR }) {
  const ref = normalizeGeoRef(geographyRef);
  if (!ref) throw new Error('INVALID_GEOGRAPHY_REF');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('DEMOGRAPHICS_BACKEND_NOT_CONFIGURED');

  const params = new URLSearchParams({
    select: '*',
    geography_type: `eq.${GEOGRAPHY_TYPE}`,
    geography_ref: `eq.${ref}`,
    order: 'reference_year.desc',
    limit: '1',
  });

  if (import.meta.env.DEV) {
    console.debug('[demographic-indicators] geography_ref normalizzato:', ref, `(input: ${geographyRef})`);
    console.debug('[demographic-indicators] query URL params:', params.toString());
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/demographic_indicators?${params}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const code = result?.code || result?.message || `HTTP_${response.status}`;
    throw new Error(code);
  }

  const row = Array.isArray(result) ? result[0] : null;
  if (import.meta.env.DEV) {
    console.log('[DEMOGRAPHICS raw row]', row);
  }
  if (!row) return null;

  const mapped = {
    level: 'municipality',
    source: 'ISTAT / demographic_indicators',
    municipalityCode: row.geography_ref ?? ref,
    geographyRef: row.geography_ref ?? ref,
    referenceYear: row.reference_year ?? year,
    populationTotal: row.population_total ?? null,
    householdsTotal: row.households_total ?? null,
    avgHouseholdSize: row.avg_household_size ?? null,
    shareAge014: row.share_age_0_14 ?? null,
    shareAge1534: row.share_age_15_34 ?? null,
    shareAge3564: row.share_age_35_64 ?? null,
    shareAge65Plus: row.share_age_65_plus ?? null,
    age_0_14_pct: normalizePercent(row.share_age_0_14),
    age_15_34_pct: normalizePercent(row.share_age_15_34),
    age_35_64_pct: normalizePercent(row.share_age_35_64),
    age_65_plus_pct: normalizePercent(row.share_age_65_plus),
  };

  if (import.meta.env.DEV) {
    console.log('[DEMOGRAPHICS mapped]', mapped);
  }

  return mapped;
}
