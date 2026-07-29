import { normalizeTerritoryName } from "./addressIntent.js";

const POI_TARGET_TERMS = {
  all: [],
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
  fitness: ["palestra", "sportivo", "fitness", "gym"],
  eventi: ["evento", "fiera", "sagra", "festival", "spettacolo"],
  farmacie: ["farmacia", "parafarmacia"],
  alimentari: ["alimentari", "supermercato", "minimarket", "market", "gastronomia"],
};

export function filterPoisForCampaignTarget(pois, targetSelection, activityNote = "") {
  const source = Array.isArray(pois) ? pois : [];
  const selectedTargets = Array.isArray(targetSelection)
    ? targetSelection.filter(Boolean)
    : [targetSelection].filter(Boolean);
  if (selectedTargets.includes("all")) return source;
  const terms = selectedTargets.flatMap((target) => POI_TARGET_TERMS[target] || (target === "altro"
    ? normalizeTerritoryName(activityNote).split(/\s+/).filter((term) => term.length > 3)
    : []));
  if (terms.length === 0) return source;
  const normalizedTerms = terms.map(normalizeTerritoryName);
  return source.filter((poi) => {
    const haystack = normalizeTerritoryName(`${poi?.category || ""} ${poi?.name || ""}`);
    return normalizedTerms.some((term) => haystack.includes(term));
  });
}
