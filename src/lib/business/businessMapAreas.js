import { GEO_DATA } from "../geoData.js";
import { normalizeTerritoryName } from "../step2/addressIntent.js";

const MILANO = { id: "milano", name: "Milano", label: "Milano", lat: 45.4642, lng: 9.19 };

/** Resolve only exact, known municipality names. Never guess a nearby town. */
export function knownBusinessMapCity(name) {
  const normalized = normalizeTerritoryName(name);
  if (normalized === "milano") return { ...MILANO };
  const known = GEO_DATA.find(row => normalizeTerritoryName(row.name || row.label) === normalized);
  return known ? { ...known, label: known.label || known.name } : null;
}

/**
 * An open-text Business lead can cover several municipalities, but the optional
 * map currently supports one municipality at a time. Keep the user's separate
 * choices instead of geocoding the whole text as one (unrelated) place.
 */
export function parseBusinessMapAreas(zone) {
  const text = String(zone || "").trim();
  // An address such as "Via Roma 12, Milano" is NOT a multi-comune request.
  if (!text || /\d/.test(text) || /^(via|viale|corso|piazza|piazzale|largo|strada)\b/i.test(text)) return [];
  const parts = text.split(/\s*[,;]\s*|\s+(?:e|ed)\s+/i).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  const seen = new Set();
  return parts.filter(name => {
    const key = normalizeTerritoryName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(name => knownBusinessMapCity(name) || { id: null, name, label: name, lat: null, lng: null });
}

/** A geocoder result must never silently replace an explicitly named comune. */
export function businessGeocodeMatchesZone(zone, municipalityName) {
  const input = normalizeTerritoryName(zone);
  const result = normalizeTerritoryName(municipalityName);
  return Boolean(input && result && (input === result || input.endsWith(` ${result}`) || input.endsWith(`, ${result}`)));
}
