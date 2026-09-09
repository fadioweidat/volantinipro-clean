import { normalizeTerritoryName } from "./addressIntent.js";

const FITNESS_WHITELIST = [
  "gym", "fitness", "sports_centre", "sportivo", "palestra", "palestre",
  "yoga", "pilates", "swimming_pool", "martial_arts", "wellness", "spa",
  "personal_trainer", "dance_school", "sporting_goods", "bodybuilding",
  "crossfit", "boxe", "nuoto", "piscina", "danza", "arrampicata", "padel", "tennis"
];

const FITNESS_BLACKLIST = [
  "bar", "cafe", "caff", "ristorant", "restaurant", "pharmacy", "farmacia",
  "hospital", "ospedal", "clinic", "school", "scuola", "supermarket",
  "supermercato", "bank", "negozio", "pub", "hotel", "ufficio", "tabacchi"
];

const POI_WHITELISTS = {
  all: [],
  fitness: FITNESS_WHITELIST,
  palestra: FITNESS_WHITELIST,
  palestre: FITNESS_WHITELIST,
  gym: FITNESS_WHITELIST,
  sport: FITNESS_WHITELIST,
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
  fitness: FITNESS_BLACKLIST,
  palestra: FITNESS_BLACKLIST,
  palestre: FITNESS_BLACKLIST,
  gym: FITNESS_BLACKLIST,
  sport: FITNESS_BLACKLIST,
  // Other blacklists can be added here if needed
};

function matchesTerm(haystack, tokens, term) {
  if (!term || !haystack) return false;
  if (term.includes(" ")) {
    return haystack.includes(term);
  }
  return tokens.some((t) => t === term || (term.length >= 4 && t.startsWith(term)));
}

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
    const haystackTokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    const catTokens = catStack.split(/[^a-z0-9]+/).filter(Boolean);
    const nameTokens = nameStack.split(/[^a-z0-9]+/).filter(Boolean);

    const isCategoryWhitelisted = catStack && catStack !== "altro" && catStack !== "poi"
      && activeWhitelist.some((term) => matchesTerm(catStack, catTokens, term));

    // 1. Applica Blacklist:
    // Se la categoria è già esplicitamente whitelisted (es. categoria "Palestra"),
    // controlliamo la blacklist solo sulla categoria stessa per evitare falsi positivi
    // su nomi/indirizzi come "Palestra Baracca" o "Crossfit Barbell".
    if (isCategoryWhitelisted) {
      if (activeBlacklist.some((term) => matchesTerm(catStack, catTokens, term))) {
        return false;
      }
    } else {
      if (activeBlacklist.some((term) => matchesTerm(haystack, haystackTokens, term))) {
        return false;
      }
    }

    // 2. Se non ha fatto trigger sulla blacklist, verifichiamo la Whitelist.
    if (isCategoryWhitelisted) {
      return true;
    }

    if (catStack && catStack !== "altro" && catStack !== "poi") {
      return activeWhitelist.some((term) => matchesTerm(catStack, catTokens, term) || matchesTerm(nameStack, nameTokens, term));
    }

    // Se la categoria manca o è "Altro", fallback sul nome completo
    return activeWhitelist.some((term) => matchesTerm(haystack, haystackTokens, term));
  });
}
