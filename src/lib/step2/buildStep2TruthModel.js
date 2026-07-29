function nullableNonNegative(value, { round = false } = {}) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const normalized = Math.max(0, number);
  return round ? Math.round(normalized) : normalized;
}

function nullableCount(value) {
  return nullableNonNegative(value, { round: true });
}

function firstAvailable(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function confidence(available, total, limitation) {
  const safeAvailable = nullableCount(available);
  const safeTotal = nullableCount(total);
  if (safeAvailable == null || safeTotal == null || safeTotal === 0) {
    return { available: safeAvailable, total: safeTotal, ratio: null, label: "Non valutabile", limitation: limitation || null };
  }
  const boundedAvailable = Math.min(safeTotal, safeAvailable);
  const ratio = boundedAvailable / safeTotal;
  return {
    available: boundedAvailable,
    total: safeTotal,
    ratio,
    label: ratio >= 0.8 ? "Alta" : ratio >= 0.5 ? "Media" : "Bassa",
    limitation: limitation || (ratio < 1 ? "Analisi parziale: una o più fonti richieste non sono collegate." : null),
  };
}

function normalizeAllocationRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const requiredQuantity = nullableCount(firstAvailable(row.requiredQuantity, row.requiredFlyers, row.requirement));
    const assignedQuantity = nullableCount(firstAvailable(row.assignedQuantity, row.assignedFlyers, row.allocatedQuantity));
    const coveragePct = requiredQuantity != null && requiredQuantity > 0 && assignedQuantity != null
      ? Math.min(100, Math.round((assignedQuantity / requiredQuantity) * 1000) / 10)
      : null;
    const status = assignedQuantity == null || requiredQuantity == null
      ? "unavailable"
      : assignedQuantity === 0
        ? "excluded"
        : requiredQuantity > 0 && assignedQuantity >= requiredQuantity
          ? "full"
          : "partial";
    const priorityRank = nullableCount(row.priorityRank) ?? index + 1;
    return {
      ...row,
      id: row.id ?? String(index),
      name: row.name || row.label || `Zona ${index + 1}`,
      priorityRank,
      requiredQuantity,
      assignedQuantity,
      coveragePct,
      status,
      // Alias di riga mantenuti per Step2Map e consumer legacy.
      requiredFlyers: requiredQuantity,
      assignedFlyers: assignedQuantity,
      coveragePercent: coveragePct,
      allocationStatus: status,
    };
  }).sort((a, b) => a.priorityRank - b.priorityRank || a.name.localeCompare(b.name, "it"));
}

function normalizeServiceData(serviceKey, serviceData = {}) {
  const empty = { available: false };
  return {
    d2d: serviceKey === "d2d" ? { ...empty, ...serviceData, available: serviceData.available !== false } : empty,
    h2h: serviceKey === "h2h" ? { ...empty, ...serviceData, available: serviceData.available !== false } : empty,
    business: serviceKey === "b2b" ? { ...empty, ...serviceData, available: serviceData.available !== false } : empty,
  };
}

// Fonte canonica, indipendente dalla presentazione, condivisa da Step 2,
// TerritorialReport e dal payload diretto allo Step 3.
export function buildStep2TruthModel({
  rawData = null,
  userSelections = {},
  availability = {},
  sourceMetadata = null,
  territory = {},
  territories = [],
  service = {},
  serviceData = {},
  insertedQuantity = null,
  currentQuantity = null,
  baseRequirement = null,
  recommendedRequirement = null,
  allocation = null,
  zones = [],
  nils = [],
  pois = [],
  activities = [],
  availableZoneCount = null,
  dailyCapacity = null,
  operatorCount = null,
  operatorDays = null,
  calendarDays = null,
  calculationStatus = null,
  unavailableReason = null,
  score = null,
  sources = null,
  confidenceInputs = {},
} = {}) {
  const serviceKey = service.key || "d2d";
  const inserted = nullableCount(insertedQuantity);
  const current = nullableCount(currentQuantity);
  const base = nullableCount(baseRequirement);
  const recommended = nullableCount(recommendedRequirement);
  const margin = base != null && recommended != null ? Math.max(0, recommended - base) : null;
  const shortage = current != null && recommended != null ? Math.max(0, recommended - current) : null;
  const surplus = current != null && recommended != null ? Math.max(0, current - recommended) : null;
  const operationalPct = current != null && recommended != null && recommended > 0
    ? Math.min(100, Math.round((current / recommended) * 1000) / 10)
    : null;

  const rows = normalizeAllocationRows(allocation?.rows ?? allocation ?? zones);
  const assignedValues = rows.map((row) => row.assignedQuantity);
  const allocatedQuantity = rows.length > 0 && assignedValues.every((value) => value != null)
    ? assignedValues.reduce((sum, value) => sum + value, 0)
    : null;
  const unallocatedQuantity = current != null && allocatedQuantity != null
    ? Math.max(0, current - allocatedQuantity)
    : null;

  const capacity = nullableNonNegative(dailyCapacity);
  const operators = nullableCount(operatorCount);
  const normalizedOperatorDays = operatorDays != null
    ? nullableNonNegative(operatorDays)
    : capacity != null && capacity > 0 && current != null && current > 0
      ? current / capacity
      : null;
  const normalizedCalendarDays = calendarDays != null
    ? nullableCount(calendarDays)
    : normalizedOperatorDays != null && operators != null && operators > 0
      ? Math.ceil(normalizedOperatorDays / operators)
      : null;

  const normalizedSources = Array.isArray(sourceMetadata)
    ? sourceMetadata
    : Array.isArray(sources)
      ? sources
      : [];
  const connected = normalizedSources.filter((item) => item?.connected).length;
  const defaultConfidence = confidence(connected, normalizedSources.length || null);
  const sectionConfidence = Object.fromEntries(
    ["coverage", "demographics", "buildings", "economy", "mobility", "business", "recommendation"].map((key) => {
      const input = confidenceInputs[key];
      return [key, input ? confidence(input.available, input.total, input.limitation) : defaultConfidence];
    }),
  );

  const normalizedAvailability = {
    territorialData: availability.territorialData ?? rows.length > 0,
    quantity: availability.quantity ?? (current != null),
    requirement: availability.requirement ?? (recommended != null),
    coverage: availability.coverage ?? (operationalPct != null),
    allocation: availability.allocation ?? rows.length > 0,
    demographics: availability.demographics ?? false,
    mobility: availability.mobility ?? false,
    business: availability.business ?? false,
    ...availability,
  };
  const resolvedCalculationStatus = calculationStatus
    || (unavailableReason ? "unavailable" : normalizedAvailability.territorialData && recommended != null ? "ready" : "unavailable");
  const serviceModels = normalizeServiceData(serviceKey, serviceData);

  return {
    schemaVersion: 2,
    rawData,
    userSelections: { ...userSelections },
    availability: normalizedAvailability,
    sourceMetadata: normalizedSources,
    calculation: {
      status: resolvedCalculationStatus,
      available: resolvedCalculationStatus === "ready",
      unavailableReason: unavailableReason || null,
    },
    territory: {
      ...territory,
      label: territory.label || "Territorio selezionato",
      modeLabel: territory.modeLabel || "Territorio selezionato",
      territories: Array.isArray(territories) ? territories : [],
      zones: Array.isArray(zones) ? zones : [],
      nils: Array.isArray(nils) ? nils : [],
      pois: Array.isArray(pois) ? pois : [],
      activities: Array.isArray(activities) ? activities : [],
    },
    service: { key: serviceKey, title: service.title || (serviceKey === "h2h" ? "Hand to Hand" : serviceKey === "b2b" ? "Business" : "Door to Door") },
    quantity: {
      inserted,
      current,
      baseRequirement: base,
      operationalMargin: margin,
      operationalMarginPct: base != null && base > 0 && margin != null ? Math.round((margin / base) * 1000) / 10 : null,
      recommendedRequirement: recommended,
      shortage,
      missing: shortage,
      surplus,
      allocatedQuantity,
      unallocatedQuantity,
    },
    coverage: {
      operationalPct,
      denominator: "fabbisogno operativo consigliato",
      formula: "quantità scenario corrente ÷ fabbisogno operativo consigliato × 100",
    },
    allocation: {
      rows,
      allocatedQuantity,
      unallocatedQuantity,
      available: rows.length > 0,
    },
    zones: {
      rows,
      available: availableZoneCount == null ? (rows.length || null) : nullableCount(availableZoneCount),
      involved: rows.length ? rows.filter((row) => row.assignedQuantity != null && row.assignedQuantity > 0).length : null,
      full: rows.length ? rows.filter((row) => row.status === "full").length : null,
      partial: rows.length ? rows.filter((row) => row.status === "partial").length : null,
      excluded: rows.length ? rows.filter((row) => row.status === "excluded").length : null,
      firstPriority: rows[0] || null,
    },
    duration: {
      scenarioQuantity: current,
      dailyCapacity: capacity,
      operatorCount: operators,
      operatorDays: normalizedOperatorDays,
      days: normalizedCalendarDays,
      calendarDays: normalizedCalendarDays,
      calculable: normalizedCalendarDays != null,
      formula: capacity != null && capacity > 0 ? "quantità ÷ capacità giornaliera per operatore ÷ numero operatori" : null,
    },
    d2d: serviceModels.d2d,
    h2h: serviceModels.h2h,
    business: serviceModels.business,
    score: Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null,
    sources: normalizedSources,
    confidence: sectionConfidence,
  };
}

// Compatibilità temporanea: gli alias sono copie/proiezioni del Truth Model e
// non contengono formule concorrenti.
export function projectStep2LegacyAliases(truthModel) {
  const model = truthModel || {};
  const quantity = model.quantity || {};
  const activeServiceData = model.service?.key === "h2h"
    ? model.h2h
    : model.service?.key === "b2b"
      ? model.business
      : model.d2d;
  return {
    requiredFlyers: quantity.recommendedRequirement ?? null,
    missingFlyers: quantity.shortage ?? null,
    remainingFlyers: quantity.surplus ?? null,
    serviceKpis: activeServiceData?.kpis ? { ...activeServiceData.kpis } : {},
    businessMaterialPlan: model.business?.materialPlan ? { ...model.business.materialPlan } : null,
  };
}

export function buildStep2ToStep3Payload(truthModel) {
  if (!truthModel) throw new TypeError("truthModel is required");
  return {
    rawData: truthModel.rawData,
    truthModel,
    userSelections: truthModel.userSelections,
    availability: truthModel.availability,
    sourceMetadata: truthModel.sourceMetadata,
    ...projectStep2LegacyAliases(truthModel),
  };
}
