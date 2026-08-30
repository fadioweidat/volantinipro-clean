// Rendering geometry-aware delle correzioni copertura salvate
// (campaign_coverage_adjustments.geometry). Una LineString NON deve mai
// diventare un poligono degenere: si converte in una o piu' polilinee
// [lat,lng] per Leaflet. Polygon/MultiPolygon -> anelli poligonali.
//
// Puro, senza dipendenze (testabile da node:test).

function conv(pts) {
  return Array.isArray(pts) ? pts.map(([lng, lat]) => [lat, lng]) : [];
}

/**
 * @param {{type?:string, coordinates?:any}} geometry  GeoJSON [lng,lat]
 * @returns {Array<Array<[number,number]>>} 0..N tracciati [lat,lng]
 */
export function geometryToLeafletLines(geometry) {
  const t = geometry?.type;
  const c = geometry?.coordinates;
  if (!Array.isArray(c)) return [];
  if (t === 'LineString') return [conv(c)];
  if (t === 'MultiLineString') return c.map(conv);
  if (t === 'Polygon') return c[0] ? [conv(c[0])] : [];
  if (t === 'MultiPolygon') return c.map((poly) => conv(poly?.[0]));
  return [];
}

export function isPolygonGeometry(geometry) {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

export function geometryFirstLatLng(geometry) {
  return geometryToLeafletLines(geometry)[0]?.[0] || null;
}
