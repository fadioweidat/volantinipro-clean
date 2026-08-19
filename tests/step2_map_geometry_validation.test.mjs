import assert from "node:assert/strict";
import {
  isValidGeoJsonGeometry,
  parseAndValidateGeoJsonGeometry,
  isFiniteLatLng,
  isUsableLatLngBounds,
} from "../src/lib/map/geometryValidation.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

const VALID_POLYGON = {
  type: "Polygon",
  coordinates: [[[9.10, 45.60], [9.11, 45.60], [9.11, 45.61], [9.10, 45.61], [9.10, 45.60]]],
};
const VALID_MULTIPOLYGON = { type: "MultiPolygon", coordinates: [VALID_POLYGON.coordinates] };

// A. Geometria valida → render/validazione PASS
test("A. poligono valido viene accettato", () => {
  assert.equal(isValidGeoJsonGeometry(VALID_POLYGON), true);
  assert.equal(isValidGeoJsonGeometry(VALID_MULTIPOLYGON), true);
  assert.deepEqual(parseAndValidateGeoJsonGeometry(VALID_POLYGON), VALID_POLYGON);
  assert.deepEqual(parseAndValidateGeoJsonGeometry(JSON.stringify(VALID_POLYGON)), VALID_POLYGON);
});

// B. Geometria null/undefined → ignorata, nessun crash
test("B. geometria null/undefined viene ignorata senza lanciare", () => {
  assert.equal(isValidGeoJsonGeometry(null), false);
  assert.equal(isValidGeoJsonGeometry(undefined), false);
  assert.equal(isValidGeoJsonGeometry({}), false);
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon" }), false);
  assert.equal(parseAndValidateGeoJsonGeometry(null), null);
  assert.equal(parseAndValidateGeoJsonGeometry(undefined), null);
});

// C. Coordinate incomplete/malformate → ignorate, nessun crash
test("C. coordinate incomplete o non finite vengono rifiutate", () => {
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon", coordinates: [] }), false);
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon", coordinates: [[]] }), false);
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon", coordinates: [[[9.1, 45.6], [9.2, 45.6]]] }), false); // ring < 4 punti
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon", coordinates: [[[9.1, 45.6], undefined, [9.2, 45.6], [9.1, 45.6]]] }), false);
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon", coordinates: [[[9.1, 45.6], [NaN, 45.6], [9.2, 45.7], [9.1, 45.6]]] }), false);
  assert.equal(isValidGeoJsonGeometry({ type: "MultiPolygon", coordinates: [[]] }), false);
  assert.equal(isValidGeoJsonGeometry({ type: "Polygon", coordinates: null }), false);
  assert.equal(parseAndValidateGeoJsonGeometry("{not valid json"), null);
  assert.equal(parseAndValidateGeoJsonGeometry({ type: "Polygon", coordinates: [[[undefined, undefined]]] }), null);
});

// D. Cambio rapido comune A → B: sequenza di geometrie valide/invalide alternate
// non deve mai lanciare, simulando aggiornamenti rapidi dei dati boundary.
test("D. sequenza rapida di geometrie valide/invalide non lancia mai", () => {
  const sequence = [
    VALID_POLYGON,
    null,
    { type: "Polygon", coordinates: [] },
    VALID_MULTIPOLYGON,
    undefined,
    { type: "Polygon", coordinates: [[[9.1, 45.6], [9.1, 45.6]]] },
    VALID_POLYGON,
  ];
  for (const geom of sequence) {
    assert.doesNotThrow(() => isValidGeoJsonGeometry(geom));
    assert.doesNotThrow(() => parseAndValidateGeoJsonGeometry(geom));
  }
});

// E. Update POI mentre il boundary cambia: coordinate POI parzialmente
// invalide (aggiornamento a metà) non devono mai lanciare né passare a valle.
test("E. lat/lng POI non finite vengono rifiutate senza lanciare", () => {
  const pois = [
    { id: 1, lat: 45.6, lng: 9.1 },
    { id: 2, lat: undefined, lng: 9.1 },
    { id: 3, lat: null, lng: null },
    { id: 4, lat: NaN, lng: 9.1 },
    { id: 5, lat: "45.6", lng: "9.1" }, // stringhe numeriche: ammesse (Number() finito)
  ];
  const valid = pois.filter((p) => isFiniteLatLng(p.lat, p.lng));
  assert.deepEqual(valid.map((p) => p.id), [1, 5]);
  assert.equal(isFiniteLatLng(undefined, undefined), false);
  assert.equal(isFiniteLatLng(null, null), false);
});

// F. Bounds non validi (es. da FeatureGroup vuoto dopo il filtro geometrie)
// non devono mai essere passati a map.fitBounds. Il mock replica la shape
// reale di un L.LatLngBounds (isValid + i 4 getter), non solo isValid().
function mockBounds({ valid = true, north = 45.61, south = 45.60, east = 9.11, west = 9.10 } = {}) {
  return {
    isValid: () => valid,
    getNorth: () => north,
    getSouth: () => south,
    getEast: () => east,
    getWest: () => west,
  };
}
test("F. bounds non validi vengono rilevati prima di fitBounds", () => {
  assert.equal(isUsableLatLngBounds(null), false);
  assert.equal(isUsableLatLngBounds(undefined), false);
  assert.equal(isUsableLatLngBounds({}), false);
  assert.equal(isUsableLatLngBounds(mockBounds({ valid: false })), false);
  assert.equal(isUsableLatLngBounds(mockBounds()), true);
});

// G. Bounds degeneri (area a superficie zero: north===south o east===west)
// vengono rifiutati anche se isValid() e' true — fitBounds su un'area
// piatta produce uno zoom non finito che il redraw successivo legge come
// coordinata pixel indefinita ("Cannot read properties of undefined").
test("G. bounds degeneri (north===south o east===west) vengono rifiutati", () => {
  assert.equal(isUsableLatLngBounds(mockBounds({ north: 45.60, south: 45.60 })), false);
  assert.equal(isUsableLatLngBounds(mockBounds({ east: 9.10, west: 9.10 })), false);
  assert.equal(isUsableLatLngBounds(mockBounds({ north: NaN })), false);
});

// H. Ring poligonale non chiuso (prima coordinata !== ultima) viene
// rifiutato: Leaflet lo accetta silenziosamente ma produce un edge mancante
// che puo' rompere il calcolo interno dei bounds al primo redraw.
test("H. ring poligonale non chiuso viene rifiutato", () => {
  const openRingPolygon = {
    type: "Polygon",
    coordinates: [[[9.10, 45.60], [9.11, 45.60], [9.11, 45.61], [9.10, 45.61]]], // manca il punto di chiusura
  };
  assert.equal(isValidGeoJsonGeometry(openRingPolygon), false);
  assert.equal(isValidGeoJsonGeometry(VALID_POLYGON), true); // il ring chiuso resta valido
});

console.log(`Step2Map geometry validation tests: ${passed} passed`);
