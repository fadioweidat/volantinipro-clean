import { normalizeTerritoryName } from "./addressIntent.js";

const POI_WHITELISTS = {
  all: [],
  fitness: ["gym", "fitness", "sports_centre", "sportivo", "palestra", "yoga", "pilates", "swimming_pool", "martial_arts", "wellness", "spa", "personal_trainer", "dance_school", "sporting_goods"],
  ristorazione: ["ristorante", "bar", "caff", "pub", "mercato"],
  retail: ["negozio", "supermercato", "centro comm", "abbigliamento", "tabacchi"],
  sanitario: ["farmacia", "clinica", "ospedale", "studio medico", "medic", "dentist"],
  automotive: ["officina", "concessionaria", "auto"],
  business: ["ufficio", "azienda", "company"],
  hospitality: ["hotel", "struttura ricettiva", "guest house", "albergo"],
  professional_services: ["studio professionale", "studio legale", "commercialista", "consulenza", "assicurazione", "finanz"],
  industrial: ["industria", "industriale", "capannone", "magazzino"],
  scuole: ["scuola", "istituto", "liceo", "elementare", "media"],
  universita: ["universit", "college", "biblioteca"],
  stazioni: ["stazione", "fermata", "metro", "railway", "transit"],
  centri_commerciali: ["centro comm", "shopping", "mall"],
  immobiliare: ["immobiliare", "estate"],
  beauty: ["parrucchiere", "estetico", "beauty"],
  eventi: ["evento", "fiera", "sagra", "festival", "spettacolo"],
  farmacie: ["farmacia", "parafarmacia"],
  alimentari: ["alimentari", "supermercato", "minimarket", "market", "gastronomia"],
};

const POI_BLACKLISTS = {
  fitness: ["bar", "cafe", "caff", "ristorant", "restaurant", "pharmacy", "farmacia", "hospital", "ospedal", "clinic", "school", "scuola", "supermarket", "supermercato", "bank", "negozio", "pub", "hotel", "ufficio", "tabacchi"],
  // Other blacklists can be added here if needed
};

export function filterPoisForCampaignTarget(pois, targetSelection, activityNote = "") {
  const source = Array.isArray(pois) ? pois : [];
  const selectedTargets = Array.isArray(targetSelection)
    ? targetSelection.filter(Boolean)
    : [targetSelection].filter(Boolean);

  if (selectedTargets.includes("all") || selectedTargets.length === 0) return source;

  const whitelists = selectedTargets.flatMap((target) => POI_WHITELISTS[target] || []);
  const blacklists = selectedTargets.flatMap((target) => POI_BLACKLISTS[target] || []);
  const isAltro = selectedTargets.includes("altro");

  let customTerms = [];
  if (isAltro) {
    customTerms = normalizeTerritoryName(activityNote).split(/\s+/).filter((term) => term.length > 3);
  }

  const activeWhitelist = [...whitelists, ...customTerms].map(normalizeTerritoryName);
  const activeBlacklist = blacklists.map(normalizeTerritoryName);

  if (activeWhitelist.length === 0) return source;

  return source.filter((poi) => {
    const haystack = normalizeTerritoryName(`${poi?.category || ""} ${poi?.name || ""}`);
    const catStack = normalizeTerritoryName(poi?.category || "");
    const nameStack = normalizeTerritoryName(poi?.name || "");

    // 1. Applica Blacklist prima di tutto (se la stringa del nome o della categoria contiene un termine vietato)
    if (activeBlacklist.some((term) => haystack.includes(term))) {
      return false;
    }

    // 2. Se non ha fatto trigger sulla blacklist, verifichiamo la Whitelist.
    // Diamo preferenza alla categoria originaria/normalizzata se presente, per essere restrittivi
    if (catStack && catStack !== "altro" && catStack !== "poi") {
      return activeWhitelist.some((term) => catStack.includes(term) || nameStack.includes(term));
    }
    
    // Se la categoria manca o è "Altro", fallback sul nome completo
    return activeWhitelist.some((term) => haystack.includes(term));
  });
}
