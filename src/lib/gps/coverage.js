// Copertura operativa per il tracking GPS: modulo puro (nessuna dipendenza
// da Supabase/DOM). Stima la percentuale di AREA OPERATIVA della zona
// assegnata coperta dal percorso della sessione, campionando una griglia
// regolare sulla geometria reale della zona (cerchio o poligono, le stesse
// forme normalizzate da geofenceEngine) e contando le celle entro il raggio
// di copertura da almeno un punto GPS valido (pointQuality). Denominatore
// dichiarato: celle della griglia interne alla zona ("area operativa").
// Nessun valore inventato: senza una zona con geometria utilizzabile il
// risultato e' esplicitamente "non calcolabile".
import { isPointInAnyZone } from '../geofence/geofenceEngine.js';
import { filterValidGpsPoints } from './pointQuality.js';

export const COVERAGE_CELL_SIZE_M = 25;
export const COVERAGE_RADIUS_M = 40;
// Cap sulle celle del bounding box: oltre, il passo griglia viene allargato
// (stima piu' grossolana ma sempre reale) per non bloccare il telefono.
const MAX_BBOX_CELLS = 40000;

const M_PER_DEG_LAT = 111320;

function toFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function zoneBBox(zone) {
  if (zone.kind === 'circle') {
    const dLat = (zone.radiusKm * 1000) / M_PER_DEG_LAT;
    const dLng = (zone.radiusKm * 1000) / (M_PER_DEG_LAT * Math.cos((zone.centerLat * Math.PI) / 180));
    return [zone.centerLat - dLat, zone.centerLng - dLng, zone.centerLat + dLat, zone.centerLng + dLng];
  }
  if (zone.kind === 'polygon') {
    const rings = zone.geometry?.type === 'Polygon'
      ? zone.geometry.coordinates
      : zone.geometry?.type === 'MultiPolygon'
        ? (zone.geometry.coordinates || []).flat()
        : [];
    let minLat = Infinity; let minLng = Infinity; let maxLat = -Infinity; let maxLng = -Infinity;
    for (const ring of rings) {
      for (const pt of ring || []) {
        const lng = toFinite(pt?.[0]);
        const lat = toFinite(pt?.[1]);
        if (lat == null || lng == null) continue;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }
    return Number.isFinite(minLat) ? [minLat, minLng, maxLat, maxLng] : null;
  }
  return null;
}

export function zonesBBox(zones) {
  let box = null;
  for (const zone of zones || []) {
    const b = zoneBBox(zone);
    if (!b) continue;
    box = box
      ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]
      : b;
  }
  return box;
}

// Proiezione equirettangolare locale in metri: sufficiente alle scale di
// una zona di distribuzione, evita trigonometria per ogni coppia cella-punto.
function projectPoints(points, refLat) {
  const cosRef = Math.cos((refLat * Math.PI) / 180);
  return points
    .map((p) => {
      const lat = toFinite(p.lat);
      const lng = toFinite(p.lng);
      if (lat == null || lng == null) return null;
      return [lng * M_PER_DEG_LAT * cosRef, lat * M_PER_DEG_LAT];
    })
    .filter(Boolean);
}

function isCovered(x, y, projected, radiusM) {
  const r2 = radiusM * radiusM;
  for (const [px, py] of projected) {
    const dx = px - x;
    const dy = py - y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

// Calcola la copertura della zona (o insieme di zone) rispetto ai punti GPS
// della sessione. `sectors` (opzionale): lista di zone-poligono normalizzate
// (es. settori comunali reali da get_map_sectors) — per ciascuna viene
// calcolata la copertura limitata all'intersezione settore∩zona; i settori
// che non intersecano la zona assegnata sono esclusi (mai mostrare settori
// di altre citta').
export function computeZoneCoverage(zones, points, options = {}) {
  const cellRequested = options.cellSizeM ?? COVERAGE_CELL_SIZE_M;
  const coverRadiusM = options.coverRadiusM ?? COVERAGE_RADIUS_M;
  const sectors = options.sectors || [];

  const usable = (zones || []).filter((z) => z && z.kind !== 'unusable');
  if (!usable.length) {
    return { computable: false, reason: 'zone_unavailable' };
  }
  const box = zonesBBox(usable);
  if (!box) return { computable: false, reason: 'zone_unavailable' };

  const [minLat, minLng, maxLat, maxLng] = box;
  const refLat = (minLat + maxLat) / 2;
  const cosRef = Math.cos((refLat * Math.PI) / 180);
  const widthM = (maxLng - minLng) * M_PER_DEG_LAT * cosRef;
  const heightM = (maxLat - minLat) * M_PER_DEG_LAT;

  let cellSizeM = cellRequested;
  const estimatedCells = (widthM / cellSizeM) * (heightM / cellSizeM);
  if (estimatedCells > MAX_BBOX_CELLS) {
    cellSizeM = Math.ceil(Math.sqrt((widthM * heightM) / MAX_BBOX_CELLS));
  }
  const stepLat = cellSizeM / M_PER_DEG_LAT;
  const stepLng = cellSizeM / (M_PER_DEG_LAT * cosRef);

  const { valid } = filterValidGpsPoints(points || []);
  const projected = projectPoints(valid, refLat);

  const sectorStats = sectors.map((sector) => ({ sector, zoneCells: 0, coveredCells: 0 }));

  let zoneCells = 0;
  let coveredCells = 0;
  for (let lat = minLat + stepLat / 2; lat <= maxLat; lat += stepLat) {
    const y = lat * M_PER_DEG_LAT;
    for (let lng = minLng + stepLng / 2; lng <= maxLng; lng += stepLng) {
      if (!isPointInAnyZone(usable, lat, lng)) continue;
      zoneCells += 1;
      const x = lng * M_PER_DEG_LAT * cosRef;
      const covered = projected.length > 0 && isCovered(x, y, projected, coverRadiusM);
      if (covered) coveredCells += 1;
      for (const stat of sectorStats) {
        if (isPointInAnyZone([stat.sector], lat, lng)) {
          stat.zoneCells += 1;
          if (covered) stat.coveredCells += 1;
        }
      }
    }
  }

  if (zoneCells === 0) return { computable: false, reason: 'zone_unavailable' };

  const percent = Math.round((coveredCells / zoneCells) * 100);
  const sectorCoverage = sectorStats
    .filter((stat) => stat.zoneCells > 0)
    .map((stat) => {
      const sectorPercent = Math.round((stat.coveredCells / stat.zoneCells) * 100);
      return {
        name: stat.sector.name || 'Settore',
        percent: sectorPercent,
        status: sectorPercent >= 90 ? 'completed' : sectorPercent > 0 ? 'partial' : 'missing',
      };
    });

  return {
    computable: true,
    percent,
    zoneCells,
    coveredCells,
    cellSizeM,
    coverRadiusM,
    validPointCount: valid.length,
    denominatorLabel: 'area operativa della zona (stima a griglia)',
    sectors: sectorCoverage,
  };
}

// Converte le feature GeoJSON di get_map_sectors (settori comunali reali,
// stessa fonte gia' usata da Step2) in zone-poligono normalizzate accettate
// da computeZoneCoverage/isPointInAnyZone. Nessuna nuova fonte dati.
export function sectorsToZones(featureCollection) {
  const features = featureCollection?.features || [];
  return features
    .filter((f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f) => ({
      kind: 'polygon',
      geometry: f.geometry,
      name: [f.properties?.municipality_code, f.properties?.sector_name || `Settore ${f.properties?.sector_number ?? ''}`]
        .filter(Boolean)
        .join(' · '),
    }));
}
