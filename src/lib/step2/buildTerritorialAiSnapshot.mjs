const SERVICE_KEYS = new Set(["d2d", "h2h", "b2b"]);
const clean = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const safeName = (value) => {
  const name = clean(value);
  if (!name || /\b(test|demo|placeholder|fake|sample)\b/i.test(name)) return null;
  return name.slice(0, 100);
};
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value); Object.values(value).forEach(deepFreeze); return value;
};
const unique = (values) => [...new Set(values.filter(Boolean))];
const hash = (value) => {
  let result = 2166136261;
  for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
  return `territory-${(result >>> 0).toString(16).padStart(8, "0")}`;
};

function territoryNames(truthModel) {
  const selections = truthModel?.userSelections ?? {};
  const municipalityNames = (Array.isArray(selections.selectedMunicipalities) ? selections.selectedMunicipalities : []).map((item) => safeName(typeof item === "string" ? item : item?.label ?? item?.name));
  const nilNames = (Array.isArray(selections.selectedNils) ? selections.selectedNils : []).map((item) => safeName(typeof item === "string" ? item : item?.name ?? item?.label));
  const capNames = (Array.isArray(selections.selectedCaps) ? selections.selectedCaps : []).map((item) => safeName(typeof item === "string" ? item : item?.cap ?? item?.name));
  const allocationNames = (Array.isArray(truthModel?.allocation?.rows) ? truthModel.allocation.rows : []).map((item) => safeName(item?.name));
  return unique([...municipalityNames, ...nilNames, ...capNames, ...allocationNames]).slice(0, 20);
}

function sourceProjection(sourceMetadata) {
  return (Array.isArray(sourceMetadata) ? sourceMetadata : []).map((item) => ({
    name: safeName(item?.name),
    source: safeName(item?.source),
    provider: safeName(item?.provider) ?? safeName(item?.source),
    dataset: safeName(item?.dataset),
    connected: item?.connected === true,
    status: item?.connected === true ? (clean(item?.limitation) ? "partial" : "complete") : "missing",
    limitation: clean(item?.limitation)?.slice(0, 240) ?? null,
  })).filter((item) => item.name).slice(0, 12);
}

const applicationSource = (name) => ({ name, kind: "application", provider: null, dataset: null, source: null, status: "complete", limitation: null });
const projectedFieldSource = (item) => ({
  name: item.name,
  kind: "territorial",
  provider: item.provider ?? null,
  dataset: item.dataset ?? null,
  source: item.source ?? null,
  status: item.status,
  limitation: item.limitation ?? null,
});
const matchingSources = (sources, pattern) => sources
  .filter((item) => pattern.test(item.name ?? ""))
  .map(projectedFieldSource);
const uniqueFieldSources = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((item) => item?.name && !seen.has(`${item.kind}:${item.name}`) && seen.add(`${item.kind}:${item.name}`));
};

function buildFieldSources(serviceKey, sources) {
  const families = matchingSources(sources, /popolazione e famiglie|famiglie\/cassette/i);
  const population = matchingSources(sources, /popolazione e famiglie/i);
  const poi = matchingSources(sources, /^poi$/i);
  const transit = matchingSources(sources, /fermate e linee tpl/i);
  const businesses = matchingSources(sources, /attivit.+aree produttive/i);
  const requirementData = matchingSources(sources, /famiglie\/cassette/i);
  const quantity = [applicationSource("Quantità campagna")];
  const territory = [applicationSource("Zona selezionata")];
  const coverage = [applicationSource("Risultato copertura")];
  const requirement = uniqueFieldSources([applicationSource("Fabbisogno operativo Step 2")], requirementData);
  return {
    service: [applicationSource("Servizio selezionato")],
    territory,
    quantity,
    families: serviceKey === "d2d" ? families : [],
    population: serviceKey === "d2d" ? population : [],
    coverage: serviceKey === "d2d" ? uniqueFieldSources(coverage, requirementData) : [],
    requirement,
    surplus: uniqueFieldSources(quantity, requirement),
    poi: serviceKey === "h2h" ? poi : [],
    transit: serviceKey === "h2h" ? transit : [],
    businesses: serviceKey === "b2b" ? businesses : [],
    materials: serviceKey === "b2b" ? uniqueFieldSources([applicationSource("Piano materiali Step 2")], businesses) : [],
    calculationStatus: [applicationSource("Stato del calcolo")],
  };
}

/** Proiezione read-only: non contiene rawData, geometrie, coordinate o payload GIS. */
export function buildTerritorialAiSnapshot({ truthModel, viewModel, loading = false, error = false } = {}) {
  const serviceKey = truthModel?.service?.key;
  const serviceSupported = SERVICE_KEYS.has(serviceKey);
  const sources = sourceProjection(truthModel?.sourceMetadata);
  const serviceData = serviceKey === "d2d" ? truthModel?.d2d : serviceKey === "h2h" ? truthModel?.h2h : truthModel?.business;
  const kpis = serviceData?.kpis ?? {};
  const calculationReady = truthModel?.calculation?.status === "ready";

  const metrics = serviceKey === "d2d" ? {
    families: number(kpis.families),
    population: number(kpis.population ?? kpis.pop),
    residentialCoveragePct: number(truthModel?.coverage?.operationalPct),
    recommendedQuantity: number(truthModel?.quantity?.recommendedRequirement),
  } : serviceKey === "h2h" ? {
    poiAvailable: number(kpis.poi),
    selectedPoints: number(kpis.selectedPointCount),
    transitStops: number(kpis.transitStops ?? kpis.tplStops),
    stations: number(kpis.stations),
    quantityCoveragePct: number(truthModel?.coverage?.operationalPct),
  } : serviceKey === "b2b" ? {
    businessesAvailable: number(kpis.businesses),
    selectedBusinesses: number(kpis.selectedPointCount),
    materialsRequired: number(kpis.materialsRequired),
    materialsMissing: number(kpis.materialsMissing),
    materialsRemaining: number(kpis.materialsRemaining),
  } : {};

  const requiredMetrics = serviceKey === "d2d"
    ? ["families", "population", "residentialCoveragePct", "recommendedQuantity"]
    : serviceKey === "h2h"
      ? ["poiAvailable", "selectedPoints", "transitStops", "stations"]
      : serviceKey === "b2b"
        ? ["businessesAvailable", "selectedBusinesses", "materialsRequired", "materialsMissing", "materialsRemaining"]
        : [];
  const availableMetricCount = requiredMetrics.filter((key) => metrics[key] != null).length;
  const state = loading
    ? "loading"
    : error
      ? "error"
      : !serviceSupported
        ? "unsupported_service"
        : !calculationReady
          ? "unavailable"
          : availableMetricCount === 0
            ? "missing"
            : availableMetricCount === requiredMetrics.length && serviceData?.available !== false
              ? "complete"
              : "partial";

  const quantity = {
    inserted: number(truthModel?.quantity?.inserted),
    current: number(truthModel?.quantity?.current),
    recommended: number(truthModel?.quantity?.recommendedRequirement),
    shortage: number(truthModel?.quantity?.shortage),
    surplus: number(truthModel?.quantity?.surplus),
    allocated: number(truthModel?.quantity?.allocatedQuantity),
    unallocated: number(truthModel?.quantity?.unallocatedQuantity),
  };
  const territory = {
    label: safeName(truthModel?.territory?.label ?? viewModel?.primaryAreaLabel),
    mode: clean(truthModel?.territory?.areaMode ?? viewModel?.areaMode),
    modeLabel: safeName(truthModel?.territory?.modeLabel ?? viewModel?.coverageContextLabel),
    radiusKm: number(truthModel?.userSelections?.radiusKm),
    selectedNames: territoryNames(truthModel),
  };
  const missing = [
    !territory.label && "territorio",
    quantity.current == null && "quantita corrente",
    serviceKey === "d2d" && metrics.families == null && "famiglie",
    serviceKey === "d2d" && metrics.population == null && "popolazione",
    serviceKey === "d2d" && metrics.residentialCoveragePct == null && "copertura residenziale",
    serviceKey === "d2d" && metrics.recommendedQuantity == null && "fabbisogno consigliato",
    serviceKey === "h2h" && metrics.poiAvailable == null && "POI",
    serviceKey === "h2h" && metrics.selectedPoints == null && "punti selezionati",
    serviceKey === "h2h" && metrics.transitStops == null && "fermate di transito",
    serviceKey === "h2h" && metrics.stations == null && "stazioni",
    serviceKey === "b2b" && metrics.businessesAvailable == null && "attivita disponibili",
    serviceKey === "b2b" && metrics.selectedBusinesses == null && "attivita selezionate",
    serviceKey === "b2b" && metrics.materialsRequired == null && "materiali richiesti",
    serviceKey === "b2b" && metrics.materialsMissing == null && "materiali mancanti",
    serviceKey === "b2b" && metrics.materialsRemaining == null && "materiali residui",
  ].filter(Boolean);
  const limitations = unique(sources.filter((item) => !item.connected || item.limitation).map((item) => item.limitation)).slice(0, 8);
  const fieldSources = buildFieldSources(serviceKey, sources);
  const fingerprintInput = JSON.stringify({
    serviceKey,
    territory,
    quantity,
    metrics,
    state,
    sources: sources.map(({ name, source, provider, dataset, status }) => ({ name, source, provider, dataset, status })),
  });

  return deepFreeze({
    schemaVersion: 1,
    fingerprint: hash(fingerprintInput),
    state,
    service: { key: serviceKey ?? null, title: safeName(truthModel?.service?.title) },
    territory,
    quantity,
    metrics,
    calculation: { status: clean(truthModel?.calculation?.status), unavailableReason: clean(truthModel?.calculation?.unavailableReason)?.slice(0, 200) ?? null },
    missing,
    sources,
    fieldSources,
    limitations,
  });
}
