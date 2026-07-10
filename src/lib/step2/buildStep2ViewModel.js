// Fonte unica per le label/valori "primari" mostrati in Step2 (box
// "Risultati della configurazione" e affini). Funzione pura: nessun fetch,
// nessuno stato React, nessuna nuova formula KPI - legge solo valori gia
// calcolati in Step2 e decide in UN SOLO posto quale mostrare.

export function getCoverageStatus(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return "non_coperto";
  if (n >= 90) return "coperto";
  if (n > 0) return "parziale";
  return "non_coperto";
}

/**
 * Funzione per generare il contesto operativo di copertura (es. "fabbisogno del comune")
 */
export function getCoverageContextLabel(areaMode, context) {
  if (areaMode === "radius") {
    const rKm = context?.radiusKm || "";
    return rKm ? `fabbisogno dell'area entro ${rKm} km` : "fabbisogno dell'area selezionata";
  }
  if (areaMode === "custom_zone" || areaMode === "nil") {
    return "fabbisogno delle zone NIL selezionate";
  }
  if (areaMode === "cap") {
    return "fabbisogno dell'area CAP selezionata";
  }
  if (areaMode === "full_municipality") {
    if (context?.isMultiComune) {
      return "fabbisogno del territorio selezionato";
    }
    return "fabbisogno del comune";
  }
  return "fabbisogno del territorio selezionato";
}

/**
 * @param {object} input
 * @param {"full_municipality"|"radius"|"custom_zone"|"cap"|"unconfirmed_address"} input.areaMode
 * @param {string|null} input.cityName - nome del comune/ancora selezionato
 * @param {number|null} input.radiusKm - valorizzato solo se areaMode === "radius"
 * @param {boolean} input.isResidentialStep2
 * @param {boolean} input.isMovementStep2
 * @param {object} input.serviceKpis - { families, poi, businesses, coverage, recommendedFlyers, area }
 * @param {number} input.requiredFlyers
 * @param {number} input.flyerQuantityFromStep1
 * @param {number} input.missingFlyers
 * @param {number} input.zoneCount
 * @param {boolean} input.isNilAnalysis
 * @param {string} input.territoryPluralLabel
 * @param {number} [input.selectedComuniCount]
 * @param {any[]} [input.selectedMunicipalities]
 * @param {string[]} [input.selectedNilNames] - nomi NIL scelte manualmente (solo areaMode "custom_zone")
 * @param {"address"|"nil"|"municipality"|null} [input.radiusCenterSource] - da dove arriva il centro del raggio
 * @param {boolean} [input.usingMunicipalityFullCoverage] - false se un indirizzo e selezionato ma non confermato come comune completo
 * @param {boolean} [input.hasConfirmedZone]
 * @param {boolean} [input.hasValidGeometry]
 * @param {boolean} [input.isCalculationComplete]
 * @param {boolean} [input.hasCalculationError]
 * @param {boolean} [input.hasConfirmedCoverageMode]
 * @param {boolean} [input.hasConfirmedRadius]
 * @param {object|null} [input.selectedSearchPoint] - { label, lat, lng }
 * @param {string|null} [input.coverageDecision] - null | "keepCurrent" | "useRecommended" | "manual"
 * @param {number|null} [input.manualFlyers]
 * @param {number|null} [input.assignedFlyersTotal]
 * @param {boolean} [input.step2ZonesReady]
 * @param {boolean} [input.coverageDecisionReady]
 * @param {boolean} [input.coverageDecisionRequired]
 * @param {string} [input.allocationStatus]
 * @param {boolean} [input.gisTimedOut]
 * @param {boolean} [input.gisLoading]
 * @param {number|null} [input.availableNilCount]
 * @param {object|null} [input.containingNil]
 * @param {object[]} [input.containingNilCandidates]
 * @param {number|null} [input.intersectedNilCount]
 * @param {number|null} [input.selectedNilCount]
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
  selectedMunicipalities,
  selectedNilNames,
  radiusCenterSource,
  usingMunicipalityFullCoverage,
  hasConfirmedZone,
  hasValidGeometry,
  isCalculationComplete,
  hasCalculationError,
  hasConfirmedCoverageMode,
  hasConfirmedRadius,
  selectedSearchPoint,
  coverageDecision,
  manualFlyers,
  assignedFlyersTotal,
  step2ZonesReady = true,
  coverageDecisionReady = true,
  coverageDecisionRequired = false,
  allocationStatus = "success",
  gisTimedOut = false,
  gisLoading = false,
  availableNilCount = 0,
  containingNil = null,
  containingNilCandidates = [],
  intersectedNilCount = 0,
  selectedNilCount = 0,
}) {
  const unitWord = isResidentialStep2 ? "Famiglie" : isMovementStep2 ? "Punti di interesse" : "Aziende";
  const cleanCityName = (cityName || "").trim();
  const municipalityNames = (Array.isArray(selectedMunicipalities) ? selectedMunicipalities : [])
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item.trim();
      return String(item.label || item.name || item.comune_name || item.municipality_name || "").trim();
    })
    .filter(Boolean);
  const municipalityCount = Math.max(Number(selectedComuniCount) || 0, municipalityNames.length);
  const isMultiComune = areaMode === "full_municipality" && municipalityCount > 1;
  const hasSelectedMunicipality = areaMode !== "full_municipality" || municipalityCount > 0 || Boolean(cleanCityName);
  const multiComuneLabel = isMultiComune ? `${municipalityCount} comuni completi` : null;

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
    ? (cleanCityName ? `${cleanCityName} - raggio ${radiusKm} km` : `Area selezionata: raggio ${radiusKm} km`)
    : areaMode === "custom_zone"
      ? (cleanCityName ? `${cleanCityName} - ${nilListLabel}` : nilListLabel)
      : areaMode === "cap"
        ? "CAP selezionati"
        : (usingMunicipalityFullCoverage === false
            ? "Indirizzo selezionato - scegli raggio o comune completo"
            : (isMultiComune ? multiComuneLabel : (cleanCityName ? `${cleanCityName} \u00b7 comune completo` : "Comune completo")));

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
        ? (isMultiComune ? "Copertura territorio selezionato" : "Copertura comune")
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
        : (usingMunicipalityFullCoverage === false ? "Indirizzo selezionato - scegli raggio o comune completo" : (isMultiComune ? multiComuneLabel : "Comune completo"));
  const zoneCountLabel = isNilAnalysis
    ? (areaMode === "full_municipality" ? "NIL disponibili" : areaMode === "radius" ? "NIL intersecate dal raggio" : "Zone NIL coinvolte")
    : (isMultiComune ? "Comuni selezionati" : territoryPluralLabel);

  let contextDemographyLabel = null;
  let contextDemographySubtitle = null;
  let contextDemographyNote = null;

  if (isMultiComune) {
    contextDemographyLabel = "Contesto demografico - territorio selezionato";
    contextDemographySubtitle = multiComuneLabel;
    contextDemographyNote = `Dati aggregati sui ${municipalityCount} comuni selezionati.`;
  } else if (areaMode !== "full_municipality") {
    contextDemographyLabel = cleanCityName ? `Contesto demografico comune ${cleanCityName}` : null;
    contextDemographyNote = `Dati comunali usati come riferimento. La campagna interessa l'area selezionata${areaMode === "radius" && radiusKm ? ` entro ${radiusKm} km` : ""}.`;
  } else {
    contextDemographyLabel = "Profilo Territorio";
    contextDemographyNote = null;
  }

  const coverageDescription = getCoverageContextLabel(areaMode, { radiusKm, isMultiComune });

  const coverageStatus = getCoverageStatus(primaryCoverageValue);
  const hasPositiveArea = Number(serviceKpis?.area) > 0 || areaMode === "cap";
  const hasPositiveReach = Number(primaryFamiliesValue) > 0;
  const hasPositiveRecommended = Number(recommendedFlyersValue) > 0;
  const modeIsConfirmed = areaMode === "radius"
    ? Boolean(hasConfirmedRadius && radiusKm && Number(radiusKm) > 0)
    : areaMode === "custom_zone"
      ? nilNames.length > 0
      : areaMode === "cap"
        ? hasPositiveRecommended
        : Boolean(usingMunicipalityFullCoverage !== false && hasSelectedMunicipality);

  // 1. isGeographicCoverageValid
  const isGeographicCoverageValid = Boolean(
    hasConfirmedZone &&
    hasConfirmedCoverageMode &&
    modeIsConfirmed &&
    hasValidGeometry &&
    isCalculationComplete &&
    !hasCalculationError &&
    hasPositiveArea &&
    hasPositiveReach &&
    hasPositiveRecommended
  );

  // 2. isCoverageDecisionValid
  const isCoverageDecisionValid = Boolean(
    coverageDecision === "keepCurrent" ||
    coverageDecision === "useRecommended" ||
    (coverageDecision === "manual" && Number(manualFlyers) > 0 && Number(assignedFlyersTotal) === Number(manualFlyers)) ||
    (!coverageDecisionRequired && allocationStatus === "success")
  );

  // 3. isCoverageConfigurationValid
  const isCoverageConfigurationValid = Boolean(
    isGeographicCoverageValid &&
    step2ZonesReady &&
    (isCoverageDecisionValid || (!coverageDecisionRequired && allocationStatus === "success"))
  );

  const coverageStatusReason = isCoverageConfigurationValid
    ? "valid"
    : hasCalculationError
      ? "error"
      : !hasConfirmedZone
        ? "missing_zone"
        : !hasConfirmedCoverageMode || !modeIsConfirmed
          ? "waitingForCoverageSelection"
          : !isCalculationComplete
            ? "loading"
            : !hasPositiveReach || !hasPositiveRecommended || !hasPositiveArea
              ? "unavailable"
              : "invalid_geometry";

  // Active Zone Label
  let activeZoneLabel = "Zona 1 \u00b7 Seleziona area";
  if (areaMode === "full_municipality") {
    if (isMultiComune) {
      activeZoneLabel = `Zona 1 \u00b7 ${multiComuneLabel}`;
    } else if (cleanCityName) {
      activeZoneLabel = `Zona 1 \u00b7 ${cleanCityName} \u00b7 comune completo`;
    }
  } else if (areaMode === "radius") {
    const pointName = selectedSearchPoint?.label ? selectedSearchPoint.label.split(",")[0].trim() : cleanCityName;
    if (pointName && radiusKm) {
      activeZoneLabel = `Zona 1 \u00b7 ${pointName} \u00b7 ${radiusKm} km`;
    } else if (radiusKm) {
      activeZoneLabel = `Zona 1 \u00b7 Raggio ${radiusKm} km`;
    }
  } else if (areaMode === "custom_zone" || areaMode === "nil") {
    if (nilNames.length === 1) {
      activeZoneLabel = `Zona 1 \u00b7 NIL ${nilNames[0]}`;
    } else if (nilNames.length > 1) {
      activeZoneLabel = `Zona 1 \u00b7 ${nilNames.length} NIL`;
    } else if (cleanCityName) {
      activeZoneLabel = `Zona 1 \u00b7 ${cleanCityName} \u00b7 NIL`;
    }
  } else if (areaMode === "cap") {
    activeZoneLabel = `Zona 1 \u00b7 CAP selezionati`;
  } else if (cleanCityName) {
    activeZoneLabel = `Zona 1 \u00b7 ${cleanCityName}`;
  }

  // CTA Text and State
  let ctaLabel = "Seleziona la zona per continuare";
  if (gisTimedOut) {
    ctaLabel = "Dati GIS non disponibili";
  } else if (gisLoading || coverageStatusReason === "loading") {
    ctaLabel = "Ricalcolo copertura...";
  } else if (!step2ZonesReady || coverageStatusReason === "missing_zone") {
    ctaLabel = "Seleziona la zona per continuare";
  } else if (coverageStatusReason === "waitingForCoverageSelection") {
    ctaLabel = "Seleziona una modalita di copertura";
  } else if (coverageStatusReason === "error") {
    ctaLabel = "Impossibile completare il calcolo";
  } else if (isGeographicCoverageValid && (!isCoverageDecisionValid && coverageDecisionRequired)) {
    ctaLabel = "Seleziona la quantita per continuare";
  } else if (isCoverageConfigurationValid) {
    ctaLabel = "Continua al preventivo";
  }

  const ctaDisabled = !isCoverageConfigurationValid || gisLoading || gisTimedOut;

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
    coverageDescription,
    coverageStatus,
    coverageStatusReason,
    isGeographicCoverageValid,
    isCoverageDecisionValid,
    isCoverageConfigurationValid,
    activeZoneLabel,
    ctaLabel,
    ctaDisabled,
    cta,
    availableNilCount,
    containingNil,
    containingNilCandidates: Array.isArray(containingNilCandidates) ? containingNilCandidates : [],
    intersectedNilCount,
    selectedNilCount,
  };
}
