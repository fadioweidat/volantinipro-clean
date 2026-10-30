// Distribuzione Business "Su progetto" (approvata 2026-10-30): nessun prezzo
// automatico, importo vuoto (null, mai 0), il team prepara una proposta.
// Unica fonte per testi, categorie e riconoscimento di queste campagne.

export const ON_PROJECT_LABEL = "Su progetto";
export const ON_PROJECT_PRICING_MODE = "on_project";

// Promessa pubblica sui tempi di risposta: un solo testo, usato ovunque.
export const BUSINESS_RESPONSE_TIME = "entro la giornata lavorativa (lun–ven)";
export const BUSINESS_CONFIRMATION = `${ON_PROJECT_LABEL}: ti ricontattiamo ${BUSINESS_RESPONSE_TIME} con una proposta`;

// Unico ingresso alla richiesta Business: configuratore con Business gia' scelto.
export const BUSINESS_REQUEST_LABEL = "Richiedi la tua proposta Business";
export const BUSINESS_REQUEST_HREF = "/configuratore?service=b2b";
export const goToBusinessRequest = (onNav) => onNav?.("step1", { service: "b2b" });

// Le 8 categorie grandi dello Step 1: ognuna raggruppa i valori gia' usati da
// Step 2 e admin, cosi' non cambia nessun dato a valle.
export const BUSINESS_MACRO_TARGETS = [
  { id: "negozi", label: "Negozi", values: ["retail"] },
  { id: "bar", label: "Bar e ristoranti", values: ["ristorazione"] },
  { id: "hotel", label: "Hotel", values: ["hospitality"] },
  { id: "uffici", label: "Uffici e studi", values: ["business", "professional_services"] },
  { id: "sanita", label: "Sanità", values: ["sanitario"] },
  { id: "palestre", label: "Palestre", values: ["fitness"] },
  { id: "scuole", label: "Scuole", values: ["scuole"] },
  { id: "industria", label: "Industria e artigianato", values: ["industrial"] },
];

export function isOnProjectCampaign(row) {
  const metadata = row?.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  return metadata.pricing_mode === ON_PROJECT_PRICING_MODE;
}

/** Importo da mostrare: "Su progetto" per queste campagne, altrimenti il formatter passato. */
export function onProjectAmount(row, format) {
  return row?.onProject || row?.su_progetto || isOnProjectCampaign(row) ? ON_PROJECT_LABEL : format(row);
}

const BUSINESS_REQUEST_FIELDS = [
  "businessZone", "distributionTargets", "businessOtherTarget", "businessDefinitionMode", "businessMaterialQuantity", "businessTargetCount",
  "campaignPeriodPreset", "businessPreferredStartDate", "businessCompleteBy", "businessPreferredVisitTime", "urgency", "hasFlyers",
  "activityType", "businessSector", "businessCampaignObjective", "subscription",
];

/** Trasforma il payload dello Step 4 in una richiesta "Su progetto": niente prezzi, tutte le risposte in metadata. */
export function buildOnProjectPayload(payload, data = {}) {
  const { pricing, quote_summary, ...metadata } = payload.metadata || {};
  const quantity = data.businessDefinitionMode === "activities" ? 0 : Math.max(0, Number(data.businessMaterialQuantity || 0));
  const zones = payload.campaignZones || [];
  const business_request = {};
  for (const [key, value] of Object.entries(data)) {
    if (BUSINESS_REQUEST_FIELDS.includes(key) || (key.startsWith("business") && !key.endsWith("Plan"))) business_request[key] = value;
  }
  return {
    ...payload,
    service_type: "business",
    flyer_quantity: quantity,
    total_amount: null,
    smart_pairing_discount: 0,
    // La Edge Function rifiuta zone con quantita' 0: senza un numero di volantini la zona resta in city_name.
    campaignZones: quantity > 0 ? zones.map(zone => ({ ...zone, lat: zone.lat ?? data.city?.lat ?? null, lng: zone.lng ?? data.city?.lng ?? null, quantity: Math.round(quantity / Math.max(1, zones.length)) })) : [],
    metadata: { ...metadata, pricing_mode: ON_PROJECT_PRICING_MODE, grand_total: null, business_request },
  };
}

/** Le 5 domande obbligatorie dello Step 1 Business: elenco di cio' che manca. */
export function businessMissingAnswers(data = {}) {
  const missing = [];
  if (!String(data.businessZone || "").trim()) missing.push({ key: "zone", id: "business-starting-area", label: "Inserisci il comune o la zona" });
  if (!Array.isArray(data.distributionTargets) || data.distributionTargets.length === 0) missing.push({ key: "targets", id: "section-business-config", label: "Scegli il tipo di attività" });
  const mode = data.businessDefinitionMode === "activities" ? "activities" : "materials";
  const amount = mode === "activities" ? Number(data.businessTargetCount || 0) : Number(data.businessMaterialQuantity || 0);
  if (!(amount >= 1)) missing.push({ key: "amount", id: "section-business-config", label: mode === "activities" ? "Indica il numero di attività" : "Indica la quantità di volantini" });
  const preset = data.campaignPeriodPreset;
  if (preset !== "asap" && !(preset === "custom" && data.startDate)) missing.push({ key: "when", id: "section-business-config", label: "Indica quando vuoi partire" });
  if (!data.hasFlyers) missing.push({ key: "print", id: "section-formato", label: "Indica se ti serve la stampa" });
  return missing;
}
