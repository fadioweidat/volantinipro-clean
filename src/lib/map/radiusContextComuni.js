// Confini di riferimento attorno al raggio: file statici generati una sola
// volta (scripts/build-lombardia-comuni.mjs, scripts/build-milano-nil.mjs),
// nessuna query a Supabase dalla mappa. Fuori dal cerchio solo contorni: i
// territori colorati sono quelli dell'analisi, dentro il cerchio.
// Solo visualizzazione: KPI e quantita' usano le geometrie dell'analisi.
import { clipTerritoryToRadius } from './clipTerritoryToRadius.js';

export const CONTEXT_COMUNI_ASSET = '/data/territories/lombardia-comuni.json';
export const CONTEXT_NIL_ASSET = '/data/territories/milano-nil.json';
export const CONTEXT_MIN_ZOOM = 9;

// Linee sottili e neutre: la cartografia sotto resta leggibile. Il NIL e'
// tratteggiato per distinguerlo a colpo d'occhio dal confine comunale.
export const CONTEXT_COMUNE_STYLE = { color: '#CBD5E1', weight: 1.1, opacity: 0.6, fill: false };
export const CONTEXT_NIL_STYLE = { color: '#94A3B8', weight: 0.8, opacity: 0.55, dashArray: '3 4', fill: false };

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
    .map((row) => ({ id: `api_${String(row.c).toLowerCase()}`, name: row.n, geometry: row.g, bounds: boundsOf(row.g), style: CONTEXT_COMUNE_STYLE }));
}

export function prepareContextNil(payload) {
  return (Array.isArray(payload?.nil) ? payload.nil : [])
    .filter((row) => row?.c && row.g?.type === 'MultiPolygon')
    .map((row) => ({ id: `nil_${row.c}`, name: row.n, geometry: row.g, bounds: boundsOf(row.g), style: CONTEXT_NIL_STYLE }));
}

// I confini NIL e quello ISTAT del comune non coincidono: la parte di Milano
// fuori da ogni NIL non e' un territorio dell'analisi e dentro il cerchio
// resterebbe un buco scuro. Si colora solo quella porzione, mai fuori.
export function milanoRestInsideRadius(rest, latitude, longitude, radiusKm) {
  const coordinates = (rest?.type === 'MultiPolygon' ? rest.coordinates : []).flatMap((polygon) => {
    const inside = clipTerritoryToRadius({ type: 'Polygon', coordinates: polygon }, latitude, longitude, radiusKm);
    if (!inside) return [];
    return inside.type === 'Polygon' ? [inside.coordinates] : inside.coordinates;
  });
  return coordinates.length ? { type: 'MultiPolygon', coordinates } : null;
}

// NIL sotto, comuni sopra: il confine comunale resta continuo dove coincidono.
export function selectContextTerritories({ comuni, nil, showComuni, showNil }) {
  return [...(showNil && nil?.length ? nil : []), ...(showComuni && comuni?.length ? comuni : [])];
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
export const loadContextNil = loadOnce(CONTEXT_NIL_ASSET, (payload) => ({ nil: prepareContextNil(payload), rest: payload?.rest }));

export function boundsOverlap(a, b) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}
