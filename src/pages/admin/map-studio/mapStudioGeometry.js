// Studio Mappa — helper geometrici PURI e testabili.
//
// ISOLAMENTO: questo modulo NON importa nulla dal motore operativo GPS
// (niente src/lib/geo/*, niente CoverageAdjustmentPanel, niente RPC). Tutta
// la geometria dello Studio vive qui, autocontenuta e senza side-effect.
//
// Convenzione: un punto e' [lat, lng]. Una polilinea e' [[lat,lng], ...].
// Un anello poligonale e' [[lat,lng], ...] (aperto o chiuso, gestiamo
// entrambi). GeoJSON usa [lng,lat]: la conversione avviene solo in
// mapStudioGeoJson.js, mai qui.

const EARTH_RADIUS_M = 6371008.8;
const DEG2RAD = Math.PI / 180;

export function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const lat1 = a[0] * DEG2RAD;
  const lat2 = b[0] * DEG2RAD;
  const dLat = (b[0] - a[0]) * DEG2RAD;
  const dLng = (b[1] - a[1]) * DEG2RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Proiezione locale equirettangolare attorno a un lat di riferimento: metri
// planari, sufficiente per distanze < qualche km (hit-test, snapping, split).
export function localProjector(refLat) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((refLat || 0) * DEG2RAD);
  return {
    toXY: ([lat, lng]) => [lng * mPerDegLng, lat * mPerDegLat],
    toLatLng: ([x, y]) => [y / mPerDegLat, x / mPerDegLng],
  };
}

export function polylineLengthMeters(line) {
  if (!Array.isArray(line) || line.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < line.length; i += 1) total += haversineMeters(line[i - 1], line[i]);
  return total;
}

// Somma delle lunghezze di piu' polilinee.
export function totalLengthMeters(lines) {
  return (lines || []).reduce((s, l) => s + polylineLengthMeters(l), 0);
}

// Area di un anello [lat,lng] in m^2 (shoelace su proiezione locale). Ordine
// dei vertici irrilevante: si usa il valore assoluto.
export function polygonAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const refLat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const { toXY } = localProjector(refLat);
  const pts = ring.map(toXY);
  if (pts.length >= 2) {
    const [fx, fy] = pts[0];
    const [lx, ly] = pts[pts.length - 1];
    if (fx !== lx || fy !== ly) pts.push(pts[0]);
  }
  let area = 0;
  for (let i = 1; i < pts.length; i += 1) {
    area += pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1];
  }
  return Math.abs(area) / 2;
}

// ── bounding box ────────────────────────────────────────────────────────
export function bboxOfLine(line) {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lat, lng] of line || []) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

export function bboxExpandMeters(bbox, meters) {
  const dLat = meters / 111320;
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const dLng = meters / (111320 * Math.max(0.05, Math.cos(midLat * DEG2RAD)));
  return {
    minLat: bbox.minLat - dLat, maxLat: bbox.maxLat + dLat,
    minLng: bbox.minLng - dLng, maxLng: bbox.maxLng + dLng,
  };
}

export function bboxContainsPoint(bbox, [lat, lng]) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng;
}

// ── distanza punto → segmento / polilinea ──────────────────────────────
// Ritorna { distance, point, index, t } dove index e' l'indice del vertice
// iniziale del segmento piu' vicino e t∈[0,1] la posizione sul segmento.
export function pointToPolyline(p, line) {
  if (!Array.isArray(line) || line.length === 0) return null;
  if (line.length === 1) return { distance: haversineMeters(p, line[0]), point: line[0], index: 0, t: 0 };
  const { toXY, toLatLng } = localProjector(p[0]);
  const P = toXY(p);
  let best = null;
  for (let i = 1; i < line.length; i += 1) {
    const A = toXY(line[i - 1]);
    const B = toXY(line[i]);
    const abx = B[0] - A[0];
    const aby = B[1] - A[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((P[0] - A[0]) * abx + (P[1] - A[1]) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const proj = [A[0] + t * abx, A[1] + t * aby];
    const d = Math.hypot(P[0] - proj[0], P[1] - proj[1]);
    if (!best || d < best.distance) {
      best = { distance: d, point: toLatLng(proj), index: i - 1, t };
    }
  }
  return best;
}

export function pointToPolylineMeters(p, line) {
  const r = pointToPolyline(p, line);
  return r ? r.distance : Infinity;
}

// ── point-in-polygon (ray casting) su anello [lat,lng] ─────────────────
export function pointInRing(ring, [lat, lng]) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i]; // [lat, lng]
    const [yj, xj] = ring[j];
    // ray casting standard: incrocio in latitudine, confronto in longitudine
    const intersect = ((yi > lat) !== (yj > lat))
      && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Confine comune GeoJSON (Polygon/MultiPolygon, coords [lng,lat]) → test
// "punto dentro il comune" in [lat,lng]. Solo ring esterni (buchi ignorati:
// per lo Studio e' accettabile e conservativo).
export function pointInBoundary(boundaryGeoJson, latlng) {
  const g = boundaryGeoJson;
  if (!g || !Array.isArray(g.coordinates)) return true; // nessun confine → nessun vincolo
  const rings = g.type === 'Polygon'
    ? [g.coordinates[0]]
    : g.type === 'MultiPolygon'
      ? g.coordinates.map((poly) => poly[0])
      : [];
  return rings.some((r) => pointInRing((r || []).map(([lng, lat]) => [lat, lng]), latlng));
}

export function boundaryCentroid(boundaryGeoJson) {
  const g = boundaryGeoJson;
  if (!g || !Array.isArray(g.coordinates)) return null;
  let ring = null;
  if (g.type === 'Polygon') ring = g.coordinates[0];
  else if (g.type === 'MultiPolygon') {
    let bestArea = -1;
    for (const poly of g.coordinates) {
      const r = (poly[0] || []).map(([lng, lat]) => [lat, lng]);
      const a = polygonAreaM2(r);
      if (a > bestArea) { bestArea = a; ring = poly[0]; }
    }
  }
  if (!ring || ring.length < 3) return null;
  let latlng = ring.map(([lng, lat]) => [lat, lng]);
  // scarta il vertice di chiusura duplicato: falserebbe la media
  if (latlng.length > 3) {
    const [f, l] = [latlng[0], latlng[latlng.length - 1]];
    if (f[0] === l[0] && f[1] === l[1]) latlng = latlng.slice(0, -1);
  }
  let sumLat = 0, sumLng = 0;
  for (const [lat, lng] of latlng) { sumLat += lat; sumLng += lng; }
  const naive = [sumLat / latlng.length, sumLng / latlng.length];
  if (pointInRing(latlng, naive)) return naive;
  // point-on-surface: griglia deterministica 15x15 sul bbox
  const bb = bboxOfLine(latlng);
  const STEPS = 15;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i <= STEPS; i += 1) {
    for (let j = 0; j <= STEPS; j += 1) {
      const lat = bb.minLat + ((bb.maxLat - bb.minLat) * i) / STEPS;
      const lng = bb.minLng + ((bb.maxLng - bb.minLng) * j) / STEPS;
      if (!pointInRing(latlng, [lat, lng])) continue;
      const d = haversineMeters([lat, lng], naive);
      if (d < bestD) { bestD = d; best = [lat, lng]; }
    }
  }
  return best;
}

export function areaOfBoundaryM2(boundaryGeoJson) {
  const g = boundaryGeoJson;
  if (!g || !Array.isArray(g.coordinates)) return 0;
  const rings = g.type === 'Polygon'
    ? [g.coordinates[0]]
    : g.type === 'MultiPolygon'
      ? g.coordinates.map((poly) => poly[0])
      : [];
  return rings.reduce((s, r) => s + polygonAreaM2((r || []).map(([lng, lat]) => [lat, lng])), 0);
}

// ── spatial index a griglia uniforme (hit-test O(1) medio, NON O(N^2)) ──
// features: [{ id, lines: [[[lat,lng],...], ...] }]. Cella ~ 200 m.
export function buildSpatialIndex(features, cellMeters = 200) {
  const cells = new Map();
  const meta = new Map();
  let all = null;
  for (const f of features || []) {
    const lines = f.lines || [];
    let fbb = null;
    for (const line of lines) {
      const bb = bboxOfLine(line);
      fbb = fbb ? mergeBbox(fbb, bb) : bb;
    }
    if (!fbb) continue;
    meta.set(f.id, fbb);
    all = all ? mergeBbox(all, fbb) : { ...fbb };
    const [c0, c1] = cellRange(fbb, cellMeters);
    for (let cx = c0[0]; cx <= c1[0]; cx += 1) {
      for (let cy = c0[1]; cy <= c1[1]; cy += 1) {
        const key = `${cx}:${cy}`;
        let bucket = cells.get(key);
        if (!bucket) { bucket = new Set(); cells.set(key, bucket); }
        bucket.add(f.id);
      }
    }
  }
  return { cells, meta, cellMeters, all };
}

function mergeBbox(a, b) {
  return {
    minLat: Math.min(a.minLat, b.minLat), maxLat: Math.max(a.maxLat, b.maxLat),
    minLng: Math.min(a.minLng, b.minLng), maxLng: Math.max(a.maxLng, b.maxLng),
  };
}
function cellRange(bb, cellMeters) {
  const dLat = cellMeters / 111320;
  const midLat = (bb.minLat + bb.maxLat) / 2;
  const dLng = cellMeters / (111320 * Math.max(0.05, Math.cos(midLat * DEG2RAD)));
  return [
    [Math.floor(bb.minLat / dLat), Math.floor(bb.minLng / dLng)],
    [Math.floor(bb.maxLat / dLat), Math.floor(bb.maxLng / dLng)],
  ];
}

// Ritorna gli id dei feature candidati vicini a `p` entro `tolM` (superset
// stretto: da raffinare con pointToPolyline). Nessuna scansione globale.
export function queryIndexCandidates(index, p, tolM) {
  if (!index) return [];
  const probe = bboxExpandMeters({ minLat: p[0], maxLat: p[0], minLng: p[1], maxLng: p[1] }, tolM);
  const [c0, c1] = cellRange(probe, index.cellMeters);
  const out = new Set();
  for (let cx = c0[0]; cx <= c1[0]; cx += 1) {
    for (let cy = c0[1]; cy <= c1[1]; cy += 1) {
      const bucket = index.cells.get(`${cx}:${cy}`);
      if (bucket) for (const id of bucket) out.add(id);
    }
  }
  return [...out];
}

// ── HIT-TEST su un insieme di feature ─────────────────────────────────
// features: [{ id, operatorId, type, lines: [[[lat,lng],...]] }].
// Ritorna { featureId, lineIndex, segmentIndex, t, point, distance } o null.
// Con `index` (buildSpatialIndex) la ricerca e' locale; senza, scansione
// lineare semplice — comunque O(N) coi bbox, mai O(N^2).
export function hitTestFeatures(features, p, tolM, index = null) {
  const ids = index ? new Set(queryIndexCandidates(index, p, tolM)) : null;
  let best = null;
  for (const f of features || []) {
    if (ids && !ids.has(f.id)) continue;
    const lines = f.lines || [];
    for (let li = 0; li < lines.length; li += 1) {
      const bb = bboxExpandMeters(bboxOfLine(lines[li]), tolM);
      if (!bboxContainsPoint(bb, p)) continue;
      const r = pointToPolyline(p, lines[li]);
      if (r && r.distance <= tolM && (!best || r.distance < best.distance)) {
        best = { featureId: f.id, lineIndex: li, segmentIndex: r.index, t: r.t, point: r.point, distance: r.distance };
      }
    }
  }
  return best;
}

// ── EDITING VERTICI ──────────────────────────────────────────────────
export function moveVertex(line, vertexIndex, newLatLng) {
  if (!Array.isArray(line) || vertexIndex < 0 || vertexIndex >= line.length) return line;
  const next = line.slice();
  next[vertexIndex] = [newLatLng[0], newLatLng[1]];
  return next;
}

export function insertVertexOnSegment(line, segmentIndex, latlng) {
  if (!Array.isArray(line) || segmentIndex < 0 || segmentIndex >= line.length - 1) return line;
  const next = line.slice();
  next.splice(segmentIndex + 1, 0, [latlng[0], latlng[1]]);
  return next;
}

export function deleteVertex(line, vertexIndex) {
  if (!Array.isArray(line) || line.length <= 2) return line; // una polilinea resta valida con >= 2 punti
  if (vertexIndex < 0 || vertexIndex >= line.length) return line;
  const next = line.slice();
  next.splice(vertexIndex, 1);
  return next;
}

// ── SPLIT ────────────────────────────────────────────────────────────
// Divide una polilinea in due nel vertice indicato (il vertice appartiene a
// entrambe le meta'). Ritorna [a, b] oppure [line] se lo split e' agli estremi.
export function splitLineAtVertex(line, vertexIndex) {
  if (!Array.isArray(line) || vertexIndex <= 0 || vertexIndex >= line.length - 1) return [line];
  return [line.slice(0, vertexIndex + 1), line.slice(vertexIndex)];
}

// Divide nel punto di proiezione piu' vicino a `p`. Inserisce il punto di
// taglio come nuovo vertice condiviso. Ritorna [a, b] o [line].
export function splitLineAtPoint(line, p) {
  const hit = pointToPolyline(p, line);
  if (!hit) return [line];
  const { index, t, point } = hit;
  // taglio troppo vicino a un estremo → nessuno split utile
  if (index === 0 && t <= 1e-6) return [line];
  if (index === line.length - 2 && t >= 1 - 1e-6) return [line];
  const a = [...line.slice(0, index + 1), point];
  const b = [point, ...line.slice(index + 1)];
  if (a.length < 2 || b.length < 2) return [line];
  return [a, b];
}

// ── JOIN ─────────────────────────────────────────────────────────────
// Unisce due polilinee se un estremo di A e' entro `tolM` da un estremo di B.
// Prova tutte le 4 combinazioni testa/coda; ritorna la polilinea unita
// (senza duplicare il vertice di giunzione) oppure null se non contigue.
export function joinLines(lineA, lineB, tolM = 5) {
  if (!Array.isArray(lineA) || !Array.isArray(lineB) || lineA.length < 2 || lineB.length < 2) return null;
  const aStart = lineA[0];
  const aEnd = lineA[lineA.length - 1];
  const bStart = lineB[0];
  const bEnd = lineB[lineB.length - 1];
  const combos = [
    { d: haversineMeters(aEnd, bStart), build: () => [...lineA, ...lineB.slice(1)] },
    { d: haversineMeters(aEnd, bEnd), build: () => [...lineA, ...lineB.slice(0, -1).reverse()] },
    { d: haversineMeters(aStart, bEnd), build: () => [...lineB, ...lineA.slice(1)] },
    { d: haversineMeters(aStart, bStart), build: () => [...lineB.slice().reverse(), ...lineA.slice(1)] },
  ].sort((x, y) => x.d - y.d);
  if (combos[0].d > tolM) return null;
  return combos[0].build();
}

// ── SNAPPING ─────────────────────────────────────────────────────────
// snapTargets: array di polilinee [[lat,lng],...] (vie stradali o geometrie
// esistenti). Ritorna il punto agganciato piu' vicino entro `tolM`, oppure il
// punto originale se nessun target e' abbastanza vicino.
export function snapPoint(p, snapTargets, tolM) {
  if (!tolM || tolM <= 0 || !Array.isArray(snapTargets) || snapTargets.length === 0) return p;
  let best = null;
  for (const line of snapTargets) {
    if (!Array.isArray(line) || line.length < 2) continue;
    const bb = bboxExpandMeters(bboxOfLine(line), tolM);
    if (!bboxContainsPoint(bb, p)) continue;
    const r = pointToPolyline(p, line);
    if (r && r.distance <= tolM && (!best || r.distance < best.distance)) best = r;
  }
  return best ? best.point : p;
}

// ── ERASE PARZIALE (pennello circolare) ──────────────────────────────
// Rimuove da `line` la porzione entro `radiusM` da `center`. Ritorna i
// segmenti residui (0..N polilinee, ciascuna con >= 2 punti). Fuori dal
// cerchio → [line]. Interamente coperta → [].
export function brushEraseLine(line, center, radiusM) {
  if (!Array.isArray(line) || line.length < 2 || !center || !(radiusM > 0)) return [line];
  const inside = line.map((pt) => haversineMeters(pt, center) <= radiusM);
  if (inside.every((v) => !v)) return [line];
  if (inside.every((v) => v)) return [];

  // Raffina i punti di attraversamento sui segmenti che entrano/escono dal
  // cerchio (bisezione), cosi' il taglio segue il bordo del pennello.
  const crossing = (a, b) => {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k += 1) {
      const mid = (lo + hi) / 2;
      const pt = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid];
      if (haversineMeters(pt, center) <= radiusM) hi = mid; else lo = mid;
    }
    const t = (lo + hi) / 2;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  const residuals = [];
  let current = [];
  for (let i = 0; i < line.length; i += 1) {
    if (!inside[i]) {
      if (current.length === 0 && i > 0 && inside[i - 1]) {
        current.push(crossing(line[i], line[i - 1]));
      }
      current.push(line[i]);
    } else {
      if (current.length > 0 && i > 0 && !inside[i - 1]) {
        current.push(crossing(line[i - 1], line[i]));
        if (current.length >= 2) residuals.push(current);
        current = [];
      } else if (current.length > 0) {
        if (current.length >= 2) residuals.push(current);
        current = [];
      }
    }
  }
  if (current.length >= 2) residuals.push(current);
  return residuals.filter((seg) => seg.length >= 2 && polylineLengthMeters(seg) > 0.5);
}

// Chiude un anello poligonale (primo === ultimo) per il rendering / area.
export function closeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return ring;
  const [f, l] = [ring[0], ring[ring.length - 1]];
  return f[0] === l[0] && f[1] === l[1] ? ring : [...ring, f];
}

// Formattazione condivisa: metri → "1,2 km" / "340 m".
export function formatDistance(meters) {
  const m = Number(meters) || 0;
  if (m >= 1000) return `${(m / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} km`;
  return `${m.toLocaleString('it-IT', { maximumFractionDigits: 0 })} m`;
}
