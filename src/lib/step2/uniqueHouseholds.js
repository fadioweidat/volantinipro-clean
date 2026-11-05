// FAMIGLIE UNICHE MULTI-PUNTO VENDITA (2026-11-04).
//
// Modulo PURO (nessun React, nessuna rete). Calcola le famiglie (e le persone)
// UNICHE di una campagna con piu' punti vendita (PV), senza mai presentare la
// somma dei PV come famiglie uniche quando i territori si sovrappongono.
//
// Metodologia: la STESSA del backend (get_nil_breakdown_in_radius /
// get_comuni_breakdown_in_radius in analysis-istat). Le famiglie di un
// territorio (NIL o comune) dentro un raggio sono
//     famiglie_totali(territorio) x area(territorio ∩ cerchio) / area(territorio)
// cioe' una ripartizione proporzionale all'area DENTRO il singolo territorio.
// Le famiglie uniche dell'unione dei raggi seguono la stessa regola:
//     famiglie_totali x area(territorio ∩ (cerchio1 ∪ cerchio2 ...)) / area(territorio)
// Nessuna distribuzione nuova: il calcolo riusa i valori del backend di ogni
// singolo raggio e stima soltanto la parte contata due volte (inclusione-
// esclusione), e solo dopo aver verificato che la geometria disponibile nel
// client riproduce i valori del backend per ciascun raggio.
//
// Casi esatti (nessuna stima geometrica):
//  - PV disgiunti (cerchi lontani, o nessun territorio in comune): somma;
//  - stesso territorio in un solo PV: il valore di quel PV;
//  - territorio coperto per intero da almeno un PV: famiglie del territorio;
//  - raggi identici o un raggio contenuto in un altro: il raggio piu' grande.
// Caso stimato (stessa metodologia, verificata): raggi parzialmente
// sovrapposti dentro lo stesso territorio.
// Altrimenti: stato esplicito "non determinabile", senza numero.

export const UNIQUE_HOUSEHOLDS_STATUS = Object.freeze({
  SINGLE: "single_zone",
  DISJOINT: "disjoint",
  DEDUPLICATED: "deduplicated",
  NOT_DETERMINABLE: "not_determinable",
});

export const UNIQUE_HOUSEHOLDS_NOT_DETERMINABLE_LABEL = "Famiglie uniche non determinabili";

// Tolleranza della verifica geometrica: la quota di territorio dentro ciascun
// raggio calcolata nel client deve coincidere con quella del backend entro 1
// punto percentuale (il backend arrotonda pct_copertura a 2 decimali con
// minimo 1% e usa la geometria non semplificata).
export const GEOMETRY_RATIO_TOLERANCE = 0.01;
// ST_Buffer di PostGIS con quad_segs = 8 (default): 32 lati.
export const BACKEND_BUFFER_SEGMENTS = 32;
const EPS_KM = 0.001;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*\([A-Z]{2}\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

function haversineKm(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function zoneRadiusKm(zone) {
  return finite(zone?.radiusKm) ?? finite(zone?.radius) ?? 0;
}

function zoneCircle(zone) {
  if (zone?.searchMode !== "address" || !(zoneRadiusKm(zone) > 0)) return null;
  const snap = zone?.kpiSnapshot?.center;
  const sp = zone?.selectedSearchPoint;
  const c = snap && finite(snap.lat) !== null && finite(snap.lng) !== null ? snap
    : sp && finite(sp.lat) !== null && finite(sp.lng) !== null ? sp : null;
  return c ? { lat: Number(c.lat), lng: Number(c.lng), rKm: zoneRadiusKm(zone) } : null;
}

function isNilManual(zone) {
  return Boolean(zone?.nilManualMode) || zone?.kpiSnapshot?.areaMode === "custom_zone";
}

/** Righe territoriali del PV (in modalita' NIL solo quelle scelte). */
function zoneRows(zone) {
  const rows = Array.isArray(zone?.allocation) ? zone.allocation : Array.isArray(zone?.zonesAllocation) ? zone.zonesAllocation : [];
  if (isNilManual(zone) && Array.isArray(zone?.selected) && zone.selected.length) {
    const sel = new Set(zone.selected);
    return rows.filter(r => sel.has(r?.id));
  }
  return rows;
}

const MILANO_CODE = "015146";

function rowUnit(row, zone) {
  const nilCode = row?.nilCode ?? row?.nil_code ?? null;
  const isNil = Boolean(row?.isNil || row?.territory_type === "nil" || (nilCode !== null && nilCode !== ""));
  const isCap = zone?.searchMode === "cap";
  const name = typeof row?.name === "string" ? row.name : row?.name?.label || row?.name?.name || "";
  let key;
  let level;
  if (isCap) {
    level = "cap";
    key = `cap:${normalizeKey(row?.cap ?? row?.id ?? name)}`;
  } else if (isNil) {
    level = "nil";
    key = `nil:${normalizeKey(nilCode !== null && nilCode !== "" ? nilCode : name)}`;
  } else {
    level = "comune";
    const code = row?.municipality_code ?? row?.municipalityCode ?? null;
    const nameKey = normalizeKey(name);
    key = code ? `mun:${String(code)}` : `mun:${nameKey}`;
    if (String(code || "") === MILANO_CODE || nameKey === "milano") key = `mun:${MILANO_CODE}`;
  }
  return {
    key,
    level,
    name: name || key,
    families: finite(row?.families),
    familiesTotal: finite(row?.familiesTotal),
    population: finite(row?.population),
    populationTotal: finite(row?.populationTotal),
    geometry: row?.geometry || row?.polygon_geojson || row?.geometry_geojson || null,
  };
}

function zoneInfo(zone, index) {
  const rows = zoneRows(zone).map(r => rowUnit(r, zone));
  return {
    id: zone?.id ?? `zone_${index}`,
    index,
    zone,
    circle: zoneCircle(zone),
    isCap: zone?.searchMode === "cap",
    rows,
    keys: new Set(rows.map(r => r.key)),
    families: finite(zone?.kpiSnapshot?.families),
    population: finite(zone?.kpiSnapshot?.population),
  };
}

function hasMilanoComune(info) { return info.keys.has(`mun:${MILANO_CODE}`); }
function hasNil(info) { return info.rows.some(r => r.level === "nil"); }

/**
 * I due PV possono condividere famiglie? false SOLO quando la separazione e'
 * certa: cerchi disgiunti, oppure territori (NIL/comuni/CAP, che non si
 * sovrappongono tra loro) tutti diversi e confrontabili.
 */
function mayShareHouseholds(a, b) {
  if (a.circle && b.circle) {
    const d = haversineKm(a.circle, b.circle);
    if (d >= a.circle.rKm + b.circle.rKm - EPS_KM) return false;
  }
  if (!a.rows.length || !b.rows.length) return true;
  if (a.isCap !== b.isCap) return true; // CAP e comuni/NIL non sono confrontabili
  if ((hasMilanoComune(a) && hasNil(b)) || (hasMilanoComune(b) && hasNil(a))) return true;
  for (const k of a.keys) if (b.keys.has(k)) return true;
  return false;
}

// ------------------------------------------------------------ geometria
function parseGeometry(raw) {
  let g = raw;
  if (typeof g === "string") {
    try { g = JSON.parse(g); } catch { return null; }
  }
  if (g?.type === "Feature") g = g.geometry;
  if (g?.type === "Polygon" && Array.isArray(g.coordinates)) return [g.coordinates];
  if (g?.type === "MultiPolygon" && Array.isArray(g.coordinates)) return g.coordinates;
  return null;
}

// Metri per grado alla latitudine locale (ellissoide WGS84, serie standard):
// a 45,5° un grado di latitudine vale ~111.143 m, non i 110.540 dell'equatore.
function projector(lat0, lng0) {
  const phi = (lat0 * Math.PI) / 180;
  const ky = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const kx = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  return (lng, lat) => [(lng - lng0) * kx, (lat - lat0) * ky];
}

/**
 * Quote di territorio dentro ciascun cerchio e dentro la loro unione.
 * Scansione orizzontale: per ogni riga (passo <= 5 m) gli intervalli interni
 * al poligono (pari/dispari, buchi compresi) sono intersecati in modo esatto
 * con le corde dei cerchi. Restituisce null se la geometria non e' usabile.
 */
export function territoryCircleCoverage(geometry, circles) {
  const polys = parseGeometry(geometry);
  if (!polys || !polys.length || !circles.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const poly of polys) for (const ring of poly || []) for (const p of ring || []) {
    const lng = Number(p?.[0]); const lat = Number(p?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
  }
  if (!Number.isFinite(minLat)) return null;
  const lat0 = (minLat + maxLat) / 2;
  const lng0 = (minLng + maxLng) / 2;
  const proj = projector(lat0, lng0);
  const edges = [];
  let area = 0;
  for (const poly of polys) {
    (poly || []).forEach((ring, ri) => {
      const pts = (ring || []).map(p => proj(Number(p[0]), Number(p[1])));
      if (pts.length < 3) return;
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        s += a[0] * b[1] - b[0] * a[1];
        if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1]] : [b[0], b[1], a[0], a[1]]);
      }
      area += (ri === 0 ? 1 : -1) * Math.abs(s / 2);
    });
  }
  if (!(area > 0) || !edges.length) return null;
  // Il "cerchio" del backend e' ST_Buffer(geography, r): poligono regolare di
  // BACKEND_BUFFER_SEGMENTS lati inscritto nel cerchio (quad_segs = 8 di
  // PostGIS). Si usa la stessa forma, non il cerchio ideale.
  const cs = circles.map(c => {
    const [x, y] = proj(c.lng, c.lat);
    const r = c.rKm * 1000;
    const pts = [];
    for (let k = 0; k < BACKEND_BUFFER_SEGMENTS; k++) {
      const t = (2 * Math.PI * k) / BACKEND_BUFFER_SEGMENTS;
      pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]);
    }
    return { x, y, r, pts };
  });
  let yMin = Infinity, yMax = -Infinity;
  for (const e of edges) { if (e[1] < yMin) yMin = e[1]; if (e[3] > yMax) yMax = e[3]; }
  const cyMin = Math.min(...cs.map(c => c.y - c.r));
  const cyMax = Math.max(...cs.map(c => c.y + c.r));
  const y0 = Math.max(yMin, cyMin);
  const y1 = Math.min(yMax, cyMax);
  const inside = cs.map(() => 0);
  let union = 0;
  if (y1 > y0) {
    const steps = Math.min(20000, Math.max(200, Math.ceil((y1 - y0) / 5)));
    const dy = (y1 - y0) / steps;
    for (let j = 0; j < steps; j++) {
      const y = y0 + (j + 0.5) * dy;
      const xs = [];
      for (const e of edges) {
        if (y >= e[1] && y < e[3]) xs.push(e[0] + ((y - e[1]) / (e[3] - e[1])) * (e[2] - e[0]));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      const chords = [];
      for (const c of cs) {
        // poligono convesso: alla quota y l'interno e' un solo intervallo
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < c.pts.length; k++) {
          const p = c.pts[k];
          const q = c.pts[(k + 1) % c.pts.length];
          if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
            const x = p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]);
            if (x < lo) lo = x;
            if (x > hi) hi = x;
          }
        }
        chords.push(hi > lo ? [lo, hi] : null);
      }
      // unione delle corde
      const merged = chords.filter(Boolean).sort((p, q) => p[0] - q[0]).reduce((acc, ch) => {
        const last = acc[acc.length - 1];
        if (last && ch[0] <= last[1]) last[1] = Math.max(last[1], ch[1]);
        else acc.push([ch[0], ch[1]]);
        return acc;
      }, []);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = xs[k];
        const b = xs[k + 1];
        chords.forEach((ch, i) => {
          if (!ch) return;
          const len = Math.min(b, ch[1]) - Math.max(a, ch[0]);
          if (len > 0) inside[i] += len * dy;
        });
        for (const m of merged) {
          const len = Math.min(b, m[1]) - Math.max(a, m[0]);
          if (len > 0) union += len * dy;
        }
      }
    }
  }
  return { area, ratios: inside.map(v => v / area), unionRatio: union / area };
}

// ------------------------------------------------------------ calcolo
function metricFields(metric) {
  return metric === "population"
    ? { value: "population", total: "populationTotal", zone: "population" }
    : { value: "families", total: "familiesTotal", zone: "families" };
}

function zoneRowsConsistent(info, metric) {
  const f = metricFields(metric);
  if (!info.rows.length || info[f.zone] === null) return false;
  if (info.rows.some(r => r[f.value] === null)) return false;
  const sum = info.rows.reduce((a, r) => a + r[f.value], 0);
  return Math.abs(sum - info[f.zone]) <= Math.max(2, info.rows.length);
}

// Territorio coperto per intero SOLO se il valore del backend per il PV
// raggiunge il totale del territorio (tolleranza 1 per l'arrotondamento).
// Mai da una percentuale di copertura: nello Step 2 il campo "coverage" della
// riga del PV attivo puo' essere la copertura dell'allocazione, non la quota
// di territorio nel raggio (verificato a runtime il 2026-11-04).
function isFullContribution(c, f) {
  const total = c.row[f.total];
  return total !== null && total > 0 && c.row[f.value] >= total - 1;
}

/** Famiglie (o persone) uniche di un territorio coperto da piu' PV. */
function uniqueForUnit(contribs, metric, reasons, details) {
  const f = metricFields(metric);
  const values = contribs.map(c => c.row[f.value]);
  const summed = values.reduce((a, v) => a + v, 0);
  const name = contribs[0].row.name;
  if (contribs.length === 1) return values[0];
  const full = contribs.filter(c => isFullContribution(c, f));
  if (full.length) {
    const v = Math.max(...full.map(c => c.row[f.value]));
    details.push({ unit: name, method: "territorio_intero", summed, unique: v });
    return v;
  }
  if (contribs.some(c => !c.circle)) {
    reasons.push({ code: "partial_without_shape", unit: name });
    return null;
  }
  // cerchi identici o contenuti: conta solo il contenitore
  const kept = [];
  const sorted = [...contribs].sort((a, b) => b.circle.rKm - a.circle.rKm);
  for (const c of sorted) {
    const container = kept.find(k => haversineKm(k.circle, c.circle) + c.circle.rKm <= k.circle.rKm + EPS_KM);
    if (!container) kept.push(c);
  }
  if (kept.length === 1) {
    const v = Math.max(...contribs.map(c => c.row[f.value]));
    details.push({ unit: name, method: "raggio_contenuto", summed, unique: v });
    return v;
  }
  let disjoint = true;
  for (let i = 0; i < kept.length && disjoint; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      if (haversineKm(kept[i].circle, kept[j].circle) < kept[i].circle.rKm + kept[j].circle.rKm - EPS_KM) { disjoint = false; break; }
    }
  }
  if (disjoint) {
    const v = kept.reduce((a, c) => a + c.row[f.value], 0);
    details.push({ unit: name, method: "raggi_disgiunti_nel_territorio", summed, unique: v });
    return v;
  }
  // Sovrapposizione parziale: stima con la metodologia del backend, verificata.
  const total = kept.map(c => c.row[f.total]).find(t => t !== null && t > 0) ?? null;
  const geometry = kept.map(c => c.row.geometry).find(Boolean) || null;
  if (total === null) { reasons.push({ code: "territory_total_missing", unit: name }); return null; }
  if (!geometry) { reasons.push({ code: "territory_geometry_missing", unit: name }); return null; }
  const cov = territoryCircleCoverage(geometry, kept.map(c => c.circle));
  if (!cov) { reasons.push({ code: "territory_geometry_invalid", unit: name }); return null; }
  let maxDeviation = 0;
  for (let i = 0; i < kept.length; i++) {
    const backendRatio = kept[i].row[f.value] / total;
    maxDeviation = Math.max(maxDeviation, Math.abs(cov.ratios[i] - backendRatio));
  }
  if (maxDeviation > GEOMETRY_RATIO_TOLERANCE) {
    reasons.push({ code: "geometry_verification_failed", unit: name, deviation: Math.round(maxDeviation * 10000) / 10000 });
    return null;
  }
  const keptSum = kept.reduce((a, c) => a + c.row[f.value], 0);
  const doubleCountedRatio = Math.max(0, cov.ratios.reduce((a, r) => a + r, 0) - cov.unionRatio);
  const lower = Math.max(...kept.map(c => c.row[f.value]));
  const v = Math.round(Math.min(keptSum, Math.max(lower, keptSum - total * doubleCountedRatio)));
  details.push({ unit: name, method: "stima_area_verificata", summed, unique: v, deviation: Math.round(maxDeviation * 10000) / 10000 });
  return v;
}

function computeComponent(infos, metric, reasons, details) {
  const f = metricFields(metric);
  for (const info of infos) {
    if (!zoneRowsConsistent(info, metric)) {
      reasons.push({ code: info.rows.length && info.rows.some(r => r[f.value] === null) ? "zone_rows_without_households" : "zone_rows_inconsistent", zoneId: info.id });
      return null;
    }
  }
  if (infos.some(i => i.isCap) && !infos.every(i => i.isCap)) {
    reasons.push({ code: "cap_mixed_with_territories" });
    return null;
  }
  const units = new Map();
  for (const info of infos) {
    for (const row of info.rows) {
      if (!units.has(row.key)) units.set(row.key, []);
      units.get(row.key).push({ zoneId: info.id, row, circle: info.circle });
    }
  }
  // Milano come comune in un PV e come NIL in un altro: livelli diversi.
  const milano = units.get(`mun:${MILANO_CODE}`);
  const nilKeys = [...units.keys()].filter(k => k.startsWith("nil:"));
  if (milano && nilKeys.length) {
    const fullMilano = milano.filter(c => isFullContribution(c, f));
    if (!fullMilano.length) {
      reasons.push({ code: "milano_cross_level_partial", unit: "Milano" });
      return null;
    }
    const nilSummed = nilKeys.reduce((a, k) => a + units.get(k).reduce((s, c) => s + c.row[f.value], 0), 0);
    const v = Math.max(...fullMilano.map(c => c.row[f.value]));
    details.push({ unit: "Milano", method: "territorio_intero", summed: nilSummed + milano.reduce((s, c) => s + c.row[f.value], 0), unique: v });
    for (const k of nilKeys) units.delete(k);
    units.set(`mun:${MILANO_CODE}`, fullMilano.slice(0, 1));
  }
  let total = 0;
  for (const contribs of units.values()) {
    // un PV conta un territorio una sola volta
    const byZone = new Map();
    for (const c of contribs) if (!byZone.has(c.zoneId)) byZone.set(c.zoneId, c);
    const v = uniqueForUnit([...byZone.values()], metric, reasons, details);
    if (v === null) return null;
    total += v;
  }
  return total;
}

function components(infos) {
  const parent = infos.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const overlappingPairs = [];
  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      if (mayShareHouseholds(infos[i], infos[j])) {
        overlappingPairs.push([infos[i].id, infos[j].id]);
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map();
  infos.forEach((info, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(info);
  });
  return { groups: [...groups.values()], overlappingPairs };
}

function computeMetric(infos, groups, metric) {
  const f = metricFields(metric);
  const reasons = [];
  const details = [];
  const zoneValues = infos.map(i => i[f.zone]);
  const summed = zoneValues.some(v => v === null) ? null : zoneValues.reduce((a, v) => a + v, 0);
  let unique = 0;
  let lowerBound = 0;
  let determinable = true;
  for (const group of groups) {
    if (group.some(i => i[f.zone] === null)) {
      reasons.push({ code: "zone_total_missing" });
      determinable = false;
      lowerBound = null;
      continue;
    }
    if (lowerBound !== null) lowerBound += Math.max(...group.map(i => i[f.zone]));
    if (group.length === 1) { unique += group[0][f.zone]; continue; }
    const v = computeComponent(group, metric, reasons, details);
    if (v === null) { determinable = false; continue; }
    unique += v;
  }
  return {
    unique: determinable ? Math.round(unique) : null,
    summed,
    lowerBound: determinable ? Math.round(unique) : lowerBound,
    upperBound: summed,
    reasons,
    details,
    estimated: details.some(d => d.method === "stima_area_verificata"),
  };
}

/**
 * Famiglie e persone uniche dei PV. Restituisce:
 *  status: single_zone | disjoint | deduplicated | not_determinable
 *  uniqueFamilies / uniquePopulation: numero, oppure null se non determinabile
 *  summedFamilies / summedPopulation: somma dei PV (fabbisogno, MAI famiglie uniche)
 *  lowerBound / upperBound: limiti certi delle famiglie uniche
 *  method: "somma_disgiunta" | "metodologia_area_backend" | null
 *  estimated: true se una sovrapposizione parziale e' stata stimata per area
 *  reasons: perche' non e' determinabile; details: territori deduplicati
 */
export function computeCampaignUniqueHouseholds(campaignZones) {
  const raw = Array.isArray(campaignZones) ? campaignZones.filter(Boolean) : [];
  const infos = raw.map(zoneInfo);
  const { groups, overlappingPairs } = components(infos);
  const families = computeMetric(infos, groups, "families");
  const population = computeMetric(infos, groups, "population");
  const hasSharedGroup = groups.some(g => g.length > 1);
  const status = infos.length <= 1 ? UNIQUE_HOUSEHOLDS_STATUS.SINGLE
    : families.unique === null ? UNIQUE_HOUSEHOLDS_STATUS.NOT_DETERMINABLE
    : hasSharedGroup ? UNIQUE_HOUSEHOLDS_STATUS.DEDUPLICATED
    : UNIQUE_HOUSEHOLDS_STATUS.DISJOINT;
  return {
    status,
    determinable: families.unique !== null,
    uniqueFamilies: families.unique,
    uniquePopulation: population.unique,
    summedFamilies: families.summed,
    summedPopulation: population.summed,
    lowerBound: families.lowerBound,
    upperBound: families.upperBound,
    method: families.unique === null ? null : hasSharedGroup ? "metodologia_area_backend" : "somma_disgiunta",
    estimated: families.estimated,
    overlappingPairs,
    reasons: families.reasons,
    details: families.details,
    populationReasons: population.reasons,
  };
}

/** Testo per l'utente: numero formattato oppure lo stato esplicito. */
export function describeUniqueHouseholds(result, formatNumber = n => String(n)) {
  if (!result) return null;
  if (result.uniqueFamilies === null) return UNIQUE_HOUSEHOLDS_NOT_DETERMINABLE_LABEL;
  return formatNumber(result.uniqueFamilies);
}
