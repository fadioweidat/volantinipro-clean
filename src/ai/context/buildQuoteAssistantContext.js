const SERVICE_DESCRIPTIONS = Object.freeze({
  d2d: Object.freeze({
    key: "d2d",
    title: "Door to Door",
    description: "Distribuzione nelle cassette postali delle abitazioni nelle zone selezionate.",
  }),
  h2h: Object.freeze({
    key: "h2h",
    title: "Hand to Hand",
    description: "Consegna a mano in punti di passaggio e luoghi operativi selezionati.",
  }),
  b2b: Object.freeze({
    key: "b2b",
    title: "Distribuzione presso attività e aziende",
    description: "Consegna di materiale presso attività, esercizi e aziende selezionati.",
  }),
});

const STEP_BY_PAGE = Object.freeze({ step1: 1, step2: 2, step3: 3, step4: 4 });

const finiteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const safeText = (value, max = 120) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
};

const serviceKey = (data = {}) => {
  const raw = data.selectedService || data.activeService || data.type;
  if (["door_to_door", "door-to-door", "door"].includes(raw)) return "d2d";
  if (["hand_to_hand", "hand-to-hand"].includes(raw)) return "h2h";
  if (["business", "business-distribution", "business_b2b"].includes(raw)) return "b2b";
  return SERVICE_DESCRIPTIONS[raw] ? raw : null;
};

const municipality = (data = {}) => {
  const selected = Array.isArray(data.selectedComuni) ? data.selectedComuni[0] : null;
  if (typeof selected === "string") return safeText(selected);
  return safeText(selected?.label || selected?.name || selected?.comune_name || data.cityName || data.comune || data.city?.label || data.city?.name || data.searchedLocation);
};

const province = (data = {}) => {
  const selected = Array.isArray(data.selectedComuni) ? data.selectedComuni[0] : null;
  return safeText(selected?.provincia || selected?.province || selected?.sigla_provincia || selected?.prov || data.provincia || data.province || data.city?.provincia || data.city?.province);
};

const region = (data = {}) => {
  const selected = Array.isArray(data.selectedComuni) ? data.selectedComuni[0] : null;
  return safeText(selected?.regione || selected?.region || data.regione || data.region || data.city?.regione || data.city?.region);
};

export const QUOTE_ASSISTANT_QUICK_QUESTIONS = Object.freeze({
  step1: Object.freeze(["Come funziona?", "Quanti volantini mi consigli?", "Posso modificare dopo?"]),
  step2: Object.freeze(["Cosa significa questa copertura?", "Comune o Raggio?", "Copro tutta la zona?"]),
  step3: Object.freeze(["Quale servizio scegliere?", "Cosa cambia tra i servizi?"]),
  step4: Object.freeze(["Spiegami il totale", "La stampa è inclusa?", "Cos'è il GPS?", "Posso scaricare il PDF?"]),
});

/** Proiezione allowlist del draft. Non legge mai contatti, auth, token o segreti. */
export function buildQuoteAssistantBaseContext(page, data = {}) {
  const step = STEP_BY_PAGE[page] || null;
  if (!step) return null;
  const selectedServiceKey = serviceKey(data);
  const selectedService = selectedServiceKey ? SERVICE_DESCRIPTIONS[selectedServiceKey] : null;
  const quantity = finiteNumber(data.flyerQuantity ?? data.qty);
  const areaMode = safeText(data.areaMode || data.searchMode || data.zoneMode, 40);

  return {
    schemaVersion: 1,
    step,
    quoteState: step === 1 ? "iniziale" : "in_compilazione",
    request: {
      type: selectedServiceKey,
      quantity,
    },
    location: {
      municipality: municipality(data),
      province: province(data),
      region: region(data),
    },
    territory: {
      mode: areaMode,
      radiusKm: areaMode === "radius" || areaMode === "raggio" ? finiteNumber(data.radius ?? data.selectedRadius ?? data.radiusKm) : null,
    },
    service: selectedService,
    availableServices: step === 3 ? Object.values(SERVICE_DESCRIPTIONS) : [],
  };
}

/** Step2 usa lo snapshot prodotto dal Truth/View Model e i dettagli operativi territoriali. */
export function buildQuoteAssistantStep2Context(snapshot, data = {}, runtimeOverrides = {}) {
  const base = buildQuoteAssistantBaseContext("step2", data);
  if (!base) return null;

  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const serviceK = snap.service?.key || base.request?.type || serviceKey(data) || "d2d";
  const coverageMode = safeText(runtimeOverrides.coverageMode || snap.territory?.mode || data.areaMode || base.territory?.mode || "comune", 40);

  const comune = safeText(runtimeOverrides.comune || snap.territory?.label || data.cityName || data.comune || base.location?.municipality, 100);
  const provincia = safeText(runtimeOverrides.provincia || data.provincia || data.province || base.location?.province, 20);
  const localita = safeText(runtimeOverrides.localita || data.localita || data.frazione || data.selectedFrazione?.label || data.selectedFrazione?.name, 100);
  const frazione = safeText(runtimeOverrides.frazione || localita, 100);
  const indirizzo = safeText(runtimeOverrides.indirizzo || data.address || data.indirizzo || data.selectedAddress, 150);
  const lat = finiteNumber(runtimeOverrides.lat ?? data.lat ?? data.centerLat);
  const lng = finiteNumber(runtimeOverrides.lng ?? data.lng ?? data.centerLng);
  const radiusKm = finiteNumber(runtimeOverrides.radiusKm ?? snap.territory?.radiusKm ?? data.radiusKm ?? data.radius);

  const rawSelectedNils = runtimeOverrides.selectedNils || (coverageMode === "nil" || coverageMode === "zone" ? snap.territory?.selectedNames : []);
  const selectedNils = Array.isArray(rawSelectedNils)
    ? rawSelectedNils.map((n) => (typeof n === "string" ? n : n?.name || n?.label || n?.nil_name)).filter(Boolean).slice(0, 30)
    : [];

  const availableNils = finiteNumber(runtimeOverrides.availableNils ?? snap.zones?.available ?? (coverageMode === "nil" ? 88 : null));

  const quantitaInserita = finiteNumber(runtimeOverrides.quantitaInserita ?? snap.quantity?.inserted ?? snap.quantity?.current ?? data.flyerQuantity ?? data.qty ?? base.request?.quantity);
  const famiglie = finiteNumber(runtimeOverrides.famiglie ?? snap.metrics?.families ?? snap.kpis?.families);
  const cassette = famiglie;
  const recommendedQuantity = finiteNumber(runtimeOverrides.recommendedQuantity ?? snap.quantity?.recommended ?? snap.metrics?.recommendedQuantity);
  const coveragePct = finiteNumber(runtimeOverrides.coveragePct ?? snap.metrics?.residentialCoveragePct ?? snap.kpis?.residentialCoveragePct ?? snap.metrics?.quantityCoveragePct);

  const selectedZones = Array.isArray(runtimeOverrides.selectedZones) && runtimeOverrides.selectedZones.length > 0
    ? runtimeOverrides.selectedZones.slice(0, 30)
    : Array.isArray(snap.territory?.selectedNames) && snap.territory.selectedNames.length > 0
      ? snap.territory.selectedNames.slice(0, 30)
      : comune ? [comune] : [];

  const zonesCount = finiteNumber(runtimeOverrides.zonesCount ?? selectedZones.length);
  const quantityMissing = finiteNumber(
    runtimeOverrides.quantityMissing ??
    snap.quantity?.shortage ??
    (recommendedQuantity && quantitaInserita && recommendedQuantity > quantitaInserita ? recommendedQuantity - quantitaInserita : 0)
  );
  const quantitySurplus = finiteNumber(
    runtimeOverrides.quantitySurplus ??
    snap.quantity?.surplus ??
    (recommendedQuantity && quantitaInserita && quantitaInserita > recommendedQuantity ? quantitaInserita - recommendedQuantity : 0)
  );

  const territorialDataUnavailable = Boolean(
    runtimeOverrides.territorialDataUnavailable ||
    snap.state === "unavailable" ||
    snap.state === "missing" ||
    (famiglie == null && coveragePct == null && snap.state === "error")
  );

  const priorityMode = safeText(runtimeOverrides.priorityMode || data.priorityMode || data.allocationMode || "auto", 30);
  const ctaStep3Enabled = runtimeOverrides.ctaStep3Enabled !== undefined ? Boolean(runtimeOverrides.ctaStep3Enabled) : true;
  const reasonCtaDisabled = !ctaStep3Enabled ? safeText(runtimeOverrides.reasonCtaDisabled || "Completa la selezione territoriale per continuare", 150) : null;
  const error = Boolean(runtimeOverrides.error || snap.state === "error");
  const fallbackActive = Boolean(runtimeOverrides.fallbackActive || snap.state === "loading" || snap.state === "unavailable");

  return {
    ...base,
    quoteState: territorialDataUnavailable ? "non_disponibile" : (snap.state || "in_compilazione"),
    service: snap.service || base.service,
    serviceType: serviceK,
    coverageMode,
    comune,
    provincia,
    localita,
    frazione,
    indirizzo,
    lat,
    lng,
    radiusKm,
    selectedNils,
    availableNils,
    quantitaInserita,
    famiglie,
    cassette,
    recommendedQuantity,
    coveragePct,
    zonesCount,
    selectedZones,
    quantityMissing,
    quantitySurplus,
    territorialDataUnavailable,
    reportKpis: runtimeOverrides.reportKpis || snap.metrics || {},
    priorityMode,
    ctaStep3Enabled,
    reasonCtaDisabled,
    fallbackActive,
    error,
    location: {
      ...base.location,
      municipality: comune || base.location?.municipality,
      province: provincia || base.location?.province,
      localita,
      frazione,
      indirizzo,
      lat,
      lng,
    },
    territory: {
      mode: coverageMode,
      modeLabel: snap.territory?.modeLabel ?? (coverageMode === "radius" || coverageMode === "raggio" ? "Raggio" : coverageMode === "nil" ? "NIL / Quartieri" : "Comune"),
      radiusKm,
      selectedNames: selectedZones,
      zonesCount,
      selectedZones,
      selectedNils,
      availableNils,
    },
    quantity: {
      inserted: quantitaInserita,
      current: quantitaInserita,
      recommended: recommendedQuantity,
      shortage: quantityMissing,
      surplus: quantitySurplus,
      allocated: finiteNumber(snap.quantity?.allocated),
      unallocated: finiteNumber(snap.quantity?.unallocated),
    },
    kpis: {
      ...snap.metrics,
      families: famiglie,
      cassette,
      residentialCoveragePct: coveragePct,
      coveragePct,
      recommendedQuantity,
    },
    calculation: snap.calculation || {},
    missing: Array.isArray(snap.missing) ? snap.missing.slice(0, 20) : [],
    limitations: Array.isArray(snap.limitations) ? snap.limitations.slice(0, 8) : [],
  };
}

/** Genera 4-6 domande contestuali dinamiche basate sullo stato reale dello Step 2 */
export function generateStep2QuickQuestions(context = {}) {
  const comune = context.comune || context.location?.municipality || "la zona";
  const qty = context.quantitaInserita || context.quantity?.current;
  const formattedQty = qty ? Number(qty).toLocaleString("it-IT") : "questa quantità";
  const mode = context.coverageMode || context.territory?.mode || "comune";
  const frazione = context.frazione || context.localita || context.location?.frazione;
  const isUnavailable = context.territorialDataUnavailable || context.quoteState === "non_disponibile";
  const ctaDisabled = context.ctaStep3Enabled === false;
  const selectedNils = Array.isArray(context.selectedNils) && context.selectedNils.length > 0
    ? context.selectedNils
    : Array.isArray(context.territory?.selectedNils)
      ? context.territory.selectedNils
      : [];

  if (isUnavailable) {
    return [
      "Perché vedo \"Dato non disponibile\"?",
      "Posso continuare comunque allo Step 3?",
      `Quanto copro con ${formattedQty} volantini?`,
      "Cosa mostra il Report Territoriale?",
    ];
  }

  if (ctaDisabled) {
    return [
      "Perché non posso continuare allo Step 3?",
      `Quante famiglie ci sono a ${comune}?`,
      `Quanto copro con ${formattedQty} volantini?`,
      "Cosa cambia tra Comune, Raggio e NIL?",
    ];
  }

  if (frazione) {
    return [
      `Come viene gestita la frazione ${frazione}?`,
      "Qual è il comune amministrativo?",
      `Quanto copro con ${formattedQty} volantini?`,
      `Quanti volantini servono per coprire tutto ${comune}?`,
      "Cosa mostra il Report Territoriale?",
    ];
  }

  if (mode === "radius" || mode === "raggio") {
    const radiusKm = context.radiusKm || context.territory?.radiusKm || 3;
    return [
      `Quanto copro con ${formattedQty} volantini nel raggio di ${radiusKm} km?`,
      "Quanti volantini servono per coprire il raggio?",
      "Cosa succede aumentando il raggio?",
      "Cosa cambia tra Raggio e Comune?",
      "Posso continuare allo Step 3?",
    ];
  }

  if (mode === "nil" || selectedNils.length > 0) {
    const firstNil = selectedNils[0] || "i quartieri scelti";
    return [
      "Cosa sono i NIL selezionati?",
      `Quanti volantini servono per ${firstNil}?`,
      `Quanto copro con ${formattedQty} volantini?`,
      "Cosa significa Auto / Priorità / Manuale?",
      "Cosa mostra il Report Territoriale?",
    ];
  }

  // Standard Comune
  return [
    `Quante famiglie ci sono a ${comune}?`,
    `Quanto copro con ${formattedQty} volantini?`,
    "Quanti volantini servono per copertura completa?",
    "Cosa cambia tra Comune, Raggio e NIL?",
    "Cosa significa Auto / Priorità / Manuale?",
    "Cosa mostra il Report Territoriale?",
  ];
}

/** Risposte deterministiche basate sui numeri e dati reali dello Step 2 */
export function generateClientStep2Answer(question, context = {}, options = {}) {
  const q = String(question || "").trim().toLowerCase();
  if (!q) return null;

  const comune = context.comune || context.location?.municipality || "la zona selezionata";
  const frazione = context.frazione || context.localita || context.location?.frazione;
  const provincia = context.provincia || context.location?.province;
  const areaLabel = frazione ? `${frazione} (${comune})` : comune;
  const qty = context.quantitaInserita || context.quantity?.current;
  const formattedQty = qty ? Number(qty).toLocaleString("it-IT") : "la quantità attuale di";
  const families = context.famiglie ?? context.kpis?.families;
  const formattedFamilies = families != null ? Number(families).toLocaleString("it-IT") : null;
  const recommended = context.recommendedQuantity ?? context.quantity?.recommended ?? families;
  const formattedRecommended = recommended != null ? Number(recommended).toLocaleString("it-IT") : null;
  const coveragePct = context.coveragePct ?? context.kpis?.residentialCoveragePct ?? context.kpis?.quantityCoveragePct;
  const formattedCov = coveragePct != null ? Number(coveragePct).toLocaleString("it-IT") : null;
  const radiusKm = context.radiusKm || context.territory?.radiusKm || 3;
  const shortage = context.quantityMissing ?? (recommended && qty && recommended > qty ? recommended - qty : 0);
  const formattedShortage = shortage ? Number(shortage).toLocaleString("it-IT") : null;
  const selectedNils = Array.isArray(context.selectedNils) && context.selectedNils.length > 0
    ? context.selectedNils
    : Array.isArray(context.territory?.selectedNils)
      ? context.territory.selectedNils
      : [];
  const isUnavailable = context.territorialDataUnavailable || context.quoteState === "non_disponibile";
  const ctaDisabled = context.ctaStep3Enabled === false;
  const reasonCtaDisabled = context.reasonCtaDisabled;

  // 1. Operatore umano / contatti
  if (/(?:parlare|sentire|contattare|scrivere).*(?:persona|operatore|consulente|umano)|(?:persona|operatore|consulente|umano).*(?:parlare|sentire|contattare|scrivere)/i.test(q)) {
    return "Puoi parlare subito con il team VolantiniPro: WhatsApp +39 351 767 3737 oppure Email info@volantinipro.it.";
  }

  // 2. Perché non posso continuare allo Step 3 / CTA bloccata
  if (/perch[eé].*(?:non posso|non fa|blocc|disabilit).*step 3|non posso continuare|continuare allo step 3|cosa manca per (?:continuare|proseguire)/i.test(q)) {
    if (ctaDisabled) {
      return `Per continuare allo Step 3: ${reasonCtaDisabled || "è necessario selezionare un comune o una zona valida e confermare la ripartizione dei volantini."}`;
    }
    return "La configurazione territoriale è completa: puoi cliccare sul pulsante 'Continua allo Step 3' in basso a destra per procedere con la scelta del servizio e del calendario.";
  }

  // 3. Perché vedo "Dato non disponibile"
  if (/perch[eé].*(?:dato non disponibil|non disponibil|manca.*dato)|dato non disponibile/i.test(q)) {
    return "La dicitura 'Dato non disponibile' indica che i dati ISTAT o i poligoni censuari per la selezione corrente non sono momentaneamente caricati o sono in modalità fallback. Puoi comunque procedere inserendo la quantità desiderata per la tua campagna.";
  }

  // 4. Frazione / Località — Come viene gestita & Posso usare una frazione
  if (/come viene gestita.*(?:frazione|localit[aà])|posso usare.*(?:frazione|localit[aà])|gestione.*frazion/i.test(q)) {
    return `Sì, puoi selezionare frazioni e località${frazione ? ` (come ${frazione})` : ""}. La frazione viene automaticamente ricondotta al comune amministrativo di competenza${comune ? ` (${comune})` : ""}, garantendo dati demografici precisi e distribuzione corretta.`;
  }

  // 5. Comune amministrativo della località
  if (/comune amministrativo|a che comune appartiene|di che comune [eè]/i.test(q)) {
    if (frazione) {
      return `La località ${frazione} fa parte del comune amministrativo di ${comune}${provincia ? ` (${provincia})` : ""}.`;
    }
    return `Il comune amministrativo attualmente selezionato è ${comune}${provincia ? ` (${provincia})` : ""}.`;
  }

  // 6. Quanto copro con questa quantità / Copertura
  if (/quanto copr|copro tutt|copertura.*quantit|percentuale.*copertura/i.test(q)) {
    if (isUnavailable || formattedCov == null) {
      return "La copertura non è attualmente disponibile per la selezione corrente.";
    }
    return `Con ${formattedQty} volantini su ${areaLabel}, la copertura stimata è del ${formattedCov}% rispetto al fabbisogno consigliato di ${formattedRecommended || "fabbisogno calcolato"} volantini. ${coveragePct >= 100 ? "La zona risulta interamente coperta rispetto al fabbisogno operativo." : "La copertura è parziale rispetto alla totalità delle famiglie/cassette."}`;
  }

  // 7. Quanti volantini servono per copertura completa / Fabbisogno
  if (/quant.*volantini.*serv|copertura complet|coprire tutt|fabbisogno.*total/i.test(q)) {
    if (isUnavailable || formattedRecommended == null) {
      return "Il calcolo del fabbisogno per la copertura completa non è al momento disponibile per l'area selezionata.";
    }
    return `Per una copertura completa al 100% di ${areaLabel} servono circa ${formattedRecommended} volantini${formattedFamilies ? ` (pari a ${formattedFamilies} famiglie/cassette)` : ""}. Rispetto ai ${formattedQty} volantini attuali, ${shortage > 0 && formattedShortage ? `ne mancano circa ${formattedShortage}` : "la quantità impostata è sufficiente a coprire l'area"}.`;
  }

  // 8. Perché la copertura è X%
  if (/perch[eé].*copertura.*(?:[0-9]|%|bassa|parziale)|spiega.*copertura/i.test(q)) {
    if (isUnavailable || formattedCov == null) {
      return "La percentuale di copertura non è al momento disponibile nei dati dello Step 2.";
    }
    return `La copertura del ${formattedCov}% è calcolata confrontando i ${formattedQty} volantini impostati con il fabbisogno stimato di ${formattedRecommended || formattedFamilies || "famiglie"} famiglie per ${areaLabel}.`;
  }

  // 9. Quante famiglie ci sono
  if (/quant.*famigli|numero.*famigli|cassett.*postal/i.test(q)) {
    if (isUnavailable || formattedFamilies == null) {
      return `Il numero di famiglie per ${areaLabel} non è attualmente disponibile nei dati territoriali.`;
    }
    return `Per ${areaLabel} sono stimate circa ${formattedFamilies} famiglie/cassette postali (fonte dati territoriali).`;
  }

  // 10. Quantità consigliata
  if (/quantit[aà].*consigliat|quanti.*consigli/i.test(q)) {
    if (isUnavailable || formattedRecommended == null) {
      return "La quantità consigliata non è attualmente disponibile nei dati correnti dello Step 2.";
    }
    return `La quantità consigliata per ${areaLabel} è di ${formattedRecommended} volantini, calcolata per garantire una copertura del 100% delle famiglie/cassette postali.`;
  }

  // 11. Cosa cambia tra Comune / Raggio / NIL
  if (/cosa cambia.*(?:comune|raggio|nil)|differenz.*(?:comune|raggio|nil)|comune o raggio/i.test(q)) {
    return `La modalità Comune copre l'intero territorio amministrativo. La modalità Raggio distribuisce a partire da un punto/indirizzo entro una distanza chilometrica (es. ${radiusKm} km). La modalità NIL seleziona singoli quartieri specifici per un targeting di massima precisione.`;
  }

  // 12. Cos'è un NIL / NIL selezionati
  if (/cos['’]?[eè].*nil|cosa sono i nil|nucle.*identit/i.test(q)) {
    return `I NIL (Nuclei di Identità Locale) sono i quartieri ufficiali e le unità statistiche comunali (come a Milano) per pianificare la distribuzione zona per zona${selectedNils.length > 0 ? ` (attualmente selezionati: ${selectedNils.join(", ")})` : ""}.`;
  }

  // 13. Cosa significa Auto / Priorità / Manuale
  if (/auto.*priorit[aà].*manuale|modalit[aà].*ripartizione|cosa significa.*(?:auto|priorit[aà]|manuale)/i.test(q)) {
    return "La modalità Auto distribuisce i volantini in proporzione alle famiglie in tutte le zone selezionate. La modalità Priorità concentra i volantini prima nelle zone centrali e a più alta densità. La modalità Manuale ti permette di assegnare a mano la quantità esatta per ciascuna zona.";
  }

  // 14. Cosa succede se aggiungo un altro comune
  if (/aggiung.*(?:altr.*comune|pi[uù].*comun)|cosa succede se aggiungo/i.test(q)) {
    return "Aggiungendo un altro comune il bacino complessivo di famiglie aumenta. Di conseguenza, mantenendo invariata la quantità di volantini la copertura percentuale media si ridurrà, oppure sarà necessario aumentare i volantini per coprire entrambe le aree.";
  }

  // 15. Report Territoriale Avanzato
  if (/report territorial|cosa mostra il report/i.test(q)) {
    return "Il Report Territoriale Avanzato fornisce un'analisi demografica approfondita con la stima delle famiglie, densità abitativa, mappa della distribuzione per quartiere/NIL e suggerimenti pratici per ottimizzare la copertura.";
  }

  // 16. Fallback generico ma grounding-safe se esplicitamente richiesto
  if (options.allowGeneric) {
    if (formattedCov && formattedQty) {
      return `Per ${areaLabel}, con ${formattedQty} volantini la copertura stimata è del ${formattedCov}%. Puoi porre domande specifiche sulla copertura, sulle zone o sulle modalità di distribuzione.`;
    }
    return `Per ${areaLabel}, l'assistente legge i parametri impostati nello Step 2. Puoi chiedere informazioni sulla copertura, sulle famiglie o sui limiti di zona.`;
  }

  return null;
}

/** Step4 riceve solo importi e selezioni già calcolati dallo Step, mai dati cliente. */
export function buildQuoteAssistantStep4Context(data = {}, pricing = {}) {
  const base = buildQuoteAssistantBaseContext("step4", data);
  if (!base) return null;
  const extras = Array.isArray(pricing.extras) ? pricing.extras.map((item) => ({
    id: safeText(item?.id, 60),
    label: safeText(item?.label, 100),
    description: safeText(item?.description, 240),
    amount: finiteNumber(item?.amount),
  })).filter((item) => item.label).slice(0, 20) : [];

  return {
    ...base,
    quoteState: "riepilogo",
    pricing: {
      distributionBase: finiteNumber(pricing.distributionBase),
      smartPairingDiscount: finiteNumber(pricing.smartPairingDiscount),
      urgencySurcharge: finiteNumber(pricing.urgencySurcharge),
      planDiscount: finiteNumber(pricing.planDiscount),
      distributionAndExtrasTotal: finiteNumber(pricing.distributionAndExtrasTotal),
      printing: {
        selected: pricing.printingSelected === true,
        amount: pricing.printingSelected === true ? finiteNumber(pricing.printingAmount) : null,
        indicative: pricing.printingSelected === true,
      },
      graphics: {
        required: pricing.graphicsRequired === true,
        selected: pricing.graphicsSelected === true,
        amount: pricing.graphicsSelected === true ? finiteNumber(pricing.graphicsAmount) : null,
      },
      extras,
      grandTotal: finiteNumber(pricing.grandTotal),
    },
    premiumServices: extras.map(({ id, label, description }) => ({ id, label, description })),
    pdfAvailable: pricing.pdfAvailable === true,
  };
}

export function quickQuestionsForPage(page, context = null) {
  if (page === "step2" && context) {
    return generateStep2QuickQuestions(context);
  }
  return QUOTE_ASSISTANT_QUICK_QUESTIONS[page] || [];
}

