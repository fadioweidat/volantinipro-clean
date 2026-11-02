// Comuni e NIL di contesto attorno al raggio: file statici generati una sola
// volta (scripts/build-lombardia-comuni.mjs, scripts/build-milano-nil.mjs),
// nessuna query a Supabase dalla mappa.
// Solo visualizzazione: KPI e quantita' usano le geometrie dell'analisi.
import { clipTerritoryToRadius } from './clipTerritoryToRadius.js';

export const CONTEXT_COMUNI_ASSET = '/data/territories/lombardia-comuni.json';
export const CONTEXT_NIL_ASSET = '/data/territories/milano-nil.json';
const MILANO_COMUNE_ID = 'api_015146';
export const CONTEXT_FILL_OPACITY = 0.2;
export const CONTEXT_MIN_ZOOM = 9;

function boundsOf(geometry) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
  }
  return { west, east, south, north };
}

export function prepareContextComuni(payload) {
  return (Array.isArray(payload?.comuni) ? payload.comuni : [])
    .filter((row) => row?.c && row.g?.type === 'MultiPolygon')
    .map((row) => ({ id: `api_${String(row.c).toLowerCase()}`, name: row.n, geometry: row.g, bounds: boundsOf(row.g) }));
}

// I confini NIL e quello ISTAT del comune non coincidono: la parte di Milano
// fuori da ogni NIL resta del colore del comune e non si ritaglia, perche' dentro
// il cerchio nessun territorio dell'analisi la colora.
export function prepareContextNil(payload) {
  const nil = (Array.isArray(payload?.nil) ? payload.nil : [])
    .filter((row) => row?.c && row.g?.type === 'MultiPolygon')
    .map((row) => ({ id: `nil_${row.c}`, name: row.n, geometry: row.g, bounds: boundsOf(row.g) }));
  if (nil.length === 0 || payload.rest?.type !== 'MultiPolygon') return nil;
  return [...nil, { id: MILANO_COMUNE_ID, name: 'Milano', geometry: payload.rest, bounds: boundsOf(payload.rest), keepInsideRadius: true }];
}

// I NIL dividono Milano: con i NIL visibili il comune non si colora, altrimenti
// i due riempimenti si sommerebbero. Se i NIL non arrivano resta il comune.
export function selectContextTerritories({ comuni, nil, showComuni, showNil }) {
  const nilRows = showNil && nil?.length ? nil : [];
  const comuneRows = showComuni && comuni?.length ? comuni : [];
  return [...nilRows, ...(nilRows.length ? comuneRows.filter((row) => row.id !== MILANO_COMUNE_ID) : comuneRows)];
}

function loadOnce(asset, prepare) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = fetch(asset)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP_${response.status}`);
          return response.json();
        })
        .then(prepare)
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
}

export const loadContextComuni = loadOnce(CONTEXT_COMUNI_ASSET, prepareContextComuni);
export const loadContextNil = loadOnce(CONTEXT_NIL_ASSET, prepareContextNil);

export function boundsOverlap(a, b) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

// La parte dentro il cerchio diventa un buco (Leaflet riempie con evenodd):
// il contesto non si somma mai ai colori dei territori nel raggio.
export function geometryOutsideRadius(geometry, latitude, longitude, radiusKm) {
  return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map((polygon) => {
      const inside = clipTerritoryToRadius({ type: 'Polygon', coordinates: polygon }, latitude, longitude, radiusKm);
      if (!inside) return polygon;
      const parts = inside.type === 'Polygon' ? [inside.coordinates] : inside.coordinates;
      return [...polygon, ...parts.flat()];
    }),
  };
}
