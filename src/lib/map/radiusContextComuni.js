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
export const CONTEXT_COMUNE_STYLE = { color: '#94A3B8', weight: 0.8, opacity: 0.4 };
export const CONTEXT_NIL_STYLE = { color: '#94A3B8', weight: 0.6, opacity: 0.35, dashArray: '2 4' };
export const CONTINUATION_FILL_OPACITY = 0.2;
export const CONTINUATION_LINE_OPACITY = 0.6;

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

// Prima i comuni coinvolti dal raggio, poi gli altri, poi i NIL: dove i confini
// coincidono vince la linea del comune che continua oltre il cerchio.
export function selectContextTerritories({ comuni, nil, showComuni, showNil, involvedColors = new Map() }) {
  const comuneRows = showComuni && comuni?.length ? comuni : [];
  const involved = comuneRows.filter((row) => involvedColors.has(row.id)).map((row) => ({ ...row, continuationColor: involvedColors.get(row.id) }));
  return [...involved, ...comuneRows.filter((row) => !involvedColors.has(row.id)), ...(showNil && nil?.length ? nil : [])];
}

// Il comune che entra nel raggio prosegue fuori con lo stesso colore, tenue. La
// parte dentro il cerchio diventa un buco (Leaflet riempie con evenodd): li'
// comanda il poligono dell'analisi e i due colori non si sommano.
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

// Tratti del segmento fuori dal cerchio, come coppie di posizioni tra 0 e 1.
function partsOutsideCircle(ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const a = dx * dx + dy * dy;
  const b = 2 * (ax * dx + ay * dy);
  const c = ax * ax + ay * ay - radius * radius;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc <= 0) return c > 0 ? [[0, 1]] : [];
  const first = (-b - Math.sqrt(disc)) / (2 * a);
  const second = (-b + Math.sqrt(disc)) / (2 * a);
  return [[0, Math.min(first, 1)], [Math.max(second, 0), 1]].filter(([from, to]) => to > from);
}

// Contorni fuori dal cerchio: dentro ci sono gia' i poligoni dell'analisi. Un
// confine condiviso da due territori esiste due volte nei dati: `seen` lo fa
// disegnare una sola, altrimenti le due trasparenze si sommano e la linea spicca.
export function outlineOutsideRadius(geometry, latitude, longitude, radiusKm, seen = new Set()) {
  const kmLng = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const kmLat = 110.95;
  const lines = [];
  let line = null;
  const addPart = (from, to) => {
    if (line && line[line.length - 1][0] === from[0] && line[line.length - 1][1] === from[1]) {
      line.push(to);
    } else {
      line = [from, to];
      lines.push(line);
    }
  };
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1];
        const end = ring[index];
        const key = [start.join(), end.join()].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const ax = (start[0] - longitude) * kmLng;
        const ay = (start[1] - latitude) * kmLat;
        const bx = (end[0] - longitude) * kmLng;
        const by = (end[1] - latitude) * kmLat;
        const at = (t) => (t <= 0 ? start : t >= 1 ? end : [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
        for (const [from, to] of partsOutsideCircle(ax, ay, bx, by, radiusKm)) addPart(at(from), at(to));
      }
    }
  }
  return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
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
