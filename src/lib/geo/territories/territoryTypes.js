// Geographic presentation only. Coordinates use GeoJSON order: [longitude, latitude].
export const TERRITORY_STATUS = Object.freeze({
  LOADING: 'LOADING', AVAILABLE: 'AVAILABLE', UNAVAILABLE: 'UNAVAILABLE',
  DEGRADED: 'DEGRADED', INVALID_GEOMETRY: 'INVALID_GEOMETRY',
});

export class InvalidTerritoryGeometry extends Error {
  constructor(message) { super(message); this.name = 'InvalidTerritoryGeometry'; }
}

export function polygonMetrics(geometry) {
  const fail = () => { throw new InvalidTerritoryGeometry('Geometria territoriale non valida'); };
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) fail();
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) fail();
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  let weight = 0, cx = 0, cy = 0, sphericalArea = 0;
  const rad = Math.PI / 180;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) fail();
    for (const [ringIndex, ring] of polygon.entries()) {
      if (!Array.isArray(ring) || ring.length < 4) fail();
      for (const point of ring) {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) fail();
        const [x, y] = point;
        // Municipality-scoped guard also rejects accidental lat/lng reversal.
        if (x < 8.9 || x > 9.35 || y < 45.3 || y > 45.65) fail();
        bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) fail();
      const [ox, oy] = ring[0];
      let twiceArea = 0, rx = 0, ry = 0, spherical = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        const cross = (x1 - ox) * (y2 - oy) - (x2 - ox) * (y1 - oy);
        twiceArea += cross;
        rx += (x1 + x2 - 2 * ox) * cross;
        ry += (y1 + y2 - 2 * oy) * cross;
        spherical += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
      }
      if (Math.abs(twiceArea) < 1e-12) fail();
      const w = Math.abs(twiceArea) * (ringIndex === 0 ? 1 : -1);
      weight += w; cx += (ox + rx / (3 * twiceArea)) * w; cy += (oy + ry / (3 * twiceArea)) * w;
      sphericalArea += Math.abs(spherical) * (ringIndex === 0 ? 1 : -1);
    }
  }
  if (weight <= 0 || sphericalArea <= 0 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) fail();
  const centroid = [cx / weight, cy / weight];
  if (!centroid.every(Number.isFinite) || centroid[0] < bbox[0] || centroid[0] > bbox[2] || centroid[1] < bbox[1] || centroid[1] > bbox[3]) fail();
  return { bbox, centroid, areaKm2: sphericalArea * 6371008.8 ** 2 / 2 / 1e6 };
}
