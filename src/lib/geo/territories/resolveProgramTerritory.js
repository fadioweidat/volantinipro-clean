import { resolveMunicipalityBoundary } from '../resolveMunicipalityBoundary.js';

/**
 * Creates a GeoJSON Polygon representing a circular radius buffer around a center [lat, lng].
 * Default uses 64 vertices for smooth rendering and accurate pointInPolygon testing.
 * Output coordinates are in GeoJSON standard order: [lng, lat].
 */
export function generateCirclePolygon(centerLat, centerLng, radiusM, numPoints = 64) {
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusM) || radiusM <= 0) {
    return null;
  }
  const coords = [];
  const earthRadius = 6371000; // meters
  const latRad = (centerLat * Math.PI) / 180;
  const lngRad = (centerLng * Math.PI) / 180;
  const dByR = radiusM / earthRadius;

  for (let i = 0; i <= numPoints; i++) {
    const bearing = (i * 2 * Math.PI) / numPoints;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(dByR) +
      Math.cos(latRad) * Math.sin(dByR) * Math.cos(bearing)
    );
    const pLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(dByR) * Math.cos(latRad),
      Math.cos(dByR) - Math.sin(latRad) * Math.sin(pLat)
    );
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }

  return {
    type: 'Polygon',
    coordinates: [coords],
  };
}

/**
 * In-memory cache for resolved territory geometry keyed strictly by stable zone ID.
 */
const resolvedTerritoryCache = new Map();

/**
 * Resolves the canonical territory contract for a campaign/driver zone:
 * 1. Priority 1: Direct persisted canonical polygon (`polygon_geojson` / `geometry`).
 * 2. Priority 2: Radius territory (circle geometry from center + radius_m). NEVER falls back to parent Comune.
 * 3. Priority 3: NIL sub-territory resolution. NEVER silently becomes Comune Milano.
 * 4. Priority 4: Municipality boundary resolution via Nominatim / analysis-istat for real Comuni.
 *
 * @param {Object|null} zone - The active zone object
 * @param {Object} [fallbackContext] - Context hints (e.g. lat, lng)
 * @returns {Promise<{
 *   id: string|null,
 *   type: 'radius'|'nil'|'comune'|'polygon',
 *   displayName: string,
 *   parentMunicipality: string|null,
 *   geometry: Object|null,
 *   center: { lat: number, lng: number }|null,
 *   radiusM: number|null,
 *   quantity: number|null,
 *   source: string
 * }>}
 */
export async function resolveProgramTerritory(zone, fallbackContext = {}) {
  // SAFEGUARD: When zone is null/loading, NEVER resolve or return a parent municipality polygon.
  if (!zone) {
    return {
      id: null,
      type: 'comune',
      displayName: 'Area assegnata',
      parentMunicipality: null,
      geometry: null,
      center: null,
      radiusM: null,
      quantity: null,
      source: 'none',
    };
  }

  const rawLat = Number(zone.centerLat ?? zone.center_lat ?? zone.lat);
  const rawLng = Number(zone.centerLng ?? zone.center_lng ?? zone.lng);
  const hasValidCenter = Number.isFinite(rawLat) && Number.isFinite(rawLng) && (rawLat !== 0 || rawLng !== 0);
  const center = hasValidCenter ? { lat: rawLat, lng: rawLng } : null;

  const rawRadius = Number(zone.radiusM ?? zone.radius_m ?? zone.radius);
  const hasRadius = Number.isFinite(rawRadius) && rawRadius > 0;

  const rawPolygon = zone.polygonGeojson ?? zone.polygon_geojson ?? zone.geometry ?? null;
  let directGeometry = null;
  if (rawPolygon) {
    directGeometry = typeof rawPolygon === 'string' ? JSON.parse(rawPolygon) : rawPolygon;
  }

  const zoneName = zone.zone_name || zone.name || zone.municipality || 'Zona';
  const parentMuni = zone.parent_municipality || zone.parentMunicipality || null;
  const isNil = Boolean(
    zone.territory_type === 'nil' ||
    zone.territoryType === 'nil' ||
    zone.isNil ||
    (parentMuni && parentMuni.toLowerCase() !== zoneName.toLowerCase() && parentMuni.toLowerCase().includes('milano'))
  );
  const isRadius = Boolean(
    zone.territory_type === 'radius' ||
    zone.territoryType === 'radius' ||
    hasRadius
  );
  const territoryType = isRadius ? 'radius' : isNil ? 'nil' : directGeometry ? 'polygon' : 'comune';

  const zoneId = zone.id ? String(zone.id) : `${territoryType}_${zoneName}`;
  if (zoneId && resolvedTerritoryCache.has(zoneId)) {
    return resolvedTerritoryCache.get(zoneId);
  }

  // Priority 1: Direct persisted canonical polygon
  if (directGeometry && (directGeometry.type === 'Polygon' || directGeometry.type === 'MultiPolygon')) {
    const result = {
      id: zone.id || null,
      type: territoryType,
      displayName: zoneName,
      parentMunicipality: parentMuni,
      geometry: directGeometry,
      center,
      radiusM: hasRadius ? rawRadius : null,
      quantity: Number(zone.quantity ?? zone.quantity_assigned ?? 0) || null,
      source: 'direct-polygon',
    };
    if (zoneId) resolvedTerritoryCache.set(zoneId, result);
    return result;
  }

  // Priority 2: Radius territory (circle geometry generated accurately from center + radius)
  if (isRadius) {
    if (hasRadius && center) {
      const circleGeometry = generateCirclePolygon(center.lat, center.lng, rawRadius);
      const radiusKm = Math.round(rawRadius / 100) / 10;
      const addressHint = zone.address_label || zone.addressLabel || null;
      const radiusLabel = addressHint
        ? `${zoneName} (${addressHint} · Raggio ${radiusKm} km)`
        : `${zoneName} (Raggio ${radiusKm} km)`;

      const result = {
        id: zone.id || null,
        type: 'radius',
        displayName: zoneName.includes('Raggio') || zoneName.includes('km') ? zoneName : radiusLabel,
        parentMunicipality: parentMuni,
        geometry: circleGeometry,
        center,
        radiusM: rawRadius,
        quantity: Number(zone.quantity ?? zone.quantity_assigned ?? 0) || null,
        source: 'radius-circle',
      };
      if (zoneId) resolvedTerritoryCache.set(zoneId, result);
      return result;
    }

    // SAFEGUARD 3: If radius mode lacks center or radius, NEVER fall back to Comune Milano!
    const result = {
      id: zone.id || null,
      type: 'radius',
      displayName: zoneName,
      parentMunicipality: parentMuni,
      geometry: null,
      center,
      radiusM: hasRadius ? rawRadius : null,
      quantity: Number(zone.quantity ?? zone.quantity_assigned ?? 0) || null,
      source: 'radius-missing-center',
    };
    if (zoneId) resolvedTerritoryCache.set(zoneId, result);
    return result;
  }

  // Priority 3: Sub-territory (NIL Milano)
  // Query Nominatim specifically for district/suburb in Milan. NEVER fall back to full Comune Milano!
  if (isNil) {
    const milanCenter = center || { lat: 45.4642, lng: 9.19 };
    const nilGeom = await resolveMunicipalityBoundary(zoneName, milanCenter);

    const result = {
      id: zone.id || null,
      type: 'nil',
      displayName: zoneName,
      parentMunicipality: parentMuni || 'Milano',
      geometry: nilGeom,
      center,
      radiusM: null,
      quantity: Number(zone.quantity ?? zone.quantity_assigned ?? 0) || null,
      source: nilGeom ? 'nil-boundary' : 'none',
    };
    if (zoneId) resolvedTerritoryCache.set(zoneId, result);
    return result;
  }

  // Priority 4: Municipality boundary resolution for real Comuni
  const boundaryGeom = await resolveMunicipalityBoundary(zoneName, center || {
    lat: fallbackContext.lat,
    lng: fallbackContext.lng,
  });

  const result = {
    id: zone.id || null,
    type: 'comune',
    displayName: zoneName,
    parentMunicipality: parentMuni,
    geometry: boundaryGeom,
    center,
    radiusM: null,
    quantity: Number(zone.quantity ?? zone.quantity_assigned ?? 0) || null,
    source: boundaryGeom ? 'municipality-boundary' : 'none',
  };

  if (zoneId) resolvedTerritoryCache.set(zoneId, result);
  return result;
}

export function clearProgramTerritoryCache() {
  resolvedTerritoryCache.clear();
}
