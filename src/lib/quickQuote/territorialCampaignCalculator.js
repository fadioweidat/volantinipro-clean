import { getZoneFullCoverageFlyers, computeDoorToDoorCoverage } from "../doorToDoorCoverage.js";

// CALCOLO TERRITORIALE (deterministico) per il Preventivo Rapido.
//
// Riusa le stesse funzioni di Step2 (getZoneFullCoverageFlyers,
// computeDoorToDoorCoverage — src/lib/doorToDoorCoverage.js) per il fabbisogno
// totale e lo stato "sufficient"/"partial": stessa formula, zero duplicazione.
// L'unica logica nuova qui e' la ripartizione proporzionale per-comune, che
// non esiste altrove nel progetto (Step2 usa un'allocazione operativa greedy
// per ordine di selezione zone, pensata per l'assegnazione ai driver — non
// una "raccomandazione" per il cliente finale). E' esattamente il fallback
// esplicitamente consentito quando non esiste un punteggio di priorita'
// affidabile tra zone: distribuzione proporzionale ai dati territoriali reali.
//
// Solo Door to Door ha oggi una fonte dati reale (famiglie/popolazione per
// comune, via analysis-istat). Per Hand to Hand e Business Distribution
// l'endpoint (analysis-poi-search) non restituisce questi campi: la funzione
// segnala esplicitamente `supported: false` invece di inventare un numero.

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Estrae households/population da una riga comuni_breakdown reale, con la
 * stessa catena di fallback gia' usata nel progetto (Step2 e Preventivo
 * Rapido) per i nomi di campo storici e quelli attuali dell'Edge Function.
 */
export function extractMunicipalityTerritorialData(row) {
  if (!row) return { households: null, population: null };
  const households = toFiniteNumber(
    row.families ?? row.households ?? row.householdsTotal ?? row.households_total ?? row.households_in_radius
  );
  const population = toFiniteNumber(
    row.population ?? row.populationTotal ?? row.population_total ?? row.population_in_radius
  );
  return { households, population };
}

/**
 * @param {{ municipalityRows: Array<{ municipality: string, households: number|null, population: number|null, matched: boolean }>, requestedQuantity: number|null, service: string }} input
 */
export function computeTerritorialCampaign({ municipalityRows, requestedQuantity, service }) {
  const rows = Array.isArray(municipalityRows) ? municipalityRows : [];

  if (service !== "d2d") {
    return {
      supported: false,
      reason: "SERVICE_NOT_SUPPORTED",
      breakdown: rows.map((r) => ({
        municipality: r.municipality,
        households: null,
        population: null,
        recommendedQuantity: null,
        requestedQuantity: null,
        estimatedCoverage: null,
      })),
    };
  }

  if (rows.length === 0) {
    return { supported: true, hasData: false, breakdown: [] };
  }

  const matchedRows = rows.filter((r) => r.matched && Number.isFinite(r.households) && r.households > 0);
  const allMatched = rows.every((r) => r.matched);
  const totalHouseholds = matchedRows.reduce((sum, r) => sum + r.households, 0);

  // Riusa esattamente la formula di Step2: ogni comune e' una "zona" con un
  // fabbisogno pieno pari alle famiglie stimate.
  const zones = matchedRows.map((r) => ({ id: r.municipality, name: r.municipality, families: r.households }));
  const recommendedQuantity = zones.length > 0 ? zones.reduce((sum, z) => sum + getZoneFullCoverageFlyers(z), 0) : null;

  const hasRequestedQuantity = requestedQuantity != null && Number.isFinite(Number(requestedQuantity)) && Number(requestedQuantity) > 0;
  const effectiveQuantity = hasRequestedQuantity ? Number(requestedQuantity) : recommendedQuantity;

  const coverageDetail = allMatched && recommendedQuantity > 0 && effectiveQuantity != null
    ? computeDoorToDoorCoverage({ insertedFlyers: effectiveQuantity, selectedZones: zones })
    : null;

  const estimatedCoverage = allMatched && recommendedQuantity > 0 && effectiveQuantity != null
    ? Math.min(100, Math.round((effectiveQuantity / recommendedQuantity) * 100))
    : null;

  // Ripartizione proporzionale per-comune della quantita' effettiva (nuova
  // logica, non presente altrove — vedi commento in testa al file).
  const breakdown = rows.map((r) => {
    if (!r.matched || !Number.isFinite(r.households)) {
      return {
        municipality: r.municipality,
        households: null,
        population: r.population ?? null,
        recommendedQuantity: null,
        requestedQuantity: null,
        estimatedCoverage: null,
      };
    }
    const municipalityRecommended = Math.round(r.households);
    const municipalityRequested = !allMatched || totalHouseholds <= 0 || effectiveQuantity == null
      ? null
      : effectiveQuantity >= recommendedQuantity
        ? municipalityRecommended
        : Math.round((effectiveQuantity * r.households) / totalHouseholds);
    return {
      municipality: r.municipality,
      households: municipalityRecommended,
      population: r.population != null ? Math.round(r.population) : null,
      recommendedQuantity: municipalityRecommended,
      requestedQuantity: municipalityRequested,
      estimatedCoverage: municipalityRequested != null && municipalityRecommended > 0
        ? Math.min(100, Math.round((municipalityRequested / municipalityRecommended) * 100))
        : null,
    };
  });

  return {
    supported: true,
    hasData: true,
    allMatched,
    unmatchedMunicipalities: rows.filter((r) => !r.matched).map((r) => r.municipality),
    recommendedQuantity: allMatched ? recommendedQuantity : null,
    requestedQuantity: hasRequestedQuantity ? Number(requestedQuantity) : null,
    effectiveQuantity: allMatched ? effectiveQuantity : null,
    estimatedCoverage,
    status: !allMatched ? "partial-data" : !hasRequestedQuantity ? "auto" : coverageDetail?.status || null,
    coverageDetail,
    breakdown,
  };
}

// PRESENTAZIONE / CONSIGLIO — testo commerciale deterministico (fallback
// sempre disponibile, indipendente da AI — sez. 7 del ticket). Stesso input
// contract previsto per un'eventuale generazione AI futura, cosi' che
// quest'ultima possa sostituire solo questa funzione senza toccare il calcolo.
export function buildQuickQuoteExplanation({ service, municipalities, requestedQuantity, recommendedQuantity, estimatedCoverage, status }) {
  const comuniLabel = Array.isArray(municipalities) && municipalities.length > 0
    ? municipalities.length === 1
      ? municipalities[0]
      : `i ${municipalities.length} comuni selezionati`
    : "la zona selezionata";

  if (service !== "d2d") {
    return "Per questo servizio la quantità consigliata automatica non è ancora disponibile: inserisci la quantità desiderata per ricevere una stima.";
  }
  if (status === "partial-data") {
    return `Alcuni dati territoriali per ${comuniLabel} non sono ancora disponibili: la stima mostrata riguarda solo i comuni con dati confermati.`;
  }
  if (recommendedQuantity == null) {
    return `Seleziona un comune per ${comuniLabel} per calcolare automaticamente la quantità consigliata in base ai dati territoriali reali.`;
  }
  const recommendedLabel = recommendedQuantity.toLocaleString("it-IT");
  if (!requestedQuantity) {
    return `Per una copertura completa di ${comuniLabel} consigliamo ${recommendedLabel} volantini, calcolati sui dati territoriali reali disponibili.`;
  }
  const requestedLabel = requestedQuantity.toLocaleString("it-IT");
  if (status === "partial") {
    return `Con ${requestedLabel} volantini la copertura di ${comuniLabel} sarebbe parziale (circa ${estimatedCoverage}%). Per una distribuzione completa consigliamo ${recommendedLabel} copie; in alternativa puoi mantenere ${requestedLabel} copie concentrando la campagna su una copertura ridotta.`;
  }
  if (requestedQuantity > recommendedQuantity) {
    return `La quantità indicata (${requestedLabel}) supera quella necessaria per la copertura territoriale stimata di ${comuniLabel} (${recommendedLabel}).`;
  }
  return `La quantità indicata (${requestedLabel}) è adeguata per coprire ${comuniLabel} secondo i dati territoriali reali disponibili.`;
}
