// Piano territoriale multi-PV, senza chiamate di rete e senza scritture DB.
// La griglia metrica (45 m) stima l'intersezione tra poligoni ISTAT/NIL e
// l'unione dei raggi. Ogni cella appartiene al SOLO PV piu' vicino fra quelli
// il cui raggio la contiene. I risultati sono STIME, non conteggi di civici.
import { calculateDistributionZonePrice, classifyTerritory, roundMoney } from '../pricing/distributionPricing.js';

const METRES_PER_LAT = 111195;
const METRES_PER_LNG = METRES_PER_LAT * Math.cos(45.5 * Math.PI / 180);
const CELL_M = 45;
const xOf = lon => Number(lon) * METRES_PER_LNG;
const yOf = lat => Number(lat) * METRES_PER_LAT;
const valid = n => Number.isFinite(Number(n)) && Number(n) > 0;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function geom(value) {
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    const shape = raw?.type === 'Feature' ? raw.geometry : raw;
    if (shape?.type === 'Polygon') return [shape.coordinates];
    if (shape?.type === 'MultiPolygon') return shape.coordinates;
  } catch { /* invalid GIS data must fail closed */ }
  return null;
}

function projectPolygon(polygons) {
  const projected = polygons.map(p => p.map(ring => ring.map(pair => [xOf(pair[0]), yOf(pair[1])])));
  const points = projected.flat(2).filter(p => p.length === 2 && p.every(Number.isFinite));
  if (!points.length) return null;
  const bbox = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  return { polygons: projected, bbox };
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function inPolygon(x, y, polygons) {
  return polygons.some(rings => rings[0]?.length >= 3 && inRing(x, y, rings[0]) && !rings.slice(1).some(hole => inRing(x, y, hole)));
}

function ringArea(ring) {
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(twice) / 2;
}

function polygonArea(polygons) {
  return polygons.reduce((total, rings) => total + Math.max(0, ringArea(rings[0] || []) - rings.slice(1).reduce((a, ring) => a + ringArea(ring), 0)), 0);
}

function keyOf(row) {
  const nil = row.nilCode || row.nil_code;
  if (nil) return `nil:${norm(nil)}`;
  const code = row.municipality_code || row.comune_code || row.istat_code;
  if (code) return `comune:${norm(code)}`;
  return row.isNil ? `nil-name:${norm(row.name)}` : `comune-name:${norm(row.name)}`;
}

function municipalityOf(row) {
  return row.isNil || row.nilCode || row.nil_code
    ? String(row.parent_municipality || 'Milano').trim()
    : String(row.name || '').trim();
}

// The largest-remainder method preserves each PV's exact quantity, including
// low quantities and equal shares, without inventing a campaign-wide discount.
export function splitIntegerProportionally(quantity, weights) {
  const total = weights.reduce((n, weight) => n + Math.max(0, weight), 0);
  if (!total || !Number.isInteger(quantity) || quantity < 0) return null;
  const raw = weights.map(weight => quantity * Math.max(0, weight) / total);
  const result = raw.map(Math.floor);
  let remaining = quantity - result.reduce((a, b) => a + b, 0);
  const order = raw.map((n, i) => ({ i, rem: n - result[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let i = 0; i < remaining; i++) result[order[i].i]++;
  return result;
}

export function buildMultiPvTerritoryPlan(summary, manualOwners = {}, options = {}) {
  const pvs = summary?.zones || [];
  if (pvs.length < 2) return { ready: false, issues: ['Servono almeno due PV.'] };
  const issues = [];
  const centers = pvs.map(pv => {
    const isRadius = pv.searchMode === 'address';
    if ((isRadius && !valid(pv.radiusKm)) || !Number.isFinite(pv.center?.lat) || !Number.isFinite(pv.center?.lng)) {
      issues.push(`${pv.name}: centro o raggio non valido; l'unione necessita di geometrie verificabili.`);
      return null;
    }
    return { id: pv.id, x: xOf(pv.center.lng), y: yOf(pv.center.lat), r2: isRadius ? (pv.radiusKm * 1000) ** 2 : null,
      fullUnits: isRadius ? null : new Set((pv.allocation || []).map(keyOf)) };
  });
  const units = new Map();
  for (const pv of pvs) {
    if (!pv.allocation?.length) issues.push(`${pv.name}: dettagli territoriali assenti.`);
    for (const row of pv.allocation || []) {
      const key = keyOf(row);
      if (!key || key.endsWith(':')) continue;
      if (units.has(key)) continue;
      const geometry = geom(row.geometry || row.geometry_geojson || row.polygon_geojson);
      if (!geometry || !valid(row.familiesTotal)) {
        issues.push(`${municipalityOf(row)} / ${row.name}: servono geometria e famiglie totali affidabili.`);
        continue;
      }
      const projected = projectPolygon(geometry);
      if (!projected || polygonArea(projected.polygons) <= 0) {
        issues.push(`${row.name}: geometria non valida.`);
        continue;
      }
      units.set(key, { key, row, ...projected, area: polygonArea(projected.polygons), familiesTotal: Number(row.familiesTotal), municipality: municipalityOf(row) });
    }
  }
  if ([...units.keys()].some(key => key.startsWith('nil:') || key.startsWith('nil-name:'))
    && [...units.values()].some(unit => !unit.row.isNil && !unit.row.nilCode && norm(unit.municipality) === 'milano')) {
    issues.push('Milano intera e NIL presenti insieme: i due livelli geografici si sovrappongono. Separare o verificare prima del preventivo.');
  }
  if (issues.length || units.size === 0) return { ready: false, issues: [...new Set(issues)], totalFamilies: null, rows: [] };

  const step = Number(options.cellMeters) > 0 ? Number(options.cellMeters) : CELL_M;
  const pvFamiliesByUnit = new Map(pvs.map(pv => [pv.id, new Map()]));
  const ownershipChoices = [];
  let totalFamilies = 0;
  let overlapCells = 0;
  const cellsByOwner = new Map(pvs.map(pv => [pv.id, 0]));

  for (const unit of units.values()) {
    const candidatePVs = centers.filter(c => c && (c.fullUnits?.has(unit.key) || c.r2 !== null && c.x + Math.sqrt(c.r2) >= unit.bbox[0] && c.x - Math.sqrt(c.r2) <= unit.bbox[2] && c.y + Math.sqrt(c.r2) >= unit.bbox[1] && c.y - Math.sqrt(c.r2) <= unit.bbox[3]));
    if (!candidatePVs.length) continue;
    const counts = new Map();
    const participants = new Set();
    let totalCells = 0;
    for (let ix = Math.floor(unit.bbox[0] / step); ix <= Math.ceil(unit.bbox[2] / step); ix++) {
      const x = (ix + 0.5) * step;
      for (let iy = Math.floor(unit.bbox[1] / step); iy <= Math.ceil(unit.bbox[3] / step); iy++) {
        const y = (iy + 0.5) * step;
        const eligible = candidatePVs.map(c => ({ c, d2: (x - c.x) ** 2 + (y - c.y) ** 2 })).filter(v => v.c.fullUnits?.has(unit.key) || v.d2 <= v.c.r2);
        if (!eligible.length || !inPolygon(x, y, unit.polygons)) continue;
        totalCells++;
        if (eligible.length > 1) {
          overlapCells++;
          eligible.forEach(v => participants.add(v.c.id));
        }
        eligible.sort((a, b) => a.d2 - b.d2 || String(a.c.id).localeCompare(String(b.c.id)));
        const chosen = eligible.find(v => v.c.id === manualOwners[unit.key]) || eligible[0];
        counts.set(chosen.c.id, (counts.get(chosen.c.id) || 0) + 1);
        cellsByOwner.set(chosen.c.id, cellsByOwner.get(chosen.c.id) + 1);
      }
    }
    if (!totalCells) continue;
    const unitFamilies = Math.min(unit.familiesTotal, unit.familiesTotal * totalCells * step ** 2 / unit.area);
    const owners = [...counts.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    const rounded = splitIntegerProportionally(Math.round(unitFamilies), owners.map(id => counts.get(id)));
    owners.forEach((id, i) => pvFamiliesByUnit.get(id).set(unit.key, rounded[i]));
    totalFamilies += rounded.reduce((a, b) => a + b, 0);
    if (participants.size > 1) ownershipChoices.push({ key: unit.key, name: unit.row.name, municipality: unit.municipality, eligiblePvIds: [...participants].sort(), preferredPvId: participants.has(manualOwners[unit.key]) ? manualOwners[unit.key] : null });
  }

  const rows = pvs.map(pv => {
    const perComune = new Map();
    for (const [key, count] of pvFamiliesByUnit.get(pv.id)) {
      if (!count) continue;
      const unit = units.get(key);
      const comuneKey = norm(unit.municipality);
      if (!perComune.has(comuneKey)) perComune.set(comuneKey, { name: unit.municipality, families: 0, density: null });
      const target = perComune.get(comuneKey);
      target.families += count;
      if (valid(unit.row.densita)) target.density = Number(unit.row.densita);
    }
    const comuni = [...perComune.values()].sort((a, b) => a.name.localeCompare(b.name));
    const splits = splitIntegerProportionally(pv.quantity, comuni.map(c => c.families));
    const municipalities = splits ? comuni.map((c, i) => {
      const classified = classifyTerritory({ name: c.name, densityPerKm2: c.density ?? undefined });
      if (classified.confidence === 'low') issues.push(`${c.name}: fascia commerciale non verificabile, manca la densita del comune.`);
      return { ...c, quantity: splits[i], tier: classified.tier, confidence: classified.confidence,
        price: splits[i] ? calculateDistributionZonePrice(classified.tier, splits[i]) : 0 };
    }) : [];
    const families = comuni.reduce((n, c) => n + c.families, 0);
    return { id: pv.id, name: pv.name, label: pv.label, quantity: pv.quantity, families,
      municipalities, distributionPrice: splits ? roundMoney(municipalities.reduce((n, c) => n + c.price, 0)) : null,
      capacityWarning: families < pv.quantity ? `${pv.name}: ${pv.quantity.toLocaleString('it-IT')} volantini richiesti ma solo ${families.toLocaleString('it-IT')} famiglie uniche assegnate. Riduci i volantini o amplia la zona.` : null };
  });
  if (rows.some(r => r.distributionPrice === null)) issues.push('Almeno un PV non ha famiglie assegnate: prezzo non calcolabile senza inventare una ripartizione.');
  const calculatedTotal = rows.reduce((n, r) => n + r.families, 0);
  if (calculatedTotal !== totalFamilies) issues.push('Errore di riconciliazione nel conteggio delle famiglie.');
  return {
    ready: issues.length === 0,
    issues,
    method: `Unione raster ${step} m, densita uniforme per poligono ISTAT/NIL: stima, non numero esatto di civici`,
    totalFamilies: issues.length ? null : totalFamilies,
    overlapCells,
    capacityWarnings: rows.map(r => r.capacityWarning).filter(Boolean),
    ownershipChoices,
    rows,
    distributionZones: rows.flatMap(r => r.municipalities.filter(c => c.quantity > 0).map(c => ({ territory: c.tier, quantity: c.quantity }))),
    distributionTotal: roundMoney(rows.reduce((n, r) => n + (r.distributionPrice || 0), 0)),
    assignedCellCounts: Object.fromEntries(cellsByOwner),
  };
}
