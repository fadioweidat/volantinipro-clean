// Static snapshot of the hero scenario (Cormano, 3 km): real analysis-istat data
// saved by `npm run snapshot:hero`, so numbers and borders show without waiting
// for the Edge Function (cold start + compute). Only the fields the hero reads
// are kept (no OMI, no scores). If the snapshot is missing or does not pass
// validation the hero falls back to the live call — never invented numbers.
import { normalizeHomepageAnalysis } from './homepageHeroData.js';

export const HERO_SNAPSHOT_VERSION = 1;

// Exactly the per-row fields read by normalizeHomepageAnalysis.
export const HERO_SNAPSHOT_ROW_FIELDS = Object.freeze([
  'municipality_code', 'comune_code', 'municipality_name', 'comune_name',
  'nil_code', 'nil_name', 'territory_level',
  'households_in_radius', 'households_total', 'pct_copertura',
  'geometry_geojson',
]);

const SOURCE_PATTERN = /ISTAT|PostGIS|geograf/i;

/** Keeps only the fields the hero uses from an analysis-istat response. */
export function pickHeroSnapshotData(response) {
  const rows = Array.isArray(response?.comuni_breakdown) ? response.comuni_breakdown : [];
  return {
    comuni_breakdown: rows.map((row) => Object.fromEntries(
      HERO_SNAPSHOT_ROW_FIELDS.filter((key) => row[key] !== undefined && row[key] !== null).map((key) => [key, row[key]])
    )),
    sources: Array.isArray(response?.sources) ? response.sources.filter((s) => typeof s === 'string' && SOURCE_PATTERN.test(s)) : [],
  };
}

/** "20/10/2026" (Europe/Rome) or null. */
export function formatSnapshotDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(d);
}

/**
 * Returns { data, generatedAt, dateLabel } when the snapshot is usable for this
 * exact scenario, otherwise null (caller must use the live call).
 */
export function validateHeroSnapshot(snapshot, scenario, now = Date.now()) {
  try {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== HERO_SNAPSHOT_VERSION) return null;
    const s = snapshot.scenario || {};
    if (s.name !== scenario.name || Number(s.lat) !== scenario.lat || Number(s.lng) !== scenario.lng || Number(s.radiusKm) !== scenario.radiusKm) return null;
    const generated = Date.parse(snapshot.generatedAt);
    if (!Number.isFinite(generated) || generated > now + 60 * 1000) return null; // a future date means a corrupt file
    const data = snapshot.data;
    if (!data || data.error || !Array.isArray(data.comuni_breakdown) || data.comuni_breakdown.length === 0 || data.comuni_breakdown.length > 200) return null;
    const analysis = normalizeHomepageAnalysis(data);
    if (!analysis.groups.length || analysis.families === null || analysis.families <= 0 || analysis.familiesShare === null) return null;
    const dateLabel = formatSnapshotDate(snapshot.generatedAt);
    if (!dateLabel) return null;
    return { data, generatedAt: snapshot.generatedAt, dateLabel };
  } catch {
    return null;
  }
}
