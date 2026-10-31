// Ritaggio VISIVO dei poligoni GeoJSON al raggio (metri).
// Non utilizzare questo risultato per KPI/quantità: il modello dati resta immutato.
// Sutherland-Hodgman: poligono soggetto contro disco convesso approssimato
// da 128 lati. Coordinate proiettate localmente in metri (accurate per 0.5-10 km).
const EARTH_RADIUS_M = 6371008.8;
const SEGMENTS = 128;

export function clipTerritoryToRadius(geometry, latitude, longitude, radiusKm) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) ||
      ![latitude, longitude, radiusKm].every(Number.isFinite) || radiusKm <= 0) return null;
  const lat0 = latitude * Math.PI / 180;
  const cosLat = Math.cos(lat0);
  if (Math.abs(cosLat) < 0.01) return null;
  const toXY = ([lon, lat]) => [
    (lon - longitude) * Math.PI / 180 * EARTH_RADIUS_M * cosLat,
    (lat - latitude) * Math.PI / 180 * EARTH_RADIUS_M,
  ];
  const toGeo = ([x, y]) => [
    longitude + x / (EARTH_RADIUS_M * cosLat) * 180 / Math.PI,
    latitude + y / EARTH_RADIUS_M * 180 / Math.PI,
  ];
  // Un lieve margine evita punte fuori dal cerchio Leaflet, che usa distanza geodetica.
  const r = radiusKm * 1000 * 0.998;
  const circle = Array.from({ length: SEGMENTS }, (_, i) => {
    const a = i * 2 * Math.PI / SEGMENTS;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  function clipRing(ring) {
    let points = ring.slice(0, -1).map(toXY);
    for (let i = 0; i < circle.length && points.length; i++) {
      const a = circle[i], b = circle[(i+1) % circle.length];
      const output = [];
      let prev = points[points.length - 1], prevD = cross(a,b,prev);
      for (const curr of points) {
        const currD = cross(a,b,curr);
        const prevIn = prevD >= -1e-7, currIn = currD >= -1e-7;
        if (prevIn !== currIn) {
          const t = prevD / (prevD - currD);
          output.push([prev[0]+t*(curr[0]-prev[0]), prev[1]+t*(curr[1]-prev[1])]);
        }
        if (currIn) output.push(curr);
        prev = curr; prevD = currD;
      }
      points = output;
    }
    if (points.length < 3) return null;
    const area = points.reduce((sum,p,i) => {
      const q = points[(i+1)%points.length]; return sum + p[0]*q[1]-q[0]*p[1];
    },0);
    if (Math.abs(area) < 1) return null;
    const result = points.map(toGeo);
    result.push([...result[0]]);
    return result;
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const clipped = polygons.flatMap(poly => {
    if (!Array.isArray(poly) || !poly.length) return [];
    const outer = clipRing(poly[0]);
    if (!outer) return [];
    const holes = poly.slice(1).map(clipRing).filter(Boolean);
    return [[outer, ...holes]];
  });
  if (!clipped.length) return null;
  return clipped.length === 1
    ? { type: 'Polygon', coordinates: clipped[0] }
    : { type: 'MultiPolygon', coordinates: clipped };
}
