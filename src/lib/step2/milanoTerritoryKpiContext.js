/**
 * Single Source of Truth per i contesti territoriali e i KPI di Milano nello Step 2.
 *
 * FIREWALL:
 * - Distingue rigorosamente dati ufficiali (NIL, Municipio, Comune) da stime (CAP).
 * - Nessun claim di "ufficialità" per le stime CAP.
 * - Nessun ricalcolo runtime delle quote.
 * - Unifica le label per evitare discrepanze fra summary panel e report.
 */

export function buildMilanoTerritoryKpiContext({
  mode = 'nil',
  territoryId = null,
  territoryName = null,
  families = null,
  population = null,
  recommendedQuantity = null,
  areaKm2 = null,
  densityPerKm2 = null,
  confidence = null,
  confidenceLabel = null,
  sourceType = 'official',
  sourceLabel = 'Comune di Milano',
  sourceYear = 2025,
  isEstimated = false,
  disclaimer = null,
  shortDisclaimer = null,
  coveragePct = 100,
  details = null,
} = {}) {
  const cleanFamilies = Number.isFinite(Number(families)) ? Number(families) : null;
  const cleanPopulation = Number.isFinite(Number(population)) ? Number(population) : null;
  const cleanQuantity = Number.isFinite(Number(recommendedQuantity)) ? Number(recommendedQuantity) : null;
  const cleanArea = Number.isFinite(Number(areaKm2)) ? Number(areaKm2) : null;
  const cleanDensity = Number.isFinite(Number(densityPerKm2)) ? Number(densityPerKm2) : null;

  return {
    mode,
    territoryId: territoryId !== null ? String(territoryId) : null,
    territoryName: territoryName || null,
    families: cleanFamilies,
    population: cleanPopulation,
    recommendedQuantity: cleanQuantity,
    areaKm2: cleanArea,
    densityPerKm2: cleanDensity,
    coveragePct: Number.isFinite(Number(coveragePct)) ? Number(coveragePct) : 100,
    confidence: confidence || null,
    confidenceLabel: confidenceLabel || null,
    sourceType, // 'official' | 'estimated' | 'calculated'
    sourceLabel: sourceLabel || '',
    sourceYear: sourceYear || 2025,
    isEstimated: Boolean(isEstimated),
    disclaimer: disclaimer || null,
    shortDisclaimer: shortDisclaimer || null,
    details: details || null,

    // Label helpers per UI coerente
    labels: {
      families: isEstimated ? 'Famiglie stimate' : 'Famiglie ufficiali',
      population: isEstimated ? 'Popolazione stimata' : 'Popolazione ufficiale',
      quantity: isEstimated ? 'Quantità indicativa' : 'Quantità consigliata',
      source: isEstimated ? 'Stima VolantiniPro basata su civici e NIL' : `Fonte: ${sourceLabel}${sourceYear ? ` — ${sourceYear}` : ''}`,
    },
  };
}

export function buildMunicipioKpiContext(municipioRecord) {
  if (!municipioRecord) return null;
  const num = municipioRecord.number || municipioRecord.MUNICIPIO || null;
  const families = municipioRecord.officialFamilies ?? municipioRecord.families ?? null;
  const population = municipioRecord.officialPopulation ?? municipioRecord.population ?? null;
  const area = municipioRecord.areaKm2 ?? null;
  const density = municipioRecord.densityPerKm2 ?? (area && population ? Math.round(population / area) : null);
  const recommendedQuantity = municipioRecord.recommendedQuantity ?? (families ? Math.round(families * 1.1) : null);

  return buildMilanoTerritoryKpiContext({
    mode: 'municipio',
    territoryId: num ? `milano-municipio-${num}` : null,
    territoryName: `Municipio ${num || ''}`.trim(),
    families,
    population,
    recommendedQuantity,
    areaKm2: area,
    densityPerKm2: density,
    confidence: null,
    confidenceLabel: null,
    sourceType: 'official',
    sourceLabel: 'Comune di Milano',
    sourceYear: 2025,
    isEstimated: false,
    disclaimer: null,
    shortDisclaimer: null,
    details: {
      description: municipioRecord.description || null,
      sourceMeta: municipioRecord.demographicsSourceMeta || null,
    },
  });
}

export function buildCapKpiContext(capEstimate) {
  if (!capEstimate || !capEstimate.available) return null;
  const cap = capEstimate.cap;
  return buildMilanoTerritoryKpiContext({
    mode: 'cap',
    territoryId: cap ? `cap_${cap}` : null,
    territoryName: `CAP ${cap}`,
    families: capEstimate.estimatedFamilies,
    population: null,
    recommendedQuantity: capEstimate.recommendedQuantity,
    areaKm2: null,
    densityPerKm2: null,
    confidence: capEstimate.confidence,
    confidenceLabel: capEstimate.confidenceLabel,
    sourceType: 'estimated',
    sourceLabel: 'Stima VolantiniPro basata su civici e NIL',
    sourceYear: 2025,
    isEstimated: true,
    disclaimer: capEstimate.disclaimer,
    shortDisclaimer: capEstimate.shortDisclaimer,
    details: {
      civicSampleCount: capEstimate.civicSampleCount,
      joinedCivicRate: capEstimate.joinedCivicRate,
      nilCount: capEstimate.nilCount,
      primaryNilName: capEstimate.primaryNilName,
      nilContributions: capEstimate.nilContributions,
    },
  });
}

export function buildNilKpiContext(nilRecord) {
  if (!nilRecord) return null;
  const name = nilRecord.name || nilRecord.nil_name || nilRecord.comune_name || '';
  const id = nilRecord.id || nilRecord.nil_code || nilRecord.nilCode || null;
  const families = nilRecord.familiesInRadius || nilRecord.families_in_radius || nilRecord.families || nilRecord.households_total || null;
  const population = nilRecord.populationInRadius || nilRecord.population_in_radius || nilRecord.population || nilRecord.population_total || null;
  const area = nilRecord.areaKm2 || nilRecord.area_km2 || null;
  const density = nilRecord.densityPerKm2 || nilRecord.density_per_km2 || null;
  const recommendedQuantity = nilRecord.volantiniNelRaggio || nilRecord.volantini_nel_raggio || (families ? Math.round(families * 1.1) : null);

  return buildMilanoTerritoryKpiContext({
    mode: 'nil',
    territoryId: id,
    territoryName: name,
    families,
    population,
    recommendedQuantity,
    areaKm2: area,
    densityPerKm2: density,
    confidence: null,
    confidenceLabel: null,
    sourceType: 'official',
    sourceLabel: 'Comune di Milano',
    sourceYear: 2025,
    isEstimated: false,
    disclaimer: null,
    shortDisclaimer: null,
    coveragePct: nilRecord.pct_copertura ?? 100,
  });
}
