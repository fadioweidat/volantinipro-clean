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
