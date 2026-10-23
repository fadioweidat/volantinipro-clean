// Homepage calculator: which analysis-istat request to make for a comune and
// how to read the answer. Milano is analysed by NIL (quartieri): the answer
// has no "Milano" comune row, so a name match alone read it as "no data".
// For Milano the calculator uses the same request as Step 2 "Milano intera"
// and sums the NILs, exactly like the configurator.
import { apiToZones } from '../step2/zoneGeoHelpers.js';
import { canonicalizeItalianMunicipalityName } from '../geocoding/canonicalizeItalianMunicipalityName.js';
import { getZoneFullCoverageFlyers } from '../doorToDoorCoverage.js';

// Same single-comune request as Preventivo Rapido (QuickQuotePage.jsx).
export const SINGLE_COMUNE_RADIUS_KM = 3;
// Step2.jsx effectiveRadiusKm for Milano comune completo (analysis by NIL).
export const MILANO_WHOLE_CITY_RADIUS_KM = 15;
export const MILANO_ISTAT_CODE = '015146';

export function isMilanoComune(comune) {
  if (!comune) return false;
  if (String(comune.code || comune.municipality_code || '') === MILANO_ISTAT_CODE) return true;
  const name = String(comune.name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  return name === 'milano';
}

/** Arguments for useServiceAnalysis(lat, lng, radius, service, municipality, quantity, scope, analysisLevel, selectionScope, codes). */
export function buildHomeCalculatorAnalysisArgs(comune) {
  // Last two: targetSelection, includeOmi = false (homepage calculator and Preventivo Rapido never show OMI).
  if (!comune) return [undefined, undefined, SINGLE_COMUNE_RADIUS_KM, 'd2d', null, null, 'comune', null, null, null, null, false];
  if (isMilanoComune(comune)) {
    return [comune.lat, comune.lng, MILANO_WHOLE_CITY_RADIUS_KM, 'd2d', 'Milano', null, 'comune', 'nil', 'municipality', MILANO_ISTAT_CODE, null, false];
  }
  return [comune.lat, comune.lng, SINGLE_COMUNE_RADIUS_KM, 'd2d', comune.name, null, 'comune', null, 'municipality', null, null, false];
}

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Preventivo Rapido: Milano gets its own "Milano intera" request (its answer is
 * by NIL, never a "Milano" comune row); the other comuni keep the shared
 * anchor request (single comune 3 km, several comuni 25 km "multi").
 */
export function splitQuickQuoteComuni(comuni) {
  const list = Array.isArray(comuni) ? comuni : [];
  return { milano: list.find(isMilanoComune) || null, others: list.filter((c) => !isMilanoComune(c)) };
}

export function buildQuickQuoteAnchorAnalysisArgs(others, service, quantity) {
  const anchor = others[0] || null;
  const radius = others.length > 1 ? 25 : SINGLE_COMUNE_RADIUS_KM;
  const selectionScope = others.length > 1 ? 'multi' : (others.length === 1 ? 'municipality' : null);
  return [anchor?.lat, anchor?.lng, radius, service, service === 'd2d' ? (anchor?.name || null) : null, quantity || null, 'comune', null, selectionScope, null, null, false];
}

/**
 * { kind: 'comune'|'milano', families, recommended, coverage, nilCount } when the
 * answer holds real figures for this comune; { kind, missing: true } otherwise.
 * `missing` means the answer really has no ISTAT rows for it; `incomplete`
 * means rows exist but cannot be used as a whole-comune figure (never shown).
 */
export function readHomeCalculatorAnalysis(data, comune) {
  if (!comune || !data || data.error) return null;
  const rows = Array.isArray(data.comuni_breakdown) ? data.comuni_breakdown : [];
  if (isMilanoComune(comune)) {
    const warnings = Array.isArray(data.metadata?.warnings) ? data.metadata.warnings : [];
    const nils = (apiToZones(data, null) || []).filter((z) => z.isNil);
    if (!nils.length) return { kind: 'milano', missing: rows.length === 0, incomplete: rows.length > 0 };
    // The resolver warns when the sweep did not return every Milano NIL: a
    // partial sum must never be shown as "Milano intera".
    if (warnings.some((w) => String(w).startsWith('MILANO_NIL_COMPLETE_INCOMPLETE'))) return { kind: 'milano', incomplete: true };
    const families = nils.reduce((sum, z) => sum + (finite(z.families) || 0), 0);
    const recommended = nils.reduce((sum, z) => sum + getZoneFullCoverageFlyers(z), 0);
    const population = nils.reduce((sum, z) => sum + (finite(z.pop) || 0), 0);
    const inRadius = rows.reduce((sum, r) => sum + (finite(r.households_in_radius) || 0), 0);
    const total = rows.reduce((sum, r) => sum + (finite(r.households_total) || 0), 0);
    if (!(families > 0) || !(recommended > 0)) return { kind: 'milano', incomplete: true };
    return { kind: 'milano', families, recommended, population: population > 0 ? population : null, coverage: total > 0 ? Math.min(100, Math.round((inRadius / total) * 100)) : null, nilCount: nils.length };
  }
  const zones = apiToZones(data, null) || [];
  const zone = zones.find((z) => !z.isNil && canonicalizeItalianMunicipalityName(z.name, z).toLowerCase() === comune.name.toLowerCase()) || null;
  if (!zone) return { kind: 'comune', missing: rows.length === 0, incomplete: rows.length > 0 };
  const families = zone.families > 0 ? zone.families : null;
  const recommended = getZoneFullCoverageFlyers(zone) || null;
  if (families === null || recommended === null) return { kind: 'comune', missing: true };
  return { kind: 'comune', families, recommended, coverage: Number.isFinite(zone.coverage) ? Math.min(100, Math.round(zone.coverage)) : null };
}
