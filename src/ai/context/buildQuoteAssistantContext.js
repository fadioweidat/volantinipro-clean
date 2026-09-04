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
  return safeText(selected?.label || selected?.name || selected?.comune_name || data.cityName || data.city?.label || data.city?.name || data.searchedLocation);
};

const province = (data = {}) => {
  const selected = Array.isArray(data.selectedComuni) ? data.selectedComuni[0] : null;
  return safeText(selected?.provincia || selected?.province || selected?.sigla_provincia || selected?.prov || data.city?.provincia || data.city?.province);
};

const region = (data = {}) => {
  const selected = Array.isArray(data.selectedComuni) ? data.selectedComuni[0] : null;
  return safeText(selected?.regione || selected?.region || data.city?.regione || data.city?.region);
};

export const QUOTE_ASSISTANT_QUICK_QUESTIONS = Object.freeze({
  step1: Object.freeze(["Come funziona?", "Quanti volantini mi consigli?", "Posso modificare dopo?"]),
  step2: Object.freeze(["Cosa significa questa copertura?", "Comune o Raggio?", "Copro tutta la zona?"]),
  step3: Object.freeze(["Quale servizio scegliere?", "Cosa cambia tra i servizi?"]),
  step4: Object.freeze(["Spiegami il totale", "La stampa è inclusa?", "Cos'è il GPS?", "Posso scaricare il PDF?"]),
});

/** Proiezione allowlist del draft. Non legge mai contatti, auth, coordinate o payload GIS. */
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
      radiusKm: areaMode === "radius" || areaMode === "raggio" ? finiteNumber(data.radius ?? data.selectedRadius) : null,
    },
    service: selectedService,
    availableServices: step === 3 ? Object.values(SERVICE_DESCRIPTIONS) : [],
  };
}

/** Step2 usa esclusivamente lo snapshot già prodotto dal Truth/View Model visualizzato. */
export function buildQuoteAssistantStep2Context(snapshot, data = {}) {
  const base = buildQuoteAssistantBaseContext("step2", data);
  if (!base || !snapshot || typeof snapshot !== "object") return base;
  return {
    ...base,
    quoteState: snapshot.state || "non_disponibile",
    service: snapshot.service || base.service,
    territory: {
      mode: snapshot.territory?.mode ?? base.territory.mode,
      modeLabel: snapshot.territory?.modeLabel ?? null,
      radiusKm: finiteNumber(snapshot.territory?.radiusKm),
      selectedNames: Array.isArray(snapshot.territory?.selectedNames) ? snapshot.territory.selectedNames.slice(0, 20) : [],
    },
    location: {
      ...base.location,
      municipality: safeText(snapshot.territory?.label) || base.location.municipality,
    },
    quantity: snapshot.quantity || {},
    kpis: snapshot.metrics || {},
    calculation: snapshot.calculation || {},
    missing: Array.isArray(snapshot.missing) ? snapshot.missing.slice(0, 20) : [],
    limitations: Array.isArray(snapshot.limitations) ? snapshot.limitations.slice(0, 8) : [],
  };
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

export function quickQuestionsForPage(page) {
  return QUOTE_ASSISTANT_QUICK_QUESTIONS[page] || [];
}
