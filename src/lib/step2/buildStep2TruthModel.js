function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function rounded(value) { return Math.round(nonNegative(value)); }

function confidence(available, total, limitation) {
  const safeTotal = Math.max(1, rounded(total));
  const safeAvailable = Math.min(safeTotal, rounded(available));
  const ratio = safeAvailable / safeTotal;
  return {
    available: safeAvailable,
    total: safeTotal,
    ratio,
    label: ratio >= 0.8 ? "Alta" : ratio >= 0.5 ? "Media" : "Bassa",
    limitation: limitation || (ratio < 1 ? "Analisi parziale: una o più fonti richieste non sono collegate." : null),
  };
}

// Canonical, presentation-independent model shared by Client View and report.
export function buildStep2TruthModel({
  territory = {}, service = {}, insertedQuantity = 0, currentQuantity = 0,
  baseRequirement = 0, recommendedRequirement = 0, zones = [],
  availableZoneCount = null, dailyCapacity = null, operatorCount = null,
  score = null, sources = [], confidenceInputs = {},
} = {}) {
  const inserted = rounded(insertedQuantity);
  const current = rounded(currentQuantity == null ? inserted : currentQuantity);
  const base = rounded(baseRequirement);
  const recommended = rounded(recommendedRequirement || base);
  const margin = Math.max(0, recommended - base);
  const missing = Math.max(0, recommended - current);
  const surplus = Math.max(0, current - recommended);
  const operationalPct = recommended > 0 ? Math.min(100, Math.round((current / recommended) * 1000) / 10) : null;

  const rows = (Array.isArray(zones) ? zones : []).map((zone, index) => {
    const requiredFlyers = rounded(zone.requiredFlyers ?? zone.requirement);
    const assignedFlyers = rounded(zone.assignedFlyers ?? zone.allocatedQuantity);
    const coveragePct = requiredFlyers > 0 ? Math.min(100, Math.round((assignedFlyers / requiredFlyers) * 1000) / 10) : null;
    return {
      ...zone,
      id: zone.id ?? String(index),
      name: zone.name || zone.label || `Zona ${index + 1}`,
      priorityRank: rounded(zone.priorityRank) || index + 1,
      requiredFlyers,
      assignedFlyers,
      coveragePct,
      status: assignedFlyers <= 0 ? "excluded" : assignedFlyers >= requiredFlyers && requiredFlyers > 0 ? "full" : "partial",
    };
  }).sort((a, b) => a.priorityRank - b.priorityRank || a.name.localeCompare(b.name, "it"));

  const allocatedQuantity = rows.reduce((sum, zone) => sum + zone.assignedFlyers, 0);
  const safeCapacity = nonNegative(dailyCapacity);
  const safeOperators = Number.isFinite(Number(operatorCount)) && Number(operatorCount) > 0 ? Math.floor(Number(operatorCount)) : null;
  const operatorDays = safeCapacity > 0 && current > 0 ? current / safeCapacity : null;
  const days = operatorDays != null && safeOperators ? Math.ceil(operatorDays / safeOperators) : null;
  const connected = (Array.isArray(sources) ? sources : []).filter((item) => item?.connected).length;
  const defaultConfidence = confidence(connected, Math.max(1, sources.length));
  const sectionConfidence = Object.fromEntries(
    ["coverage", "demographics", "buildings", "economy", "mobility", "business", "recommendation"].map((key) => {
      const input = confidenceInputs[key];
      return [key, input ? confidence(input.available, input.total, input.limitation) : defaultConfidence];
    })
  );

  return {
    territory: { label: territory.label || "Territorio selezionato", modeLabel: territory.modeLabel || "Territorio selezionato" },
    service: { key: service.key || "d2d", title: service.title || "Door to Door" },
    quantity: {
      inserted, current, baseRequirement: base, operationalMargin: margin,
      operationalMarginPct: base > 0 ? Math.round((margin / base) * 1000) / 10 : null,
      recommendedRequirement: recommended, missing, surplus, allocatedQuantity,
      unallocatedQuantity: Math.max(0, current - allocatedQuantity),
    },
    coverage: {
      operationalPct,
      denominator: "fabbisogno operativo consigliato",
      formula: "quantità scenario corrente ÷ fabbisogno operativo consigliato × 100",
    },
    zones: {
      rows,
      available: availableZoneCount == null ? rows.length : rounded(availableZoneCount),
      involved: rows.filter((zone) => zone.assignedFlyers > 0).length,
      full: rows.filter((zone) => zone.status === "full").length,
      partial: rows.filter((zone) => zone.status === "partial").length,
      excluded: rows.filter((zone) => zone.status === "excluded").length,
      firstPriority: rows[0] || null,
    },
    duration: {
      scenarioQuantity: current, dailyCapacity: safeCapacity || null, operatorCount: safeOperators,
      operatorDays, days, calculable: days != null,
      formula: safeCapacity > 0 ? "quantità ÷ capacità giornaliera per operatore ÷ numero operatori" : null,
    },
    score: Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null,
    sources: Array.isArray(sources) ? sources : [],
    confidence: sectionConfidence,
  };
}
