import { resolveMunicipalityBoundary } from '../resolveMunicipalityBoundary.js';
import { normalizeMunicipalityName } from '../../step2/addressIntent.js';

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
 * In-memory cache for resolved territory geometry keyed strictly by zone ID / canonical identifier.
 */
const resolvedTerritoryCache = new Map();

/**
 * Resolves the canonical territory contract for a campaign/driver zone:
 * 1. Immediate polygon if `polygon_geojson` / `geometry` is present on the zone record.
 * 2. Generated circle polygon if `radius_m > 0` and center coordinates exist (Radius mode).
 * 3. NIL or sub-municipality boundary resolution with center hint.
 * 4. Municipality boundary via Nominatim / analysis-istat fallback.
 *
 * @param {Object} zone - The active zone object (from assignmentZones or campaign_zones)
 * @param {Object} [fallbackContext] - Optional fallback campaign context { city, lat, lng }
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
  if (!zone) {
    const fallbackName = fallbackContext.city || fallbackContext.cityName || null;
    if (!fallbackName) {
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
    const geom = await resolveMunicipalityBoundary(fallbackName, {
      lat: fallbackContext.lat,
      lng: fallbackContext.lng,
    });
    return {
      id: null,
      type: 'comune',
      displayName: fallbackName,
      parentMunicipality: null,
      geometry: geom,
      center: fallbackContext.lat && fallbackContext.lng ? { lat: fallbackContext.lat, lng: fallbackContext.lng } : null,
      radiusM: null,
      quantity: null,
      source: geom ? 'municipality-boundary' : 'none',
    };
  }

  const zoneId = zone.id || zone.zone_name;
  if (zoneId && resolvedTerritoryCache.has(zoneId)) {
    return resolvedTerritoryCache.get(zoneId);
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
  const territoryType = zone.territory_type || (hasRadius ? 'radius' : directGeometry ? 'polygon' : 'comune');

  // Priority 1: Direct polygon already stored on the zone record
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

  // Priority 2: Radius territory (circle geometry generated accurately)
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

  // Priority 3 & 4: Sub-territory (NIL) or municipality boundary resolution
  // Query using zoneName and center hint if available
  const boundaryGeom = await resolveMunicipalityBoundary(zoneName, center || {
    lat: fallbackContext.lat,
    lng: fallbackContext.lng,
  });

  const isNil = territoryType === 'nil' || (parentMuni && parentMuni.toLowerCase() !== zoneName.toLowerCase());

  const result = {
    id: zone.id || null,
    type: isNil ? 'nil' : 'comune',
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
