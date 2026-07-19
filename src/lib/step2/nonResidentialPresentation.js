const H2H_SURPLUS_TOLERANCE = 0.1;

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function formatIntegerIT(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function classifyH2HQuantity({ inserted, requirement } = {}) {
  const current = nonNegativeInteger(inserted);
  const required = nonNegativeInteger(requirement);
  if (current == null || required == null || required <= 0) {
    return { status: "unavailable", inserted: current, requirement: required, shortage: null, surplus: null };
  }

  const shortage = Math.max(0, required - current);
  const surplus = Math.max(0, current - required);
  const significantSurplus = surplus > Math.round(required * H2H_SURPLUS_TOLERANCE);
  const status = shortage > 0 ? "insufficient" : significantSurplus ? "surplus" : "coherent";
  return { status, inserted: current, requirement: required, shortage, surplus };
}

export function getH2HQuantityMessage(input = {}) {
  const result = classifyH2HQuantity(input);
  if (result.status === "unavailable") return { ...result, title: "Fabbisogno operativo non disponibile", detail: "Il confronto con la quantità inserita non è disponibile." };
  if (result.status === "insufficient") {
    return {
      ...result,
      title: "Quantità inferiore al fabbisogno stimato",
      detail: `Per i punti individuati sono stimati circa ${formatIntegerIT(result.requirement)} volantini. Con ${formatIntegerIT(result.inserted)} volantini mancano ${formatIntegerIT(result.shortage)} copie rispetto al fabbisogno operativo.`,
    };
  }
  if (result.status === "surplus") {
    return {
      ...result,
      title: "Quantità superiore al fabbisogno stimato",
      detail: `Per i punti individuati sono stimati circa ${formatIntegerIT(result.requirement)} volantini. Con ${formatIntegerIT(result.inserted)} volantini risultano ${formatIntegerIT(result.surplus)} copie oltre il fabbisogno operativo.`,
    };
  }
  return {
    ...result,
    title: "Quantità coerente con il fabbisogno stimato",
    detail: `La quantità inserita (${formatIntegerIT(result.inserted)}) è vicina al fabbisogno operativo stimato (${formatIntegerIT(result.requirement)}).`,
  };
}

export function getH2HPoiAccounting({ detected, usable } = {}) {
  const usableCount = nonNegativeInteger(usable) ?? 0;
  const detectedCount = Math.max(nonNegativeInteger(detected) ?? 0, usableCount);
  const excludedCount = Math.max(0, detectedCount - usableCount);
  return {
    detected: detectedCount,
    usable: usableCount,
    excluded: excludedCount,
    exclusionReason: excludedCount > 0
      ? "Record aggregati senza coordinate o dettaglio sufficiente per il modello operativo."
      : null,
  };
}

export function getBusinessContinuationState({
  hasValidZone,
  selectedActivities,
  materialsRequired,
  materialsMissing,
} = {}) {
  const selected = nonNegativeInteger(selectedActivities) ?? 0;
  const required = nonNegativeInteger(materialsRequired);
  const missing = nonNegativeInteger(materialsMissing);

  if (!hasValidZone) return { canContinue: false, reason: "missing_zone", label: "Seleziona la zona per continuare" };
  if (selected < 1) return { canContinue: false, reason: "missing_activities", label: "Seleziona almeno un’attività per continuare" };
  if (required == null || required <= 0) return { canContinue: false, reason: "invalid_materials", label: "Definisci i materiali per continuare" };
  if (missing == null) return { canContinue: false, reason: "invalid_materials", label: "Verifica quantità e materiali per continuare" };
  if (missing > 0) return { canContinue: false, reason: "insufficient_materials", label: `Materiali insufficienti: mancano ${formatIntegerIT(missing)} copie` };
  return { canContinue: true, reason: "valid", label: "Continua allo Step 3" };
}
