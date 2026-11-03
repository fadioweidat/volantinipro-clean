// Interrogazione del dataset POI OpenStreetMap preparato offline
// (scripts/poi-dataset/build_poi_dataset.py). Puro: nessun I/O, nessuna rete.
//
// Stessa semantica della query Overpass di poi-search:
// - nodi e way con una delle coppie key=val del servizio/target;
// - distanza dal centro <= raggio (per le way: centro del riquadro, come
//   `out center`);
// - ordine nodi per id, poi way per id; si tengono i primi `cap`;
// - elementi in forma Overpass: { type, id, lat, lon, tags } per i nodi,
//   { type, id, center: { lat, lon }, tags } per le way.
//
// Copertura: risponde SOLO se tutte le celle toccate dal cerchio sono celle
// "in" del manifest (interamente in Lombardia, dati completi). Una cella di
// confine o assente rende la risposta non autorevole: `covered:false`, e il
// chiamante usa Overpass. Cosi' un'area fuori dataset non diventa mai uno
// zero falso.

const EARTH_RADIUS_M = 6371000;

function haversineM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Celle (chiavi "ix_iy") che il riquadro del cerchio attraversa. */
export function cellsForCircle({ centerLat, centerLng, radiusKm }, cellDeg) {
  const dLat = (radiusKm * 1000) / 111320;
  const dLng = dLat / Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
  const ix0 = Math.floor((centerLng - dLng) / cellDeg);
  const ix1 = Math.floor((centerLng + dLng) / cellDeg);
  const iy0 = Math.floor((centerLat - dLat) / cellDeg);
  const iy1 = Math.floor((centerLat + dLat) / cellDeg);
  const keys = [];
  for (let ix = ix0; ix <= ix1; ix += 1) {
    for (let iy = iy0; iy <= iy1; iy += 1) keys.push(`${ix}_${iy}`);
  }
  return keys;
}

/**
 * @param {{ manifest: object, cells: Record<string, {n: any[], w: any[]}> }} dataset
 * @param {{ centerLat: number, centerLng: number, radiusKm: number, tags: Array<{key:string,val:string}>, cap: number }} query
 * @returns {{ covered: true, elements: object[] } | { covered: false, reason: string }}
 */
export function queryPoiDataset(dataset, { centerLat, centerLng, radiusKm, tags, cap }) {
  const { manifest, cells } = dataset;
  const keys = cellsForCircle({ centerLat, centerLng, radiusKm }, manifest.cellDeg);
  for (const key of keys) {
    const entry = manifest.cells[key];
    if (!entry) return { covered: false, reason: 'outside_dataset' };
    if (entry.s !== 'in') return { covered: false, reason: 'border_cell' };
    if ((entry.n || entry.w) && !cells[key]) return { covered: false, reason: 'cell_missing' };
  }

  const wanted = new Map();
  for (const { key, val } of tags) {
    if (!wanted.has(key)) wanted.set(key, new Set());
    wanted.get(key).add(val);
  }
  const matches = (elementTags) => {
    for (const [key, vals] of wanted) {
      const v = elementTags[key];
      if (v != null && vals.has(v)) return true;
    }
    return false;
  };

  const radiusM = radiusKm * 1000;
  const nodes = [];
  const ways = [];
  for (const key of keys) {
    const cell = cells[key];
    if (!cell) continue; // cella "in" senza POI: zero reale
    for (const [id, lat, lon, elementTags] of cell.n) {
      if (matches(elementTags) && haversineM(centerLat, centerLng, lat, lon) <= radiusM) {
        nodes.push({ type: 'node', id, lat, lon, tags: elementTags });
      }
    }
    for (const [id, lat, lon, elementTags] of cell.w) {
      if (matches(elementTags) && haversineM(centerLat, centerLng, lat, lon) <= radiusM) {
        ways.push({ type: 'way', id, center: { lat, lon }, tags: elementTags });
      }
    }
  }
  nodes.sort((a, b) => a.id - b.id);
  ways.sort((a, b) => a.id - b.id);
  const limit = Math.max(1, Math.round(cap));
  return { covered: true, elements: nodes.concat(ways).slice(0, limit) };
}

/**
 * Verifica un pacchetto scaricato contro il manifest: versione e celle con
 * POI devono coincidere. Un pacchetto incoerente non va mai usato.
 */
export function validatePoiBundle(manifest, bundle) {
  if (!manifest || manifest.schema !== 1) return 'manifest_schema';
  if (!bundle || bundle.version !== manifest.version) return 'version_mismatch';
  if (bundle.cellDeg !== manifest.cellDeg) return 'cell_size_mismatch';
  for (const [key, entry] of Object.entries(manifest.cells || {})) {
    const cell = bundle.cells?.[key];
    const expected = (entry.n || 0) + (entry.w || 0);
    if (expected === 0) continue;
    if (!cell || cell.n.length !== entry.n || cell.w.length !== entry.w) return `cell_${key}`;
  }
  return null;
}
