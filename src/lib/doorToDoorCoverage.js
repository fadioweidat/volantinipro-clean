function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function getZoneFullCoverageFlyers(zone) {
  return Math.max(
    0,
    Math.round(
      toNumber(zone?.volantiniNelRaggio) ||
      toNumber(zone?.volantini_nel_raggio) ||
      toNumber(zone?.familiesInRadius) ||
      toNumber(zone?.families_in_radius) ||
      toNumber(zone?.families)
    )
  );
}

/**
 * Operational margin included in the recommended quantity, as a percentage
 * of households. Same formula as Step 2 (buildStep2TruthModel
 * operationalMarginPct): one decimal, null when it cannot be derived.
 */
export function getOperationalMarginPct(households, recommendedFlyers) {
  const base = toNumber(households);
  const recommended = toNumber(recommendedFlyers);
  if (!(base > 0) || !(recommended > 0)) return null;
  return Math.round(((recommended - base) / base) * 1000) / 10;
}

/** "Include margine operativo del 10%" — null when there is no positive margin to state. */
export function formatOperationalMarginNote(marginPct) {
  const pct = Number(marginPct);
  if (marginPct === null || marginPct === undefined || !Number.isFinite(pct) || pct <= 0) return null;
  return `Include margine operativo del ${pct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

export function computeDoorToDoorCoverage({ insertedFlyers, selectedZones }) {
  const inserted = Math.max(0, Math.round(toNumber(insertedFlyers)));
  const zones = Array.isArray(selectedZones) ? selectedZones : [];
  const fullCoverageFlyers = zones.reduce((sum, zone) => sum + getZoneFullCoverageFlyers(zone), 0);
  const missingFlyers = Math.max(0, fullCoverageFlyers - inserted);
  const remainingFlyers = inserted >= fullCoverageFlyers ? inserted - fullCoverageFlyers : 0;
  const status = inserted < fullCoverageFlyers ? "partial" : "sufficient";

  if (status === "partial") {
    return {
      fullCoverageFlyers,
      missingFlyers,
      remainingFlyers,
      status,
      canContinue: true,
      ctaLabel: "Continua con copertura parziale",
      alertLabel: "Copertura parziale automatica",
      alertMessage: `Hai ${inserted.toLocaleString("it-IT")} volantini. Per coprire tutte le zone servono ${fullCoverageFlyers.toLocaleString("it-IT")}. Mancano ${missingFlyers.toLocaleString("it-IT")}.`,
    };
  }

  return {
    fullCoverageFlyers,
    missingFlyers: 0,
    remainingFlyers,
    status,
    canContinue: true,
    ctaLabel: "Continua al calendario",
    alertLabel: "Quantita sufficiente",
    alertMessage: `Quantita sufficiente per coprire le zone selezionate. Avanzano ${remainingFlyers.toLocaleString("it-IT")} volantini.`,
  };
}
