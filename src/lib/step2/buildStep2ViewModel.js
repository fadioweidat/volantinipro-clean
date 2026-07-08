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
 * @param {string[]} [input.selectedNilNames] - nomi NIL scelte manualmente (solo areaMode "custom_zone")
 * @param {"address"|"nil"|"municipality"|null} [input.radiusCenterSource] - da dove arriva il centro del raggio
 * @param {boolean} [input.usingMunicipalityFullCoverage] - false se un indirizzo è selezionato ma non confermato come comune completo
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
  selectedComuniCount,
  selectedNilNames,
  radiusCenterSource,
  usingMunicipalityFullCoverage,
}) {
  const unitWord = isResidentialStep2 ? "Famiglie" : isMovementStep2 ? "Punti di interesse" : "Aziende";
  const cleanCityName = (cityName || "").trim();

  // Da dove arrivano i numeri primari — MAI "first_nil" come fallback, e MAI
  // "municipality" per un indirizzo non confermato (usingMunicipalityFullCoverage
  // false): "custom_zone" (→ selected_nil) esiste solo quando l'utente ha
  // scelto esplicitamente la modalità NIL / Quartieri; "address_radius" solo
  // quando il raggio è centrato su un punto/indirizzo cercato.
  const primarySource = areaMode === "radius"
    ? (radiusCenterSource === "address" ? "address_radius" : "radius")
    : areaMode === "custom_zone"
      ? "selected_nil"
      : areaMode === "cap"
        ? "cap"
        : (usingMunicipalityFullCoverage === false ? "unconfirmed_address" : "municipality");

  const primaryFamiliesValue = isResidentialStep2
    ? (serviceKpis?.families || 0)
    : isMovementStep2
      ? (serviceKpis?.poi || 0)
      : (serviceKpis?.businesses || 0);

  const nilNames = Array.isArray(selectedNilNames) ? selectedNilNames.filter(Boolean) : [];
  const nilListLabel = nilNames.length === 0
    ? "NIL selezionate"
    : nilNames.length <= 2
      ? `NIL ${nilNames.join(", ")}`
      : `${nilNames.length} NIL selezionate`;

  const primaryAreaLabel = areaMode === "radius"
    ? (cleanCityName ? `${cleanCityName} · raggio ${radiusKm} km` : `Area selezionata: raggio ${radiusKm} km`)
    : areaMode === "custom_zone"
      ? (cleanCityName ? `${cleanCityName} · ${nilListLabel}` : nilListLabel)
      : areaMode === "cap"
        ? "CAP selezionati"
        : (usingMunicipalityFullCoverage === false
            ? "Indirizzo selezionato — scegli raggio o comune completo"
            : (cleanCityName ? `${cleanCityName} · comune completo` : "Comune completo"));

  const primaryFamiliesLabel = areaMode === "radius"
    ? `${unitWord} nell'area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? `${unitWord} NIL selezionate`
      : (isResidentialStep2 ? "Famiglie raggiungibili" : isMovementStep2 ? "Punti di interesse" : "Aziende raggiungibili");

  const primaryCoverageValue = Number.isFinite(Number(serviceKpis?.coverage)) ? Number(serviceKpis.coverage) : null;
  const primaryCoverageLabel = areaMode === "radius"
    ? `Copertura area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? "Copertura NIL selezionate"
      : areaMode === "full_municipality"
        ? "Copertura comune"
        : "Copertura";

  const recommendedFlyersValue = Number(requiredFlyers) > 0 ? Number(requiredFlyers) : Number(serviceKpis?.recommendedFlyers || 0);
  const recommendedFlyersLabel = areaMode === "radius"
    ? `Volantini consigliati per area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? "Volantini consigliati per NIL selezionate"
      : "Volantini consigliati";

  const insertedFlyersValue = Number(flyerQuantityFromStep1) || 0;
  const missingFlyersValue = Number(missingFlyers) > 0
    ? Number(missingFlyers)
    : Math.max(0, recommendedFlyersValue - insertedFlyersValue);
  const surplusFlyersValue = Math.max(0, insertedFlyersValue - recommendedFlyersValue);

  const territoryLabel = areaMode === "radius"
    ? (radiusCenterSource === "address" || radiusCenterSource === "nil" ? `Raggio da punto (${radiusKm} km)` : `Raggio ${radiusKm} km`)
    : areaMode === "custom_zone"
      ? "NIL / quartiere"
      : areaMode === "cap"
        ? "CAP selezionati"
        : (usingMunicipalityFullCoverage === false ? "Indirizzo selezionato — scegli raggio o comune completo" : "Comune completo");
  const zoneCountLabel = isNilAnalysis
    ? (areaMode === "full_municipality" ? "NIL disponibili" : areaMode === "radius" ? "NIL intersecate dal raggio" : "Zone NIL coinvolte")
    : territoryPluralLabel;

  const isMultiComune = Number(selectedComuniCount) > 1;
  let contextDemographyLabel = null;
  let contextDemographySubtitle = null;
  let contextDemographyNote = null;

  if (isMultiComune) {
    contextDemographyLabel = "Contesto demografico comune attivo";
    contextDemographySubtitle = cleanCityName || null;
    contextDemographyNote = "Dati riferiti al comune attivo. Il calcolo copertura usa tutti i comuni selezionati.";
  } else if (areaMode !== "full_municipality") {
    contextDemographyLabel = cleanCityName ? `Contesto demografico comune ${cleanCityName}` : null;
    contextDemographyNote = `Dati comunali usati come riferimento. La copertura viene calcolata sull'area selezionata${areaMode === "radius" && radiusKm ? ` di ${radiusKm} km` : ""}.`;
  } else {
    contextDemographyLabel = "Profilo Territorio";
    contextDemographyNote = null;
  }

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
    primarySource,
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
    contextDemographySubtitle,
    contextDemographyNote,
    coverageStatus,
    cta,
  };
}
