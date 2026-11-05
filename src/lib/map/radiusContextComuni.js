// Livello geografico attorno al raggio: file statici generati una sola volta
// (scripts/build-lombardia-comuni.mjs, scripts/build-milano-nil.mjs), nessuna
// query a Supabase dalla mappa. Disegna i territori con il confine completo; il
// livello operativo dell'analisi resta sopra, invisibile, e non ne cambia il
// colore: KPI e quantita' continuano a usare le geometrie dell'analisi.
import { territoryColor } from './territoryColors.js';

export const CONTEXT_COMUNI_ASSET = '/data/territories/lombardia-comuni.json';
export const CONTEXT_NIL_ASSET = '/data/territories/milano-nil.json';
export const CONTEXT_MIN_ZOOM = 9;
const MILANO_COMUNE_ID = 'api_015146';

// Stessa opacita' per ogni territorio, dentro e fuori dal cerchio.
export const TERRITORY_FILL_OPACITY = 0.42;
export const TERRITORY_LINE_OPACITY = 0.75;

// Territori non coinvolti: solo linee sottili e neutre.
export const CONTEXT_COMUNE_STYLE = { color: '#94A3B8', weight: 0.8, opacity: 0.4 };
export const CONTEXT_NIL_STYLE = { color: '#94A3B8', weight: 0.6, opacity: 0.35, dashArray: '2 4' };
// Il comune di Milano non si riempie: sopra i NIL resta solo il suo confine.
export const MILANO_BOUNDARY_STYLE = { color: '#E2E8F0', weight: 1.6, opacity: 0.8 };

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

// Prima i confini piu' importanti: dove coincidono resta il primo.
// La parte di Milano fuori da ogni NIL ha il colore del comune, altrimenti
// resterebbe un buco scuro: i confini NIL e quello ISTAT non coincidono.
export function selectContextTerritories({ comuni, nil, rest, showComuni, showNil, involvedColors = new Map() }) {
  const comuneRows = showComuni && comuni?.length ? comuni : [];
  const milanoInvolved = [...involvedColors.keys()].some((id) => id.startsWith('nil_'));
  const milano = comuneRows.filter((row) => row.id === MILANO_COMUNE_ID)
    .map((row) => ({ ...row, style: MILANO_BOUNDARY_STYLE, pane: 'municipalityBoundaryPane' }));
  const others = comuneRows.filter((row) => row.id !== MILANO_COMUNE_ID);
  const nilRows = showNil && nil?.length ? nil : [];
  const restRows = rest?.type === 'MultiPolygon' && nilRows.length && milanoInvolved
    ? [{ id: 'milano_rest', geometry: rest, bounds: boundsOf(rest), fillColor: territoryColor(MILANO_COMUNE_ID), outline: false }]
    : [];
  return [
    ...milano,
    ...others.filter((row) => involvedColors.has(row.id)).map((row) => ({ ...row, fillColor: involvedColors.get(row.id) })),
    ...others.filter((row) => !involvedColors.has(row.id)),
    ...nilRows.map((row) => (milanoInvolved ? { ...row, fillColor: territoryColor(row.id) } : row)),
    ...restRows,
  ];
}

// Il livello operativo si fa invisibile solo se il territorio e' gia' disegnato
// nel livello geografico: se il file manca o il controllo e' spento resta lui.
export function isDrawnByGeographicLayer(id, { ready, showComuni, showNil }) {
  const territory = String(id);
  if (!ready) return false;
  if (territory.startsWith('nil_')) return showNil;
  return territory.startsWith('api_') && territory !== MILANO_COMUNE_ID && showComuni;
}

// Un confine condiviso da due territori esiste due volte nei dati: `seen` lo fa
// disegnare una sola, altrimenti le due trasparenze si sommano e la linea spicca.
export function uniqueOutline(geometry, seen = new Set()) {
  const lines = [];
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      let line = null;
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1];
        const end = ring[index];
        const key = [start.join(), end.join()].sort().join('|');
        if (seen.has(key)) {
          line = null;
        } else {
          seen.add(key);
          if (!line) {
            line = [start];
            lines.push(line);
          }
          line.push(end);
        }
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
