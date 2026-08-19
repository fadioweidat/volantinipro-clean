// Validazione strutturale di geometrie GeoJSON e coppie lat/lng prima di
// passarle a Leaflet. Leaflet analizza il GeoJSON in modo permissivo (non
// lancia per ring vuoti, coordinate mancanti o coppie non finite): questi
// dati "quasi validi" superano JSON.parse e L.geoJSON() senza errori, ma
// producono layer con parti interne indefinite che il Canvas renderer legge
// durante un successivo redraw/pan/zoom (es. dopo fitBounds), causando
// "Cannot read properties of undefined (reading 'x')" in Canvas.js/Bounds.js.
// Filtrare qui, alla sorgente, evita di montare quei layer.

function isFiniteCoordinatePair(pos) {
  return Array.isArray(pos) && pos.length >= 2 && Number.isFinite(pos[0]) && Number.isFinite(pos[1]);
}

function isValidLinearRing(ring) {
  // Un ring GeoJSON valido ha almeno 4 posizioni e dev'essere chiuso (prima
  // coordinata === ultima): un ring aperto produce un poligono con un edge
  // mancante che Leaflet accetta silenziosamente ma il cui bounding-box
  // interno può risultare indefinito al primo redraw/fitBounds.
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isFiniteCoordinatePair)) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function isValidPolygonCoordinates(coords) {
  return Array.isArray(coords) && coords.length > 0 && coords.every(isValidLinearRing);
}

function isValidMultiPolygonCoordinates(coords) {
  return Array.isArray(coords) && coords.length > 0 && coords.every(isValidPolygonCoordinates);
}

function isValidLineStringCoordinates(coords) {
  return Array.isArray(coords) && coords.length >= 2 && coords.every(isFiniteCoordinatePair);
}

function isValidMultiLineStringCoordinates(coords) {
  return Array.isArray(coords) && coords.length > 0 && coords.every(isValidLineStringCoordinates);
}

function isValidMultiPointCoordinates(coords) {
  return Array.isArray(coords) && coords.length > 0 && coords.every(isFiniteCoordinatePair);
}

/**
 * Valida ricorsivamente una geometria GeoJSON: struttura del tipo dichiarato
 * e finitezza di ogni coordinata. Ritorna false per geometry null/undefined,
 * tipo sconosciuto, ring/coordinate mancanti, vuoti o con NaN/undefined.
 */
export function isValidGeoJsonGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  const coords = geometry.coordinates;
  switch (geometry.type) {
    case 'Point':
      return isFiniteCoordinatePair(coords);
    case 'MultiPoint':
      return isValidMultiPointCoordinates(coords);
    case 'LineString':
      return isValidLineStringCoordinates(coords);
    case 'MultiLineString':
      return isValidMultiLineStringCoordinates(coords);
    case 'Polygon':
      return isValidPolygonCoordinates(coords);
    case 'MultiPolygon':
      return isValidMultiPolygonCoordinates(coords);
    case 'GeometryCollection':
      return Array.isArray(geometry.geometries) && geometry.geometries.length > 0 &&
        geometry.geometries.every(isValidGeoJsonGeometry);
    default:
      return false;
  }
}

/** Valida (e opzionalmente fa il parse JSON di) una geometria grezza proveniente da DB/API. */
export function parseAndValidateGeoJsonGeometry(rawGeometry) {
  let geometry = rawGeometry;
  if (typeof rawGeometry === 'string') {
    try {
      geometry = JSON.parse(rawGeometry);
    } catch {
      return null;
    }
  }
  return isValidGeoJsonGeometry(geometry) ? geometry : null;
}

export function isFiniteLatLng(lat, lng) {
  // Number(null) === 0 e Number('') === 0: coercizioni ingannevoli che
  // farebbero passare "nessun dato" per una coordinata reale (0,0).
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (typeof lat === 'string' && lat.trim() === '') return false;
  if (typeof lng === 'string' && lng.trim() === '') return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

/**
 * True se un L.LatLngBounds (o equivalente con isValid()) è utilizzabile per
 * fitBounds. Oltre a isValid() (che Leaflet considera vera anche per un
 * bounds collassato in un punto), scarta anche i bounds degeneri
 * (north===south o east===west): fitBounds su un'area a superficie zero
 * produce uno zoom infinito/non finito che il redraw successivo può leggere
 * come coordinata pixel indefinita.
 */
export function isUsableLatLngBounds(bounds) {
  if (!bounds || typeof bounds.isValid !== 'function' || !bounds.isValid()) return false;
  const north = bounds.getNorth?.();
  const south = bounds.getSouth?.();
  const east = bounds.getEast?.();
  const west = bounds.getWest?.();
  if (![north, south, east, west].every(Number.isFinite)) return false;
  return north !== south && east !== west;
}
