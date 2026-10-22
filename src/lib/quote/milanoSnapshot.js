// Static snapshot of "Milano intera" (88 NIL) for the homepage calculator and
// Preventivo Rapido: real analysis-istat data saved by `npm run snapshot:milano`
// (same request as the live one), so Milano answers at once even when the
// database is slow. Only the fields the calculator reads are kept (no
// geometry, no OMI, no scores). Missing or invalid snapshot -> null -> the
// live request is used, never invented numbers. Step 2 stays live.
import { readHomeCalculatorAnalysis } from './homeCalculatorAnalysis.js';

export const MILANO_SNAPSHOT_VERSION = 1;
export const MILANO_NIL_COUNT = 88;

export const MILANO_SNAPSHOT_ROW_FIELDS = Object.freeze([
  'territory_level', 'nil_code', 'nil_name', 'comune_name', 'municipality_code',
  'pct_copertura', 'volantini_nel_raggio', 'households_total', 'population_total',
  'households_in_radius', 'population_in_radius', 'area_km2',
]);
const VALUE_FIELDS = ['famiglie_stimate', 'popolazione_stimata', 'volantini_consigliati', 'copertura_stimata', 'analysis_level'];

/** Keeps only what readHomeCalculatorAnalysis needs from a live answer. */
export function pickMilanoSnapshotData(response) {
  const rows = Array.isArray(response?.comuni_breakdown) ? response.comuni_breakdown : [];
  const values = response?.values || {};
  return {
    values: Object.fromEntries(VALUE_FIELDS.filter((k) => values[k] !== undefined && values[k] !== null).map((k) => [k, values[k]])),
    comuni_breakdown: rows.map((row) => Object.fromEntries(
      MILANO_SNAPSHOT_ROW_FIELDS.filter((k) => row[k] !== undefined && row[k] !== null).map((k) => [k, row[k]])
    )),
    metadata: { warnings: (Array.isArray(response?.metadata?.warnings) ? response.metadata.warnings : []).filter((w) => String(w).startsWith('MILANO_')) },
  };
}

/** "22/10/2026" (Europe/Rome) or null. */
export function formatMilanoSnapshotDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(d);
}

/**
 * { analysis, generatedAt, dateLabel } when the snapshot is a complete
 * "Milano intera" (88 distinct NILs, real figures); otherwise null.
 */
export function validateMilanoSnapshot(snapshot, now = Date.now()) {
  try {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== MILANO_SNAPSHOT_VERSION) return null;
    const generated = Date.parse(snapshot.generatedAt);
    if (!Number.isFinite(generated) || generated > now + 60 * 1000) return null;
    const data = snapshot.data;
    const rows = Array.isArray(data?.comuni_breakdown) ? data.comuni_breakdown : [];
    if (data?.error || rows.length !== MILANO_NIL_COUNT) return null;
    const codes = new Set(rows.map((r) => String(r.nil_code ?? '').trim()).filter(Boolean));
    if (codes.size !== MILANO_NIL_COUNT || rows.some((r) => r.territory_level !== 'nil')) return null;
    // Every NIL must carry its own ISTAT figures (no totals spread over rows).
    if (rows.some((r) => !(Number(r.households_total) > 0) || !(Number(r.households_in_radius) > 0) || !(Number(r.volantini_nel_raggio) > 0))) return null;
    const analysis = readHomeCalculatorAnalysis(data, { name: 'Milano' });
    if (!analysis || analysis.kind !== 'milano' || !(analysis.families > 0) || !(analysis.recommended > 0) || analysis.nilCount !== MILANO_NIL_COUNT) return null;
    const dateLabel = formatMilanoSnapshotDate(snapshot.generatedAt);
    if (!dateLabel) return null;
    return { analysis, generatedAt: snapshot.generatedAt, dateLabel };
  } catch {
    return null;
  }
}
