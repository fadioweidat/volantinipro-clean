// Comuni di contesto attorno al raggio: file statico generato una sola volta
// (scripts/build-lombardia-comuni.mjs), nessuna query a Supabase dalla mappa.
// Solo visualizzazione: KPI e quantita' usano le geometrie dell'analisi.
import { clipTerritoryToRadius } from './clipTerritoryToRadius.js';

export const CONTEXT_COMUNI_ASSET = '/data/territories/lombardia-comuni.json';
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

let pending = null;

export function loadContextComuni() {
  if (!pending) {
    pending = fetch(CONTEXT_COMUNI_ASSET)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        return response.json();
      })
      .then(prepareContextComuni)
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

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
