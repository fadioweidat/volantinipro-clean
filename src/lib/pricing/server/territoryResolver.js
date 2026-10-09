// Server-side territory resolution for the pricing engine. Pure logic over an injected
// `lookup` (the Edge Function provides one backed by geo_municipalities via the service
// role; tests provide fixtures). Client names are only used as search keys: the tier
// inputs (official name, municipality code, density) always come from the lookup.
//
// Binding decision: an unrecognised municipality gives NO definitive quote and NO payable
// amount; the territory stays 'unresolved' with reason 'verification_required'.
import { normalizeName } from './payloadAdapter.js';

export const RESOLVER_VERSION = 'geo-municipalities-name-point-2';
export const MAX_POINTS_PER_TERRITORY = 5;

/**
 * @param {object[]} claims  adapter territoryClaims [{territoryRef, municipalityName, kinds, points, nilNames}]
 * @param {{ municipalities(): Promise<object[]>, containing(lat: number, lng: number): Promise<string[]|null> }} lookup
 *   containing() returns the municipality codes whose PostGIS geometry contains the point
 *   (Production RPC get_comuni_breakdown_in_radius with a 1 m radius), or null if unavailable.
 * @returns {Promise<{ territory: Record<string, object>, evidence: object[] }>}
 */
export async function resolveTerritories(claims, lookup) {
  const territory = {};
  const evidence = [];
  const unique = new Map();
  for (const c of claims) if (!unique.has(c.territoryRef)) unique.set(c.territoryRef, { ...c, points: [...(c.points ?? [])] });
  else unique.get(c.territoryRef).points.push(...(c.points ?? []));
  if (unique.size === 0) return { territory, evidence };

  const rows = await lookup.municipalities();
  const index = new Map();
  for (const r of rows ?? []) {
    const key = normalizeName(r.municipality_name);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(r);
  }
  const matched = [];
  for (const [ref, c] of unique) {
    const candidates = c.municipalityName ? index.get(normalizeName(c.municipalityName)) ?? [] : [];
    if (candidates.length !== 1) {
      const reason = !c.municipalityName ? 'name_missing' : candidates.length === 0 ? 'municipality_not_found' : 'municipality_ambiguous';
      territory[ref] = { status: 'unresolved', reason: 'verification_required', detail: reason };
      evidence.push({ territoryRef: ref, status: 'unresolved', detail: reason });
      continue;
    }
    matched.push([ref, c, candidates[0]]);
  }
  for (const [ref, c, r] of matched) {
    const density = Number(r.density_per_km2);
    const code = String(r.municipality_code);
    let verification = 'name_only';
    const points = [...new Map(c.points.map(([lng, lat]) => [`${lat},${lng}`, [lat, lng]])).values()].slice(0, MAX_POINTS_PER_TERRITORY);
    if (points.length > 0) {
      const results = [];
      for (const [lat, lng] of points) results.push(await lookup.containing(lat, lng));
      if (results.some(x => !Array.isArray(x))) verification = 'name_only_geometry_unavailable';
      else if (results.every(codes => codes.map(String).includes(code))) verification = 'name_and_point';
      else {
        territory[ref] = { status: 'unresolved', reason: 'verification_required', detail: 'point_outside_municipality' };
        evidence.push({ territoryRef: ref, status: 'unresolved', detail: 'point_outside_municipality', municipalityCode: code });
        continue;
      }
    }
    territory[ref] = {
      status: 'resolved', municipalityName: r.municipality_name, municipalityCode: code,
      densityPerKm2: Number.isFinite(density) ? density : undefined, source: 'geo_municipalities', verification,
    };
    evidence.push({ territoryRef: ref, status: 'resolved', municipalityCode: code, verification,
      kinds: c.kinds ?? [], nilCount: (c.nilNames ?? []).length });
  }
  return { territory, evidence };
}
