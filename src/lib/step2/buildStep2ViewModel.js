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
    return "fabbisogno operativo del raggio";
  }
  if (areaMode === "custom_zone" || areaMode === "nil") {
    return "fabbisogno operativo delle zone selezionate";
  }
  if (areaMode === "cap") {
    return "fabbisogno operativo delle zone selezionate";
  }
  if (areaMode === "full_municipality") {
    if (context?.isMultiComune) {
      return "fabbisogno operativo delle zone selezionate";
    }
    return "fabbisogno operativo del Comune";
  }
  return "fabbisogno operativo delle zone selezionate";
}

/**
 * Funzione per formattare la copertura come proporzione testuale (es. "circa 2 famiglie su 3")
 */
export function formatCoverageProportion(pct, unitWord = "famiglia", pluralWord = "famiglie") {
  const p = Number(pct);
  if (!Number.isFinite(p) || p <= 0) return "";
  if (p >= 99.995) return "Copertura completa stimata";
  if (p >= 95) return `Quasi la totalità delle ${pluralWord}`;
  if (p >= 88) return `circa 9 ${pluralWord} su 10`;
  if (p >= 78) return `circa 4 ${pluralWord} su 5`;
  if (p >= 72) return `circa 3 ${pluralWord} su 4`;
  if (p >= 63) return `circa 2 ${pluralWord} su 3`;
  if (p >= 55) return `circa 3 ${pluralWord} su 5`;
  if (p >= 45) return `circa 1 ${unitWord} su 2`;
  if (p >= 36) return `circa 2 ${pluralWord} su 5`;
  if (p >= 30) return `circa 1 ${unitWord} su 3`;
  if (p >= 22) return `circa 1 ${unitWord} su 4`;
  if (p >= 18) return `circa 1 ${unitWord} su 5`;
  if (p >= 8) return `circa 1 ${unitWord} su ${Math.max(1, Math.round(100 / p))}`;
  return `meno di 1 ${unitWord} su 10`;
}

/**
 * @param {object} input
 * @param {"full_municipality"|"radius"|"custom_zone"|"cap"|"unconfirmed_address"} input.areaMode
 * @param {string|null} input.cityName - nome del comune/ancora selezionato
 * @param {number|null} input.radiusKm - valorizzato solo se areaMode === "radius"
 * @param {object} input.truthModel - fonte canonica di quantità, copertura,
 * disponibilità, durata e allocazione; questa funzione aggiunge solo label e
 * stato visuale.
 * @param {boolean} input.isNilAnalysis
 * @param {string} input.territoryPluralLabel
 * @param {number} [input.selectedComuniCount]
 * @param {any[]} [input.selectedMunicipalities]
 * @param {string[]} [input.selectedNilNames] - nomi NIL scelte manualmente (solo areaMode "custom_zone")
 * @param {"address"|"nil"|"municipality"|null} [input.radiusCenterSource] - da dove arriva il centro del raggio
 * @param {object|null} [input.effectiveReferencePoint] - punto canonico usato da mappa, label e validazione raggio
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
export function buildStep2ViewModel(params = {}) {
  const {
    truthModel,
    areaMode = "municipality",
    primarySource: inputPrimarySource = null,
    cityName = null,
    radiusKm = null,
    isNilAnalysis = false,
    territoryPluralLabel = "comuni",
    selectedComuniCount = 0,
    selectedMunicipalities = [],
    selectedNilNames = [],
    radiusCenterSource = null,
    usingMunicipalityFullCoverage = null,
    hasConfirmedZone = true,
    hasValidGeometry = true,
    isCalculationComplete = true,
    hasCalculationError = false,
    hasConfirmedCoverageMode = true,
    hasConfirmedRadius = true,
    selectedSearchPoint = null,
    coverageDecision = "keepCurrent",
    manualFlyers = null,
    assignedFlyersTotal = null,
    step2ZonesReady = true,
    coverageDecisionReady = true,
    coverageDecisionRequired = false,
    allocationStatus = "idle",
    gisTimedOut = false,
    gisLoading = false,
    availableNilCount = 0,
    containingNil = null,
    containingNilCandidates = [],
    intersectedNilCount = 0,
    selectedNilCount = 0,
  } = params;

  if (!truthModel) throw new TypeError("truthModel is required");
  const serviceKey = truthModel.service?.key || "d2d";
  const isResidentialStep2 = serviceKey === "d2d";
  const isMovementStep2 = serviceKey === "h2h";
  const activeServiceData = isResidentialStep2
    ? truthModel.d2d
    : isMovementStep2
      ? truthModel.h2h
      : truthModel.business;
  const serviceKpis = activeServiceData?.kpis || {};
  const zoneCount = truthModel.zones?.available ?? truthModel.zones?.involved ?? null;

  const cleanCityName = typeof cityName === "string" ? cityName.trim() : "";
  const unitWord = isResidentialStep2 ? "famiglia" : isMovementStep2 ? "punto" : "azienda";
  const pluralWord = isResidentialStep2 ? "famiglie" : isMovementStep2 ? "punti" : "aziende";
  const isMultiComune = areaMode === "full_municipality" && (
    Number(selectedComuniCount) > 1 ||
    (Array.isArray(selectedMunicipalities) && selectedMunicipalities.length > 1)
  );

  const municipalityNames = Array.isArray(selectedMunicipalities)
    ? selectedMunicipalities
        .map(item => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            return (item.label || item.name || item.comune_name || item.municipality_name || "").trim();
          }
          return "";
        })
        .filter(Boolean)
    : [];
  const municipalityCount = Math.max(Number(selectedComuniCount) || 0, municipalityNames.length);
  const multiComuneLabel = municipalityNames.length > 0
    ? `${municipalityCount} comuni: ${municipalityNames.slice(0, 3).join(", ")}${municipalityNames.length > 3 ? "..." : ""}`
    : `${municipalityCount} comuni selezionati`;

  const nilNames = Array.isArray(selectedNilNames)
    ? selectedNilNames.map(item => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
  const nilListLabel = nilNames.length > 0 ? nilNames.join(", ") : "NIL / quartiere";
  const selectedSearchPointLabel = typeof selectedSearchPoint?.label === "string"
    ? selectedSearchPoint.label.trim()
    : "";
  const hasExplicitRadiusPoint = Boolean(
    selectedSearchPointLabel &&
    radiusCenterSource &&
    radiusCenterSource !== "municipality"
  );
  const radiusOriginLabel = areaMode === "radius"
    ? (hasExplicitRadiusPoint
        ? (selectedSearchPointLabel ? `da ${selectedSearchPointLabel}` : "da indirizzo selezionato")
        : (cleanCityName ? `dal centro di ${cleanCityName}` : "dal centro selezionato"))
    : "";
  
  const hasSelectedMunicipality = areaMode !== "full_municipality" || municipalityCount > 0 || Boolean(cleanCityName);

  const primarySource = inputPrimarySource || (
    areaMode === "radius"
      ? "radius"
      : areaMode === "custom_zone"
        ? "custom_zone"
        : areaMode === "cap"
          ? "cap"
          : (usingMunicipalityFullCoverage === false
              ? "address"
              : (isMultiComune ? "multi_municipality" : "municipality"))
  );

  // Il KPI primario dipende dal servizio. Usare sempre `families` azzerava
  // Hand to Hand e Business anche quando POI/aziende erano disponibili,
  // bloccando inoltre la validazione geografica e la CTA dello Step 2.
  const primaryFamiliesValue = isResidentialStep2
    ? (serviceKpis?.families ?? null)
    : isMovementStep2
      ? (serviceKpis?.poi ?? null)
      : (serviceKpis?.businesses ?? null);
  const primaryAreaLabel = areaMode === "radius"
    ? `Raggio ${radiusKm} km ${radiusOriginLabel}`
    : areaMode === "custom_zone"
      ? (cleanCityName ? `${cleanCityName} - ${nilListLabel}` : nilListLabel)
      : areaMode === "cap"
        ? "CAP selezionati"
        : (usingMunicipalityFullCoverage === false
            ? (containingNil?.name ? `${selectedSearchPoint?.label?.split(",")[0]?.trim() || "Indirizzo"} (${containingNil.name})` : "Indirizzo selezionato - scegli raggio o comune completo")
            : (isMultiComune ? multiComuneLabel : (cleanCityName ? `${cleanCityName} \u00b7 comune completo` : "Comune completo")));

  const primaryFamiliesLabel = areaMode === "radius"
    ? (isResidentialStep2 ? "Famiglie/cassette stimate nel raggio" : `${unitWord} nell'area ${radiusKm} km`)
    : areaMode === "custom_zone"
      ? (isResidentialStep2 ? "Famiglie/cassette stimate nel territorio" : `${unitWord} NIL selezionate`)
      : (isResidentialStep2 ? "Famiglie/cassette stimate nel territorio" : isMovementStep2 ? "Punti di interesse" : "Aziende raggiungibili");

  const primaryCoverageValue = truthModel.coverage?.operationalPct ?? null;
  const primaryCoverageProportionLabel = primaryCoverageValue != null
    ? formatCoverageProportion(primaryCoverageValue, unitWord, pluralWord)
    : null;

  const recommendedFlyersValue = truthModel.quantity?.recommendedRequirement ?? null;
  const primaryCoverageLabel = (recommendedFlyersValue > 0 && (recommendedFlyersValue !== primaryFamiliesValue || areaMode === "radius" || areaMode === "custom_zone" || usingMunicipalityFullCoverage === false))
    ? "Copertura del fabbisogno operativo"
    : areaMode === "radius"
      ? `Copertura area ${radiusKm} km`
      : areaMode === "custom_zone"
        ? "Copertura NIL selezionate"
        : areaMode === "full_municipality"
          ? (isMultiComune ? "Copertura territorio selezionato" : "Copertura comune")
          : "Copertura";

  const recommendedFlyersLabel = areaMode === "radius"
    ? `Quantità consigliata per area ${radiusKm} km`
    : areaMode === "custom_zone"
      ? "Quantità consigliata per NIL selezionate"
      : "Quantità consigliata";

  const insertedFlyersValue = truthModel.quantity?.inserted ?? null;
  const missingFlyersValue = truthModel.quantity?.shortage ?? null;
  const surplusFlyersValue = truthModel.quantity?.surplus ?? null;

  const territoryLabel = areaMode === "radius"
    ? `Raggio ${radiusKm} km ${radiusOriginLabel}`
    : areaMode === "custom_zone"
      ? "NIL / quartiere"
      : areaMode === "cap"
        ? "CAP selezionati"
        : (usingMunicipalityFullCoverage === false ? (containingNil?.name ? `Indirizzo in zona ${containingNil.name}` : "Indirizzo selezionato - scegli raggio o comune completo") : (isMultiComune ? multiComuneLabel : "Comune completo"));
  const zoneCountLabel = !isResidentialStep2
    ? "Aree selezionate"
    : isNilAnalysis || containingNil?.name
      ? (areaMode === "full_municipality" && !containingNil?.name ? "NIL disponibili" : areaMode === "radius" ? "NIL intersecate dal raggio" : "Zone NIL coinvolte")
      : (isMultiComune ? "Comuni selezionati" : territoryPluralLabel);

  let contextDemographyLabel = null;
  let contextDemographySubtitle = null;
  let contextDemographyNote = null;

  if (isMultiComune) {
    contextDemographyLabel = "Contesto demografico - territorio selezionato";
    contextDemographySubtitle = multiComuneLabel;
    contextDemographyNote = `Dati aggregati sui ${municipalityCount} comuni selezionati.`;
  } else if (areaMode !== "full_municipality") {
    contextDemographyLabel = cleanCityName ? `Contesto demografico \u00b7 ${cleanCityName}` : "Contesto demografico";
    contextDemographyNote = "Dati comunali di riferimento \u2014 non rappresentano i valori del raggio.";
  } else {
    contextDemographyLabel = cleanCityName ? `Contesto demografico \u00b7 ${cleanCityName}` : "Profilo Territorio";
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

  const isGeographicCoverageValid = Boolean(
    truthModel.calculation?.status === "ready" &&
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
  const hasUsableCoverageData = Boolean(
    truthModel.availability?.coverage &&
    truthModel.calculation?.status === "ready"
  );

  const isCoverageDecisionValid = Boolean(
    coverageDecision === "keepCurrent" ||
    coverageDecision === "useRecommended" ||
    (coverageDecision === "manual" && Number(manualFlyers) > 0 && Number(assignedFlyersTotal) === Number(manualFlyers)) ||
    (!coverageDecisionRequired && allocationStatus === "success")
  );

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

  let activeZoneLabel = "Zona 1 \u00b7 Seleziona area";
  if (usingMunicipalityFullCoverage === false) {
    activeZoneLabel = "Zona 1 \u00b7 Modalit\u00e0 da scegliere";
  } else if (areaMode === "full_municipality") {
    if (isMultiComune) {
      activeZoneLabel = `Zona 1 \u00b7 ${multiComuneLabel}`;
    } else if (cleanCityName) {
      activeZoneLabel = `Zona 1 \u00b7 ${cleanCityName} \u00b7 comune completo`;
    }
  } else if (areaMode === "radius") {
    const ptName = selectedSearchPoint?.label?.trim() || cleanCityName;
    if (ptName && radiusKm) {
      activeZoneLabel = `Zona 1 \u00b7 ${ptName} \u00b7 ${radiusKm} km`;
    } else if (radiusKm) {
      activeZoneLabel = `Zona 1 \u00b7 Raggio ${radiusKm} km`;
    }
  } else if (areaMode === "custom_zone" || areaMode === "nil") {
    activeZoneLabel = `Zona 1 \u00b7 ${nilListLabel}`;
  } else if (areaMode === "cap") {
    activeZoneLabel = `Zona 1 \u00b7 CAP selezionati`;
  } else if (cleanCityName) {
    activeZoneLabel = `Zona 1 \u00b7 ${cleanCityName}`;
  }

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
    ctaLabel = "Continua allo Step 3";
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
    primaryCoverageProportionLabel,
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
    coverageStatusLabel: coverageStatusReason,
    coverageStatusReason,
    hasUsableCoverageData,
    isGeographicCoverageValid,
    isCoverageDecisionValid,
    isCoverageConfigurationValid,
    activeZoneLabel,
    primaryCtaLabel: ctaLabel,
    ctaLabel,
    ctaDisabled,
    coverageContextLabel: coverageDescription,
    cta,
    availableNilCount,
    containingNil,
    containingNilCandidates: Array.isArray(containingNilCandidates) ? containingNilCandidates : [],
    intersectedNilCount,
    selectedNilCount,
  };
}
