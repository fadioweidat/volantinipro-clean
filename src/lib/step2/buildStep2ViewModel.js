// Fonte unica per le label/valori "primari" mostrati in Step2 (box
// "Risultati della configurazione" e affini). Funzione pura: nessun fetch,
// nessuno stato React, nessuna nuova formula KPI — legge solo valori già
// calcolati in Step2 (serviceKpis, requiredFlyers, areaMode, ecc.) e decide
// in UN SOLO posto quale mostrare come "primario" in base ad areaMode,
// invece di ripetere lo stesso branching in punti diversi della UI (causa
// storica delle incoerenze Comune/Raggio/NIL su questo schermo).

export function getCoverageStatus(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return "non_coperto";
  if (n >= 90) return "coperto";
  if (n > 0) return "parziale";
  return "non_coperto";
}

/**
 * @param {object} input
 * @param {"full_municipality"|"radius"|"custom_zone"|"cap"} input.areaMode
 * @param {string|null} input.cityName - nome del comune/ancora selezionato
 * @param {number|null} input.radiusKm - valorizzato solo se areaMode === "radius"
 * @param {boolean} input.isResidentialStep2
 * @param {boolean} input.isMovementStep2
 * @param {object} input.serviceKpis - { families, poi, businesses, coverage, recommendedFlyers }
 * @param {number} input.requiredFlyers
 * @param {number} input.flyerQuantityFromStep1
 * @param {number} input.missingFlyers
 * @param {number} input.zoneCount
 * @param {boolean} input.isNilAnalysis
 * @param {string} input.territoryPluralLabel
 */
export function buildStep2ViewModel({
  areaMode,
  cityName,
  radiusKm,
  isResidentialStep2,
  isMovementStep2,
  serviceKpis,
  requiredFlyers,
  flyerQuantityFromStep1,
  missingFlyers,
  zoneCount,
  isNilAnalysis,
  territoryPluralLabel,
}) {
  const unitWord = isResidentialStep2 ? "Famiglie" : isMovementStep2 ? "Punti di interesse" : "Aziende";
  const cleanCityName = (cityName || "").trim();

  const primaryFamiliesValue = isResidentialStep2
    ? (serviceKpis?.families || 0)
    : isMovementStep2
      ? (serviceKpis?.poi || 0)
      : (serviceKpis?.businesses || 0);

  const primaryAreaLabel = areaMode === "radius"
    ? `Area selezionata: raggio ${radiusKm} km`
    : areaMode === "custom_zone"
      ? `Area operativa${cleanCityName ? ` ${cleanCityName}` : ""}`
      : areaMode === "cap"
        ? "CAP selezionati"
        : "Comune completo";

  const primaryFamiliesLabel = areaMode === "radius"
    ? `${unitWord} nell'area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? `${unitWord} area operativa`
      : (isResidentialStep2 ? "Famiglie raggiungibili" : isMovementStep2 ? "Punti di interesse" : "Aziende raggiungibili");

  const primaryCoverageValue = Number.isFinite(Number(serviceKpis?.coverage)) ? Number(serviceKpis.coverage) : null;
  const primaryCoverageLabel = areaMode === "radius"
    ? `Copertura area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? "Copertura area operativa"
      : areaMode === "full_municipality"
        ? "Copertura comune"
        : "Copertura";

  const recommendedFlyersValue = Number(requiredFlyers) > 0 ? Number(requiredFlyers) : Number(serviceKpis?.recommendedFlyers || 0);
  const recommendedFlyersLabel = areaMode === "radius"
    ? `Volantini consigliati per area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? "Volantini consigliati per area operativa"
      : "Volantini consigliati";

  const insertedFlyersValue = Number(flyerQuantityFromStep1) || 0;
  const missingFlyersValue = Number(missingFlyers) > 0
    ? Number(missingFlyers)
    : Math.max(0, recommendedFlyersValue - insertedFlyersValue);
  const surplusFlyersValue = Math.max(0, insertedFlyersValue - recommendedFlyersValue);

  const territoryLabel = areaMode === "radius" ? `Raggio ${radiusKm} km` : primaryAreaLabel;
  const zoneCountLabel = isNilAnalysis ? "Zone NIL coinvolte" : territoryPluralLabel;

  const contextDemographyLabel = areaMode !== "full_municipality" && cleanCityName
    ? `Contesto demografico comune ${cleanCityName}`
    : null;
  const contextDemographyNote = areaMode !== "full_municipality"
    ? `Dati comunali usati come riferimento. La copertura viene calcolata sull'area selezionata${areaMode === "radius" && radiusKm ? ` di ${radiusKm} km` : ""}.`
    : null;

  const coverageStatus = getCoverageStatus(primaryCoverageValue);

  const cta = insertedFlyersValue > recommendedFlyersValue && recommendedFlyersValue > 0
    ? {
        show: true,
        label: `Adatta a ${recommendedFlyersValue.toLocaleString("it-IT", { useGrouping: true })} volantini`,
        targetQuantity: recommendedFlyersValue,
      }
    : { show: false, label: null, targetQuantity: null };

  return {
    areaMode,
    primaryAreaLabel,
    primaryFamiliesLabel,
    primaryFamiliesValue,
    primaryCoverageLabel,
    primaryCoverageValue,
    recommendedFlyersLabel,
    recommendedFlyersValue,
    insertedFlyersValue,
    missingFlyersValue,
    surplusFlyersValue,
    territoryLabel,
    zoneCountLabel,
    zoneCountValue: zoneCount,
    contextDemographyLabel,
    contextDemographyNote,
    coverageStatus,
    cta,
  };
}
