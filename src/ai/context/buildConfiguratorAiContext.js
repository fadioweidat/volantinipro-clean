import { aiField, unavailableField, AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from "./fieldTypes.js";

const now = () => new Date().toISOString();

function confidenceForStatus(status) {
  if (status === "complete") return AI_CONFIDENCE_LEVELS.HIGH;
  if (status === "partial") return AI_CONFIDENCE_LEVELS.MEDIUM;
  return AI_CONFIDENCE_LEVELS.LOW;
}

function sourceLabel(entry, fallback) {
  if (!entry) return fallback;
  return entry.provider || entry.dataset || entry.source || entry.name || fallback;
}

/**
 * Costruisce il contesto AI del Configuratore (Step 2) RI-usando lo snapshot
 * territoriale gia' costruito da `buildTerritorialAiSnapshot` (Truth Model +
 * View Model canonici) — nessun motore territoriale viene richiamato o
 * duplicato qui, solo un ri-avvolgimento nel formato di campo condiviso.
 */
export function buildConfiguratorAiContext(territorialSnapshot) {
  if (!territorialSnapshot || typeof territorialSnapshot !== "object") return null;
  const fieldSources = territorialSnapshot.fieldSources || {};
  const groupSource = (key) => Array.isArray(fieldSources[key]) && fieldSources[key][0] ? fieldSources[key][0] : null;

  const metricField = (value, groupKey, { type = AI_FIELD_TYPES.DERIVED, fallbackSource = "step2_territorial_engine" } = {}) => {
    if (value === null || value === undefined) return unavailableField(fallbackSource);
    const entry = groupSource(groupKey);
    return aiField(value, {
      type,
      source: sourceLabel(entry, fallbackSource),
      updatedAt: now(),
      confidence: entry ? confidenceForStatus(entry.status) : AI_CONFIDENCE_LEVELS.MEDIUM,
    });
  };

  const { territory = {}, quantity = {}, metrics = {}, service = {} } = territorialSnapshot;

  return Object.freeze({
    scope: "configurator",
    generatedAt: now(),
    fingerprint: territorialSnapshot.fingerprint || null,
    calculationState: territorialSnapshot.state || "unavailable",
    service: {
      key: metricField(service.key, "service", { type: AI_FIELD_TYPES.REAL }),
      title: metricField(service.title, "service", { type: AI_FIELD_TYPES.REAL }),
    },
    territory: {
      label: metricField(territory.label, "territory", { type: AI_FIELD_TYPES.REAL }),
      mode: metricField(territory.mode, "territory", { type: AI_FIELD_TYPES.REAL }),
      radiusKm: metricField(territory.radiusKm, "territory", { type: AI_FIELD_TYPES.REAL }),
      selectedNames: Array.isArray(territory.selectedNames) ? territory.selectedNames.slice(0, 20) : [],
    },
    quantity: {
      inserted: metricField(quantity.inserted, "quantity", { type: AI_FIELD_TYPES.REAL }),
      current: metricField(quantity.current, "quantity", { type: AI_FIELD_TYPES.REAL }),
      recommended: metricField(quantity.recommended, "requirement", { type: AI_FIELD_TYPES.DERIVED }),
      shortage: metricField(quantity.shortage, "requirement", { type: AI_FIELD_TYPES.DERIVED }),
      surplus: metricField(quantity.surplus, "surplus", { type: AI_FIELD_TYPES.DERIVED }),
    },
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => {
      const isCoverageOrDerived = /coverage|Pct$|selected|materialsRequired|materialsMissing|materialsRemaining/.test(key);
      const groupKey = /famil|population/i.test(key) ? "families" : /poi/i.test(key) ? "poi" : /transit|station/i.test(key) ? "transit" : /business/i.test(key) ? "businesses" : /material/i.test(key) ? "materials" : /coverage/i.test(key) ? "coverage" : "requirement";
      return [key, metricField(value, groupKey, { type: isCoverageOrDerived ? AI_FIELD_TYPES.DERIVED : AI_FIELD_TYPES.REAL })];
    })),
    missing: Array.isArray(territorialSnapshot.missing) ? territorialSnapshot.missing.slice() : [],
    limitations: Array.isArray(territorialSnapshot.limitations) ? territorialSnapshot.limitations.slice() : [],
  });
}
