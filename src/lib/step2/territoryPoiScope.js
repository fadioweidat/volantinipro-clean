import { parseAndValidateGeoJsonGeometry } from '../map/geometryValidation.js';

// Bounds for the POI request only. Never changes selected geometry or campaign KPIs.
export function resolveTerritoryPoiScope(rows = []) {
  const points = [];
  const visit = coordinates => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number') points.push(coordinates);
    else coordinates.forEach(visit);
  };
  for (const row of rows) {
    const geometry = parseAndValidateGeoJsonGeometry(row.geometry || row.polygon_geojson || row.geometry_geojson);
    if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') visit(geometry.coordinates);
  }
  if (!points.length) return null;
  const lngs = points.map(point => point[0]);
  const lats = points.map(point => point[1]);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const rad = value => value * Math.PI / 180;
  const radiusKm = Math.max(...points.map(([x, y]) => {
    const a = Math.sin(rad(y - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(y)) * Math.sin(rad(x - lng) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }));
  return { lat, lng, radiusKm: Math.ceil((radiusKm + 0.2) * 10) / 10 };
}
