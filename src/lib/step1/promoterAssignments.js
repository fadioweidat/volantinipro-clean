import { GEO_DATA } from "../geoData.js";
import { normalizeTerritoryName, normalizeMunicipalityName } from "../step2/addressIntent.js";

const H2H_POINT_TYPE_TERMS = {
  stazione: "stazione",
  piazza: "piazza",
  centro_commerciale: "centro commerciale",
  universita: "università scuola",
  fiera_evento: "fiera evento",
};

export function buildPromoterAssignments(data, requestedCount = null) {
  const count = Math.max(1, Number(requestedCount ?? data?.promoterCount ?? 1) || 1);
  const saved = Array.isArray(data?.promoterAssignments) ? data.promoterAssignments : [];
  return Array.from({ length: count }, (_, index) => {
    const existing = saved[index] || {};
    const legacyLocation = index === 0 ? String(data?.distributionLocation || "") : "";
    const legacyType = index === 0 ? String(data?.distributionPointType || "") : "";
    return {
      id: existing.id || `promoter_${index + 1}`,
      promoterNumber: index + 1,
      location: existing.location ?? legacyLocation,
      pointType: existing.pointType ?? legacyType,
      label: existing.label || null,
      lat: Number.isFinite(Number(existing.lat)) ? Number(existing.lat) : null,
      lng: Number.isFinite(Number(existing.lng)) ? Number(existing.lng) : null,
      parentComune: existing.parentComune || null,
      assignedQuantity: Number(existing.assignedQuantity || 0) || null,
      timeSlot: existing.timeSlot || data?.timeSlot || "",
      serviceDurationHours: Number(existing.serviceDurationHours || data?.serviceDurationHours || 4),
    };
  });
}

export async function geocodePromoterAssignment(assignment) {
  const location = String(assignment?.location || "").trim();
  const pointType = String(assignment?.pointType || "").trim();
  const normalizedLocation = normalizeTerritoryName(location);
  const knownLocationCity = GEO_DATA.find((known) => {
    const normalizedKnown = normalizeTerritoryName(known.name || known.label || "");
    return normalizedLocation === normalizedKnown
      || normalizedLocation.startsWith(`${normalizedKnown} `)
      || normalizedLocation.includes(` ${normalizedKnown} `);
  });
  const municipalityFallback = (precision = "municipality") => {
    if (!knownLocationCity) return null;
    const parentCity = { ...knownLocationCity, label: knownLocationCity.label || knownLocationCity.name };
    return {
      parentCity,
      point: {
        ...assignment,
        label: precision === "municipality" ? (parentCity.label || parentCity.name) : `${location} (posizione indicativa)`,
        lat: Number(parentCity.lat),
        lng: Number(parentCity.lng),
        type: "operational_point",
        parentComune: parentCity.label || parentCity.name,
        city: parentCity.label || parentCity.name,
        postcode: null,
        province: null,
        providerPlaceId: null,
        precision,
        unconfirmed: precision !== "municipality",
        source: precision === "municipality" ? "known_municipality" : "municipality_fallback",
      },
    };
  };

  // Per un comune esatto non serve interrogare Nominatim una volta per ogni
  // promoter: il punto preciso verrÃ  scelto tra i POI reali nello Step 2.
  if (knownLocationCity && normalizedLocation === normalizeTerritoryName(knownLocationCity.name || knownLocationCity.label || "")) {
    return municipalityFallback("municipality");
  }
  const pointTypeTerm = H2H_POINT_TYPE_TERMS[pointType] || "";
  const query = pointTypeTerm && !normalizeTerritoryName(location).includes(normalizeTerritoryName(pointTypeTerm))
    ? `${location} ${pointTypeTerm}`
    : location;
  const runGeocode = async (searchQuery) => {
    const params = new URLSearchParams({ q: searchQuery, countrycodes: "it", format: "json", addressdetails: "1", limit: "6" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!response.ok) throw new Error(`GEOCODER_HTTP_${response.status}`);
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  };
  // Il tipo di target non deve invalidare una via reale: prima cerchiamo il
  // POI specifico, poi l'indirizzo/comune puro come fallback operativo.
  let rows;
  try {
    rows = await runGeocode(query);
    if (rows.length === 0 && query !== location) rows = await runGeocode(location);
  } catch (error) {
    const fallback = municipalityFallback("municipality_fallback");
    if (fallback) return fallback;
    throw error;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    const fallback = municipalityFallback("municipality_fallback");
    if (fallback) return fallback;
    throw new Error("OPERATIONAL_POINT_NOT_FOUND");
  }

  const wantsStation = pointType === "stazione" || /\b(stazione|station|fermata|metro)\b/i.test(query);
  const ranked = [...rows].sort((a, b) => {
    const score = (row) => {
      const typeText = `${row.type || ""} ${row.addresstype || ""} ${row.class || ""} ${row.display_name || ""}`;
      const municipalityRank = /\b(city|town|village|municipality)\b/i.test(typeText) ? 30 : 0;
      const countyPenalty = /\b(county|province|state)\b/i.test(`${row.type || ""} ${row.addresstype || ""}`) ? -20 : 0;
      const exactNameRank = normalizeTerritoryName(row.name || "") === normalizeTerritoryName(location.split(",")[0] || location) ? 8 : 0;
      return municipalityRank
        + countyPenalty
        + exactNameRank
        + (wantsStation && /station|railway|halt|stop|stazione/i.test(typeText) ? 40 : 0)
        + Number(row.importance || 0);
    };
    return score(b) - score(a);
  });
  const best = ranked[0];
  const lat = Number(best.lat);
  const lng = Number(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("OPERATIONAL_POINT_INVALID_COORDINATES");

  const address = best.address || {};
  const parentName = address.city || address.town || address.village || address.municipality || GEO_DATA.find((known) =>
    normalizeTerritoryName(best.display_name || "").includes(normalizeTerritoryName(known.name || known.label || ""))
  )?.name;
  if (!parentName) throw new Error("OPERATIONAL_POINT_MUNICIPALITY_NOT_FOUND");
  const knownParent = GEO_DATA.find((known) => normalizeMunicipalityName(known.name || known.label) === normalizeMunicipalityName(parentName));
  const parentCity = knownParent
    ? { ...knownParent, label: knownParent.label || knownParent.name }
    : { id: `operational_${normalizeMunicipalityName(parentName).replace(/\s+/g, "_")}`, name: parentName, label: parentName, lat, lng };
  const pointLabel = best.display_name?.split(",").slice(0, 2).join(",") || query;
  return {
    parentCity,
    point: {
      ...assignment,
      label: pointLabel,
      lat,
      lng,
      type: "operational_point",
      parentComune: parentCity.label || parentCity.name,
      city: parentCity.label || parentCity.name,
      postcode: address.postcode || null,
      province: address.county || null,
      providerPlaceId: best.place_id || null,
      precision: best.addresstype || best.type || best.class || "poi",
      source: "step1_promoter_assignment",
    },
  };
}
