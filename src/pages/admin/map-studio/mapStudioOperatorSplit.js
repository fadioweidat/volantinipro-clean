// Studio Mappa — assegnazione delle linee generate dall'automatico agli
// operatori.
//
// ISOLAMENTO ESPLICITO (decisione FASE 1 #2): NON importa
// src/lib/geo/operatorSplit.js. Lo Studio ha il suo modulo, cosi' il motore
// operativo GPS resta intatto e indipendente.
//
// FASE 1: `assignAllToOperator` — tutte le vie generate vanno all'operatore
// scelto (nessun bilanciamento intelligente). `splitWaysByOperatorSector` e'
// gia' presente ma NON usato dalla UI in FASE 1: e' l'aggancio per la FASE 2
// (divisione bilanciata / per settori), cosi' l'architettura e' pronta senza
// implementare ora l'ottimizzazione multi-worker.

// ways: [{ id?, geometry: [[lat,lng],...], lengthM? }]
export function assignAllToOperator(ways, operatorId) {
  const list = Array.isArray(ways) ? ways : [];
  return list.map((w) => ({
    operatorId,
    geometry: w.geometry,
    lengthM: Number(w.lengthM) || lengthOf(w.geometry),
    wayId: w.id ?? null,
  }));
}

function lengthOf(line) {
  if (!Array.isArray(line) || line.length < 2) return 0;
  const R = 6371008.8;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    const [la1, lo1] = line[i - 1];
    const [la2, lo2] = line[i];
    const dLat = (la2 - la1) * rad;
    const dLng = (lo2 - lo1) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  return total;
}

function bearingDeg(from, to) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const dLng = (to[1] - from[1]) * rad;
  const y = Math.sin(dLng) * Math.cos(to[0] * rad);
  const x = Math.cos(from[0] * rad) * Math.sin(to[0] * rad)
    - Math.sin(from[0] * rad) * Math.cos(to[0] * rad) * Math.cos(dLng);
  return (Math.atan2(y, x) * deg + 360) % 360;
}

// FASE 2 (predisposto, non cablato in UI): partizione angolare a settori
// contigui attorno all'origine, bilanciata per lunghezza. Deterministica.
// operatorIds: array di N id operatore. Ritorna assegnazioni { operatorId,
// geometry, lengthM, wayId }.
export function splitWaysByOperatorSector(ways, operatorIds, origin) {
  const ids = Array.isArray(operatorIds) ? operatorIds.filter(Boolean) : [];
  const list = Array.isArray(ways) ? ways : [];
  if (ids.length <= 1 || !origin || list.length === 0) {
    return assignAllToOperator(list, ids[0] || null);
  }
  const withBearing = list.map((w) => ({
    w,
    lengthM: Number(w.lengthM) || lengthOf(w.geometry),
    bearing: bearingDeg(origin, nearestVertex(w.geometry, origin)),
  }));
  withBearing.sort((a, b) => (a.bearing - b.bearing) || String(a.w.id).localeCompare(String(b.w.id)));
  const total = withBearing.reduce((s, x) => s + x.lengthM, 0);
  const target = total / ids.length;
  const out = [];
  let cumulative = 0;
  for (const { w, lengthM } of withBearing) {
    let idx = target > 0 ? Math.floor(cumulative / target) : 0;
    if (idx >= ids.length) idx = ids.length - 1;
    out.push({ operatorId: ids[idx], geometry: w.geometry, lengthM, wayId: w.id ?? null });
    cumulative += lengthM;
  }
  return out;
}

function nearestVertex(line, origin) {
  let best = line[0] || origin;
  let bestD = Infinity;
  for (const p of line || []) {
    const d = (p[0] - origin[0]) ** 2 + (p[1] - origin[1]) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
