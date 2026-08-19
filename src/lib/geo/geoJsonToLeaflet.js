// Un solo posto per la conversione GeoJSON [lng,lat] -> Leaflet [lat,lng],
// usata da GpsMonitor.jsx (mappa GPS reale), CoverageAdjustmentPanel.jsx
// (confine boundary MANUALE) e ZoneCoverageMap.jsx (confine boundary
// AUTOMATICO) — prima duplicata inline in almeno due punti, con una versione
// che gestiva solo Polygon (bug: MultiPolygon spariva silenziosamente).
// Gestisce sia Polygon che MultiPolygon, come i confini reali restituiti da
// resolveMunicipalityBoundary.
export function geoJsonPolygonToLeafletPositions(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((poly) => poly.map((ring) => ring.map(([lng, lat]) => [lat, lng])));
  }
  return [];
}
