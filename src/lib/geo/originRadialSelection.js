// Selezione delle vie "Admin automatiche" a partire da un punto di origine,
// con espansione radiale progressiva (P1). Sostituisce l'ordinamento per
// solo OSM way id (troppo distribuito su tutto il comune) mantenendo intatta
// la de-priorizzazione delle vie gia' coperte da GPS reale.
import { geoJsonContainsPoint } from './pointInPolygon.js';
import { largestRing } from './resolveRoadNetwork.js';

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Centro comune (Fase 2): centroide dei vertici del confine; se cade fuori
 * dal Polygon/MultiPolygon (forme concave/a ferro di cavallo), fallback
 * point-on-surface deterministico — griglia di candidati dentro il
 * bounding box, si sceglie quello dentro il boundary piu' vicino al
 * centroide naive. MAI Milano, MAI la posizione GPS del Driver.
 * @returns {{lat:number,lng:number}|null}
 */
export function getMunicipalityCenterPoint(boundaryGeometry) {
  const ring = largestRing(boundaryGeometry);
  if (!ring || ring.length < 3) return null;

  let sumLng = 0, sumLat = 0;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    sumLng += lng; sumLat += lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const naive = { lat: sumLat / ring.length, lng: sumLng / ring.length };
  if (geoJsonContainsPoint(boundaryGeometry, naive.lat, naive.lng)) return naive;

  // Point-on-surface: griglia deterministica 15x15 sul bbox, candidato
  // interno piu' vicino al centroide naive vince. Nessun Math.random.
  const STEPS = 15;
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i <= STEPS; i += 1) {
    const lat = minLat + ((maxLat - minLat) * i) / STEPS;
    for (let j = 0; j <= STEPS; j += 1) {
      const lng = minLng + ((maxLng - minLng) * j) / STEPS;
      if (!geoJsonContainsPoint(boundaryGeometry, lat, lng)) continue;
      const d = haversineMeters(lat, lng, naive.lat, naive.lng);
      if (d < bestDist) { bestDist = d; best = { lat, lng }; }
    }
  }
  return best; // null solo se la griglia non trova alcun punto interno (boundary degenere)
}

// Punto rappresentativo di una via = vertice della geometria piu' vicino
// all'origine ("nearest point", Fase 5 — alternativa dichiarata al midpoint,
// piu' accurata per vie lunghe che si allontanano dall'origine lungo il
// tracciato). Restituisce anche il punto stesso (non solo la distanza): la
// suddivisione per operatore (operatorSplit.js) ne ha bisogno per calcolare
// il rilevamento/bearing dall'origine e assegnare settori angolari coerenti.
function nearestPointAndDistance(way, origin) {
  let best = Infinity;
  let bestPoint = way.geometry[0] || null;
  for (const point of way.geometry) {
    const [lat, lng] = point;
    const d = haversineMeters(origin.lat, origin.lng, lat, lng);
    if (d < best) { best = d; bestPoint = point; }
  }
  return { distance: best, point: bestPoint };
}

function isWayNearGpsPath(way, gpsPath, thresholdM) {
  if (!gpsPath.length) return false;
  for (const [lat, lng] of gpsPath) {
    for (const [wLat, wLng] of way.geometry) {
      if (haversineMeters(lat, lng, wLat, wLng) <= thresholdM) return true;
    }
  }
  return false;
}

const GPS_PROXIMITY_THRESHOLD_M = 30;

/**
 * Selezione deterministica per espansione radiale dall'origine, con GPS
 * avoidance applicata come partizione secondaria (Fase 8): entro ciascuna
 * partizione (non coperta da GPS / coperta da GPS) l'ordine resta quello di
 * distanza crescente dall'origine, tie-breaker OSM way id (Fase 5).
 * MAI Math.random — stessa origine + stessa percentuale => stesso risultato.
 * @returns {{selectedWays: Array, selectedLengthM: number, coverageMetricPercent: number}}
 */
export function selectRoadsFromOrigin({ ways, totalLengthM }, origin, percent, gpsPath = []) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  if (!ways?.length || totalLengthM <= 0 || pct <= 0 || !origin) {
    return { selectedWays: [], selectedLengthM: 0, coverageMetricPercent: 0 };
  }
  const targetLengthM = (pct / 100) * totalLengthM;

  const withMeta = ways.map((w) => {
    const { distance, point } = nearestPointAndDistance(w, origin);
    return {
      ...w,
      distanceFromOrigin: distance,
      nearestPointFromOrigin: point,
      nearGps: isWayNearGpsPath(w, gpsPath, GPS_PROXIMITY_THRESHOLD_M),
    };
  });

  const byDistanceThenId = (a, b) => (a.distanceFromOrigin - b.distanceFromOrigin) || (a.id - b.id);
  const ordered = [
    ...withMeta.filter((w) => !w.nearGps).sort(byDistanceThenId),
    ...withMeta.filter((w) => w.nearGps).sort(byDistanceThenId),
  ];

  const selectedWays = [];
  let selectedLengthM = 0;
  for (const way of ordered) {
    if (selectedLengthM >= targetLengthM) break;
    selectedWays.push(way);
    selectedLengthM += way.lengthM;
  }

  return {
    selectedWays,
    selectedLengthM,
    coverageMetricPercent: totalLengthM > 0 ? (selectedLengthM / totalLengthM) * 100 : 0,
  };
}
