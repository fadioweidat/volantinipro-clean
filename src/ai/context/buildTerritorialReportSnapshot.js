const SERVICE_KEYS = new Set(["d2d", "h2h", "b2b"]);

const finiteNumber = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? null
  : Number(value);

const safeText = (value, max = 160) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

function sourceLabel(source) {
  return safeText(source?.provider || source?.source || source?.dataset || source?.name);
}

function connectedSources(truthModel) {
  return (Array.isArray(truthModel?.sourceMetadata) ? truthModel.sourceMetadata : [])
    .filter((source) => source?.connected === true)
    .map((source) => ({
      name: safeText(source?.name),
      label: sourceLabel(source),
      provider: safeText(source?.provider),
      dataset: safeText(source?.dataset),
    }))
    .filter((source) => source.name && source.label)
    .slice(0, 20);
}

function provenanceFor(sources, pattern) {
  return unique(sources.filter((source) => pattern.test(source.name)).map((source) => source.label));
}

function categoryCounts(items) {
  const counts = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const category = safeText(item?.category || item?.type || item?.sector, 80);
    if (category) counts.set(category, (counts.get(category) || 0) + 1);
  }
  return [...counts.entries()].slice(0, 50).map(([sector, count]) => ({ sector, count }));
}

/**
 * Proiezione read-only del Truth Model del Report Territoriale. Non effettua
 * fetch, non include geometrie/coordinate e mantiene null quando una fonte
 * non ha prodotto il dato (null non viene trasformato in zero).
 */
export function buildTerritorialReportSnapshot({ truthModel, presentation = {}, generatedAt = new Date().toISOString() } = {}) {
  if (!truthModel || typeof truthModel !== "object") return null;

  const service = SERVICE_KEYS.has(truthModel?.service?.key) ? truthModel.service.key : null;
  const serviceData = service === "d2d" ? truthModel.d2d : service === "h2h" ? truthModel.h2h : truthModel.business;
  const kpis = serviceData?.kpis || {};
  const territorial = truthModel?.rawData?.territorialAnalysis || {};
  const analysisLevel = safeText(
    territorial?.metadata?.analysis_level
      || territorial?.values?.analysis_level
      || truthModel?.userSelections?.analysisLevel
      || truthModel?.territory?.analysisLevel,
    40,
  );
  const sources = connectedSources(truthModel);
  const demographicProvenance = provenanceFor(sources, /popolazione|famiglie|istat|demograph/i);
  const poiProvenance = provenanceFor(sources, /^poi$|poi|openstreetmap|overpass|google places|foursquare/i);
  const mobilityProvenance = provenanceFor(sources, /fermate|linee tpl|mobilit|gtfs|trasport/i);

  // Il Truth Model e' il source-of-truth condiviso con i KPI Step2. I valori
  // presentation possono descrivere un perimetro comunale piu ampio e non
  // devono sovrascrivere la selezione territoriale effettiva.
  const population = finiteNumber(kpis.population ?? kpis.pop);
  const households = finiteNumber(kpis.families ?? kpis.households);
  const density = finiteNumber(kpis.density);
  const quantityAssigned = finiteNumber(truthModel?.quantity?.current);
  const quantityInserted = finiteNumber(truthModel?.quantity?.inserted);
  const requiredQuantity = finiteNumber(truthModel?.quantity?.recommendedRequirement);
  const coverage = finiteNumber(truthModel?.coverage?.operationalPct);

  const rawPois = Array.isArray(truthModel?.territory?.pois) ? truthModel.territory.pois : [];
  const poiAvailable = truthModel?.availability?.pois === true;
  const poiCounts = poiAvailable ? categoryCounts(rawPois) : null;
  const mobilityAvailable = truthModel?.availability?.mobility === true;
  const selectedNames = unique([
    ...(Array.isArray(truthModel?.territory?.territories) ? truthModel.territory.territories : []).map((item) => safeText(item?.name || item?.label || item)),
    ...(Array.isArray(truthModel?.territory?.nils) ? truthModel.territory.nils : []).map((item) => safeText(item?.name || item?.label || item?.nil_name)),
  ]).slice(0, 50);

  const internalSource = "calcolo interno VolantiniPro";
  const warnings = [
    !analysisLevel && "Livello di analisi non disponibile.",
    population == null && "Popolazione non disponibile.",
    households == null && "Famiglie non disponibili.",
    !poiAvailable && "Dati POI non disponibili.",
    requiredQuantity == null && "Fabbisogno operativo non disponibile.",
    coverage == null && "Copertura stimata non disponibile.",
  ].filter(Boolean);

  return Object.freeze({
    schemaVersion: 1,
    generatedAt: safeText(generatedAt, 40),
    territory: {
      name: safeText(truthModel?.territory?.label || presentation?.territory?.label),
      province: safeText(territorial?.metadata?.province || territorial?.values?.province),
      region: safeText(territorial?.metadata?.region || territorial?.values?.region),
      analysisLevel,
      availableNilCount: analysisLevel === "nil" ? finiteNumber(truthModel?.zones?.available) : null,
      selectedNames,
      provenance: unique(provenanceFor(sources, /territor|istat|nil|popolazione|famiglie/i)),
    },
    demographics: {
      population,
      households,
      density,
      provenance: demographicProvenance,
    },
    campaign: {
      service,
      currentQuantity: quantityAssigned,
      currentCoverage: coverage,
      recommendedQuantity: requiredQuantity,
      recommendedCoverage: requiredQuantity == null ? null : 100,
      // Alias mantenuti per compatibilita con il contratto remoto Phase 3.
      quantityInserted,
      quantityAssigned,
      requiredQuantity,
      estimatedCoverage: coverage,
      provenance: quantityAssigned != null || requiredQuantity != null || coverage != null ? [internalSource] : [],
    },
    poi: {
      available: poiAvailable,
      status: poiAvailable ? "available" : "unavailable",
      total: poiAvailable ? finiteNumber(kpis.poi ?? rawPois.length) : null,
      sectors: poiCounts,
      provenance: poiAvailable ? poiProvenance : [],
    },
    mobility: {
      available: mobilityAvailable,
      relevantSignals: mobilityAvailable ? {
        transitStops: finiteNumber(kpis.transitStops ?? kpis.tplStops),
        stations: finiteNumber(kpis.stations),
      } : null,
      provenance: mobilityAvailable ? mobilityProvenance : [],
    },
    warnings,
    sources: unique([
      ...sources.map((source) => source.label),
      ...((quantityAssigned != null || requiredQuantity != null || coverage != null) ? [internalSource] : []),
    ]),
  });
}
