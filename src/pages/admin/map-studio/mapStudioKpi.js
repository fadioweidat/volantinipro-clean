// Studio Mappa — KPI professionali.
//
// REGOLA FERMA (richiesta esplicita): "RETE %" e "AREA %" sono SEMPRE due
// KPI distinti e non vanno mai confusi.
//   - RETE %  = km di rete stradale selezionati / km di rete stradale totale
//               (metrica lineare, dall'automatico)
//   - AREA %  = km² stimati coperti (corridoio attorno alle linee) / km² del
//               comune (metrica areale, stima per rasterizzazione)
//
// Puro e testabile. Nessuna dipendenza dal motore operativo.

import {
  polylineLengthMeters,
  haversineMeters,
  areaOfBoundaryM2,
  pointInBoundary,
} from './mapStudioGeometry.js';

const DEG2RAD = Math.PI / 180;

export const DEFAULT_KPI_CONFIG = Object.freeze({
  coverageBufferM: 15, // mezzo corridoio: ~30 m di larghezza coperta per linea
  rasterCellM: 25, // risoluzione della stima areale
  maxRasterCells: 60000, // tetto di sicurezza: sopra, la cella viene ingrandita
  walkingSpeedKmh: 3, // andatura effettiva porta a porta
  flyersPerKm: 110, // stima volantini/km (indicativa; la UI la marca "stima")
});

// Estrae le polilinee "coperte" (linee manuali + automatiche) da un progetto.
function coveredLines(project) {
  return (project?.features || [])
    .filter((f) => (f.type === 'line') && Array.isArray(f.geometry) && f.geometry.length >= 2)
    .map((f) => f.geometry);
}

// Stima areale per rasterizzazione: si "timbra" una griglia lungo ogni linea,
// contando le celle entro `coverageBufferM`; l'area = celle × areaCella,
// clippata al confine comune. Deterministico, O(lunghezza/step).
export function estimateCoveredAreaM2(lines, boundaryGeoJson, config = DEFAULT_KPI_CONFIG) {
  const list = (lines || []).filter((l) => Array.isArray(l) && l.length >= 2);
  if (list.length === 0) return { areaM2: 0, cellM: config.rasterCellM, cells: 0 };

  // bbox di tutte le linee
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const line of list) {
    for (const [lat, lng] of line) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  const midLat = (minLat + maxLat) / 2;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.max(0.05, Math.cos(midLat * DEG2RAD));

  // cella adattiva per non esplodere in celle
  let cellM = config.rasterCellM;
  const widthM = Math.max(1, (maxLng - minLng) * mPerDegLng);
  const heightM = Math.max(1, (maxLat - minLat) * mPerDegLat);
  while ((widthM / cellM) * (heightM / cellM) > config.maxRasterCells) cellM *= 1.5;

  const dLat = cellM / mPerDegLat;
  const dLng = cellM / mPerDegLng;
  const buffCells = Math.max(1, Math.ceil(config.coverageBufferM / cellM));
  const stamped = new Set();

  const stampAround = (lat, lng) => {
    const ci = Math.round((lat - minLat) / dLat);
    const cj = Math.round((lng - minLng) / dLng);
    for (let a = -buffCells; a <= buffCells; a += 1) {
      for (let b = -buffCells; b <= buffCells; b += 1) {
        if (a * a + b * b > buffCells * buffCells + buffCells) continue; // ~cerchio
        stamped.add(`${ci + a}:${cj + b}`);
      }
    }
  };

  const stepM = Math.max(5, cellM / 2);
  for (const line of list) {
    for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1];
      const b = line[i];
      const segM = haversineMeters(a, b);
      const n = Math.max(1, Math.ceil(segM / stepM));
      for (let k = 0; k <= n; k += 1) {
        const t = k / n;
        stampAround(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      }
    }
  }

  const cellAreaM2 = cellM * cellM;
  let cells = 0;
  for (const key of stamped) {
    const [ci, cj] = key.split(':').map(Number);
    const lat = minLat + ci * dLat;
    const lng = minLng + cj * dLng;
    if (pointInBoundary(boundaryGeoJson, [lat, lng])) cells += 1;
  }
  return { areaM2: cells * cellAreaM2, cellM, cells };
}

// KPI completi. `network` = risultato di buildAutoResult (o null se
// l'automatico non e' stato ancora eseguito).
export function computeKpi(project, network = null, config = DEFAULT_KPI_CONFIG) {
  const cfg = { ...DEFAULT_KPI_CONFIG, ...(config || {}) };
  const features = project?.features || [];
  const operators = project?.operators || [];
  const lines = features.filter((f) => f.type === 'line' && Array.isArray(f.geometry) && f.geometry.length >= 2);
  const points = features.filter((f) => f.type === 'point');
  const polygons = features.filter((f) => f.type === 'polygon');

  const drawnLengthM = lines.reduce((s, f) => s + polylineLengthMeters(f.geometry), 0);

  const municipalityAreaM2 = areaOfBoundaryM2(project?.boundary);

  // ── RETE % (lineare) ──────────────────────────────────────────────
  const totalNetworkM = network?.totalNetworkM || null;
  const selectedNetworkM = network?.selectedNetworkM ?? null;
  const networkSelectedPercent = network && totalNetworkM
    ? Number(((selectedNetworkM / totalNetworkM) * 100).toFixed(1))
    : null;

  // ── AREA % (areale, stima) ────────────────────────────────────────
  const areaEst = estimateCoveredAreaM2(coveredLines(project), project?.boundary, cfg);
  const coveredAreaKm2 = areaEst.areaM2 / 1e6;
  const municipalityAreaKm2 = municipalityAreaM2 / 1e6;
  const areaCoveredPercent = municipalityAreaKm2 > 0
    ? Number(((coveredAreaKm2 / municipalityAreaKm2) * 100).toFixed(1))
    : null;

  // ── per operatore ────────────────────────────────────────────────
  const perOperator = operators.map((op) => {
    const opLines = lines.filter((f) => f.operatorId === op.id);
    const km = opLines.reduce((s, f) => s + polylineLengthMeters(f.geometry), 0) / 1000;
    const hours = cfg.walkingSpeedKmh > 0 ? km / cfg.walkingSpeedKmh : 0;
    return {
      operatorId: op.id,
      name: op.name,
      color: op.color,
      lines: opLines.length,
      km: Number(km.toFixed(2)),
      estimatedHours: Number(hours.toFixed(2)),
    };
  });
  const totalKm = Number((drawnLengthM / 1000).toFixed(2));
  const totalHours = Number(perOperator.reduce((s, o) => s + o.estimatedHours, 0).toFixed(2));

  return {
    municipality: project?.municipality || null,
    // sezioni SEPARATE
    network: {
      totalKm: totalNetworkM != null ? Number((totalNetworkM / 1000).toFixed(2)) : null,
      selectedKm: selectedNetworkM != null ? Number((selectedNetworkM / 1000).toFixed(2)) : null,
      selectedPercent: networkSelectedPercent, // "RETE %"
      label: network?.networkPercentLabel || null,
    },
    area: {
      municipalityKm2: Number(municipalityAreaKm2.toFixed(2)),
      coveredKm2: Number(coveredAreaKm2.toFixed(2)),
      coveredPercent: areaCoveredPercent, // "AREA %"
      method: 'stima per rasterizzazione',
      rasterCellM: areaEst.cellM,
    },
    counts: {
      lines: lines.length,
      points: points.length,
      polygons: polygons.length,
      operators: operators.length,
    },
    drawnKm: totalKm,
    perOperator,
    totalEstimatedHours: totalHours,
    estimatedFlyers: Math.round(totalKm * cfg.flyersPerKm),
    config: cfg,
  };
}
