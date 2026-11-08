// An address with a street number is a different selection from the street's
// centroid. Never silently upgrade a road/POI geocoder hit to a verified civic.
// This module is pure so both geocoder and UI apply the same acceptance rule.

const STREET_TYPE = /\b(via|viale|corso|piazza|piazzale|piazzetta|largo|strada|vicolo|galleria|alzaia|bastioni|ripa|foro|passaggio)\b/i;

// "12/A" = "12A" (lettera), ma "24/6" resta "24/6": la barra numerica non si
// fonde col numero, altrimenti 24/6 e 246 sarebbero lo stesso civico.
export function normalizeItalianStreetNumber(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "")
    .replace(/\/(?=[A-Z])/g, "")
    .replace(/^0+(?=\d)/, "");
}

function normalizeStreet(value) {
  return String(value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Milano Viale Certosa 330", "Viale Certosa 330, Milano", "Via X 12/A".
// Five-digit Italian postal codes are deliberately excluded.
export function parseRequestedCivic(query) {
  const input = String(query || "").replace(/\s+/g, " ").trim();
  if (!STREET_TYPE.test(input)) return null;
  const withoutSuffix = input.replace(/[,\s]+milano(?:\s*\(mi\))?\s*$/i, "").trim();
  const m = withoutSuffix.match(/(?:\s|,)(\d{1,4}(?:\s*[a-z]|\s*\/\s*[a-z0-9]+)?)\s*$/i);
  if (!m) return null;
  const number = normalizeItalianStreetNumber(m[1]);
  const street = withoutSuffix.slice(0, m.index).replace(/^milano[,\s]+/i, "").replace(/[,\s]+$/, "").trim();
  if (!street || !STREET_TYPE.test(street) || !number) return null;
  return { number, street };
}

export function matchesRequestedCivic(query, result) {
  const requested = parseRequestedCivic(query);
  if (!requested) return true; // A street-level request remains supported.
  const actualNumber = normalizeItalianStreetNumber(result?.houseNumber ?? result?.address?.house_number ?? "");
  if (!actualNumber || actualNumber !== requested.number) return false;
  // Stradario ufficiale del Comune di Milano: la via e' gia' stata risolta dal
  // registro a partire da questa stessa ricerca ("Piazza Duomo" -> "Piazza del Duomo").
  if (result?.verification === "official_registry") return true;
  // The number alone is not sufficient: reject 330 on a different road.
  const actualStreet = normalizeStreet(result?.street || result?.address?.road || "");
  if (!actualStreet) return false;
  const wanted = normalizeStreet(requested.street);
  if (actualStreet === wanted) return true;
  // "Via Oroboni" = "Via Antonio Oroboni": stesso tipo di via e tutte le parole
  // cercate presenti nel nome. "Via Certosa" resta diversa da "Viale Certosa".
  const a = actualStreet.split(" ");
  const w = wanted.split(" ");
  return a[0] === w[0] && w.length >= 2 && w.slice(1).every(token => a.slice(1).includes(token));
}

/**
 * Provenienza del punto di partenza del PV, mostrata accanto all'indirizzo:
 * un punto manuale o un risultato di geocoder non e' mai presentato come
 * civico verificato dal Comune.
 */
export function describePointProvenance(point) {
  if (!point) return null;
  if (point.verification === "official_registry") return "Civico verificato · stradario Comune di Milano";
  if (point.verification === "manual" || point.type === "manual_point") return "Punto scelto sulla mappa · non è un civico verificato";
  if (point.verification === "provider_civic" && point.needsMapConfirmation) return `Posizione indicativa da ${point.source === "mapbox" ? "Mapbox" : "OpenStreetMap"} · civico non verificato dal Comune: controlla il segnaposto sulla mappa`;
  if (point.verification === "provider_civic") return `Civico trovato da ${point.source === "mapbox" ? "Mapbox" : "OpenStreetMap"} · non verificato nello stradario del Comune`;
  if (point.verification === "provider_street") return "Indirizzo senza numero civico";
  return null;
}

/**
 * Stato esplicito del punto di partenza di un PV rispetto al civico richiesto.
 * L'assenza dal dataset del Comune non prova che il civico non esista:
 *  - OFFICIAL_VERIFIED: civico presente nello stradario ufficiale (coordinate del Comune);
 *  - PROVIDER_CANDIDATE: civico proposto da Mapbox/OpenStreetMap, posizione indicativa;
 *  - MANUAL_CONFIRMED: punto confermato dall'utente con un tocco sulla mappa;
 *  - UNRESOLVED: nessun punto con coordinate valide, o indirizzo senza civico.
 */
export const CIVIC_POINT_STATE = Object.freeze({
  OFFICIAL_VERIFIED: "OFFICIAL_VERIFIED",
  PROVIDER_CANDIDATE: "PROVIDER_CANDIDATE",
  MANUAL_CONFIRMED: "MANUAL_CONFIRMED",
  UNRESOLVED: "UNRESOLVED",
});

const isCoordinate = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export function getCivicPointState(point) {
  if (!point || !isCoordinate(point.lat) || !isCoordinate(point.lng)) return CIVIC_POINT_STATE.UNRESOLVED;
  if (point.verification === "official_registry") return CIVIC_POINT_STATE.OFFICIAL_VERIFIED;
  if (point.verification === "manual" || point.type === "manual_point") return CIVIC_POINT_STATE.MANUAL_CONFIRMED;
  if (point.verification === "provider_civic") return CIVIC_POINT_STATE.PROVIDER_CANDIDATE;
  return CIVIC_POINT_STATE.UNRESOLVED;
}

/**
 * Etichetta del punto confermato a mano: se la scelta parte da un indirizzo
 * cercato nello stesso PV, l'indirizzo resta visibile (il punto resta comunque
 * "scelto sulla mappa", mai civico verificato).
 */
export function manualPointLabel(source, activeZoneId) {
  const label = String(source?.label || "").trim();
  if (label && source?.zoneId === (activeZoneId || null)) return label;
  return "Punto selezionato sulla mappa";
}
