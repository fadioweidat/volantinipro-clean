// An address with a street number is a different selection from the street's
// centroid. Never silently upgrade a road/POI geocoder hit to a verified civic.
// This module is pure so both geocoder and UI apply the same acceptance rule.

const STREET_TYPE = /\b(via|viale|corso|piazza|piazzale|largo|strada|vicolo|galleria|alzaia|bastioni|ripa|foro)\b/i;

export function normalizeItalianStreetNumber(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "")
    .replace(/\//g, "")
    .replace(/^0+(?=\d)/, "");
}

function normalizeStreet(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  // The number alone is not sufficient: reject 330 on a different road.
  const actualStreet = normalizeStreet(result?.street || result?.address?.road || "");
  return Boolean(actualStreet && actualStreet === normalizeStreet(requested.street));
}
