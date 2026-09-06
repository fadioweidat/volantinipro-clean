import { calculateOperationalScore } from "./operationalMetrics.js";
import { getBusinessMetrics } from "./businessZoneHelpers.js";
import { isStep2DebugEnabled, debugStep2Log } from "./debugStep2.js";

const NIL_LIKE_PLACE_TYPES = new Set([
  "neighborhood", "neighbourhood", "suburb", "quarter", "quartiere",
  "district", "city_district", "residential", "borough", "hamlet",
  "locality", "isolated_dwelling", "croft",
]);

const ADDRESS_LIKE_PLACE_TYPES = new Set([
  "address", "poi", "road", "street", "highway", "house", "building", "amenity", "tourism",
]);

const ZONE_VERDICT_RULES = [
  { min: 78, title: "Zona molto adatta", tone: "strong", text: "Buona concentrazione di famiglie e copertura coerente con una campagna porta a porta." },
  { min: 58, title: "Zona adatta", tone: "good", text: "Area valida per distribuire in modo selettivo, con dati territoriali sufficienti per procedere." },
  { min: 0, title: "Zona da valutare", tone: "watch", text: "Area utilizzabile, ma conviene controllare quantità e copertura prima di confermare." },
];

export const ADDRESS_INTENT_RE = /\b(via|viale|corso|piazza|piazzale|largo|strada|vicolo|galleria|alzaia|bastioni|ripa|foro)\b/i;

export function detectSearchIntent(input) {
  const raw = String(input || "").trim();
  const isAddress = ADDRESS_INTENT_RE.test(raw);
  const inMilano = /\bmilano\b/i.test(raw);
  return {
    intent: isAddress ? "address" : "municipality",
    parentComune: isAddress && inMilano ? "Milano" : null,
  };
}

export function logAddressVsMunicipalityDebug(inputValue, selectedComuneBefore, selectedComuneAfter, selectedSearchPoint, blockedMunicipalityAutoSelect, reason, selectedResultName, selectedResultType, selectedResultComune) {
  if (!isStep2DebugEnabled()) return;
  const raw = String(inputValue || "").trim();
  const sIntent = detectSearchIntent(raw);
  debugStep2Log("[STEP2_ADDRESS_VS_MUNICIPALITY_DEBUG]", {
    inputValue: raw,
    normalizedInput: normalizeMunicipalityName(raw),
    searchIntent: sIntent.intent,
    containsOdonimo: ADDRESS_INTENT_RE.test(raw),
    containsMilano: /\bmilano\b/i.test(raw),
    selectedResultName: selectedResultName || raw,
    selectedResultType: selectedResultType || (selectedSearchPoint ? "address" : "municipality"),
    selectedResultComune: selectedResultComune || (selectedSearchPoint ? "Milano" : (selectedComuneAfter?.label || selectedComuneAfter?.name || null)),
    selectedComuneBefore: selectedComuneBefore?.label || selectedComuneBefore?.name || null,
    selectedComuneAfter: selectedComuneAfter?.label || selectedComuneAfter?.name || null,
    selectedSearchPoint: selectedSearchPoint || null,
    blockedMunicipalityAutoSelect: Boolean(blockedMunicipalityAutoSelect),
    reason: reason || null
  });
}

export function isNilLikePlaceType(placeType) {
  return NIL_LIKE_PLACE_TYPES.has(String(placeType || "").toLowerCase());
}

export function isAddressLikePlaceType(placeType) {
  return ADDRESS_LIKE_PLACE_TYPES.has(String(placeType || "").toLowerCase());
}

export function looksLikeAddressResult(s) {
  return isAddressLikePlaceType(s?.placeType) || ADDRESS_INTENT_RE.test(s?.name || s?.label || "");
}

export function isGeocoderResultInMilanoComune(result) {
  if (!result) return false;
  const city = normalizeMunicipalityName(result.city || result.comune || result.municipality || result.place || "");
  if (city === "milano") return true;
  const full = String(result.fullName || result.name || "");
  return /,\s*Milano\s*(,|$)/i.test(full) && !/\b(cologno monzese|muggi[oò]|sesto san giovanni|cinisello balsamo|bresso|segrate|vimodrone)\b/i.test(full);
}

export function extractOfficialNilCode(z) {
  if (!z) return null;
  const raw = z.nilCode ?? z.nil_code ?? z.NIL_CODE ?? z.properties?.ID_NIL ?? z.properties?.id_nil ?? z.properties?.nil_code ?? z.properties?.NIL_CODE ?? null;
  if (raw !== null && raw !== undefined && raw !== "") {
    const s = String(raw).trim();
    if (s !== "" && s !== "null" && s !== "undefined") return s;
  }
  return null;
}

export function getMunicipalityDedupKey(comune) {
  if (!comune) return "";
  const code = comune.istat_code || comune.municipalityCode || comune.municipality_code || comune.nil_code || comune.nilCode || null;
  if (code) return String(code).trim();
  const name = normalizeMunicipalityName(comune.comune || comune.name || comune.label || comune.comune_name || "");
  const prov = String(comune.provincia || comune.prov || comune.province || "").trim().toLowerCase();
  return prov ? `${name}_${prov}` : name;
}

export function normalizeTerritoryName(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizeMunicipalityName(raw) {
  return String(raw || "")
    .split(",")[0]
    .replace(/^\s*comune di\s+/i, "")
    // Strip a trailing province suffix in parentheses: "Cormano (MI)" → "Cormano".
    // analysis-istat comuni_breakdown rows arrive with this suffix while
    // selectedMunicipality is already stripped (Step2 selectedMunicipality memo):
    // without this, single-comune matching in zonesInRadius produced 0 matches
    // -> empty zones -> "Dato non disponibile". General, no hardcoded comune.
    .replace(/\s*\([A-Za-z]{2}\)\s*$/, "")
    // Normalize hyphens to spaces: "Bovisio-Masciago" → "Bovisio Masciago"
    // so the API name (which may use hyphens) matches the user-selected name (which uses spaces)
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeCoverageDecision(value) {
  if (value === "partial") return "keepCurrent";
  if (value === "increase") return "useRecommended";
  if (value === "keepCurrent" || value === "useRecommended" || value === "manual") return value;
  return null;
}

export function getVerifiedBusinessMetrics(pois, targetMeta, radiusKm) {
  const metrics = getBusinessMetrics(pois, targetMeta, radiusKm);
  return {
    ...metrics,
    // Un POI fuori target non e automaticamente un competitor.
    // Il conteggio resta indisponibile finche una fonte esplicita non lo restituisce.
    competitors: null,
    clusterRows: (metrics.clusterRows || []).map((row) => ({ ...row, competitors: null })),
  };
}

export function getZoneVerdict(input) {
  const result = calculateOperationalScore(input);
  const rule = ZONE_VERDICT_RULES.find(item => result.score >= item.min) || ZONE_VERDICT_RULES[ZONE_VERDICT_RULES.length - 1];
  return { ...rule, ...result };
}
