// Fusione di piu' reti stradali idonee (una per zona/comune della campagna)
// in un'unica rete operativa, con deduplica delle vie condivise sui confini
// comunali. Nessuna dipendenza esterna, deterministico (nessun Math.random,
// ordine finale stabile e indipendente dall'ordine di input).
import { geoJsonContainsPoint } from './pointInPolygon.js';

// Firma stabile di una geometria [[lat,lng],...] — SOLO fallback quando l'OSM
// way id manca. Estremi arrotondati a ~1 m (5 decimali) + numero di vertici;
// gli estremi sono ordinati cosi' la firma non dipende dal verso della via.
export function geometrySignature(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return null;
  const r = (n) => Number(n).toFixed(5);
  const a = geometry[0];
  const b = geometry[geometry.length - 1];
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const ends = [`${r(a[0])},${r(a[1])}`, `${r(b[0])},${r(b[1])}`].sort();
  return `${ends[0]}|${ends[1]}|${geometry.length}`;
}

/**
 * @param {Array<{zoneId:*, network:{ways:Array,totalLengthM:number}|null}>} entries
 * @returns {{ways:Array, totalLengthM:number, loadedZoneCount:number, failedZoneCount:number, loadedZoneIds:Array, failedZoneIds:Array}}
 */
export function mergeRoadNetworks(entries) {
  const byKey = new Map();
  const loadedZoneIds = [];
  const failedZoneIds = [];

  for (const entry of entries || []) {
    const zoneId = entry?.zoneId ?? null;
    const net = entry?.network;
    if (!net || !Array.isArray(net.ways) || net.ways.length === 0) {
      failedZoneIds.push(zoneId);
      continue;
    }
    loadedZoneIds.push(zoneId);
    for (const way of net.ways) {
      const sig = geometrySignature(way?.geometry);
      const key = way?.id != null ? `id:${way.id}` : (sig ? `sig:${sig}` : null);
      if (!key) continue;
      // Prima occorrenza vince: la stessa via su due confini non viene contata due volte.
      if (!byKey.has(key)) byKey.set(key, way);
    }
  }

  const ways = [...byKey.values()].sort((a, b) => {
    const ka = a?.id != null ? a.id : (geometrySignature(a?.geometry) || '');
    const kb = b?.id != null ? b.id : (geometrySignature(b?.geometry) || '');
    if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
    return String(ka).localeCompare(String(kb));
  });

  return {
    ways,
    totalLengthM: ways.reduce((s, w) => s + (Number(w?.lengthM) || 0), 0),
    loadedZoneCount: loadedZoneIds.length,
    failedZoneCount: failedZoneIds.length,
    loadedZoneIds,
    failedZoneIds,
  };
}

/**
 * Zona di appartenenza di una via generata (§7 del ticket): representative
 * point (vertice mediano) testato contro il confine di ogni zona campagna.
 * - 1 zona contiene il punto -> quella
 * - piu' zone (vie sul confine) -> scelta deterministica: zona con id minore
 * - nessuna (midpoint fuori) -> riprova col primo vertice
 * - ancora nessuna -> fallback esplicito e tracciato
 * @returns {{zoneId:*, method:string}}
 */
export function assignWayZoneId(wayGeometry, campaignZones = [], fallbackZoneId = null) {
  if (!Array.isArray(wayGeometry) || wayGeometry.length === 0) {
    return { zoneId: fallbackZoneId, method: 'fallback_empty_geometry' };
  }
  const zones = [...campaignZones]
    .filter((z) => z && z.boundaryGeometry && z.id != null)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (zones.length === 0) return { zoneId: fallbackZoneId, method: 'fallback_no_campaign_zones' };

  const [mLat, mLng] = wayGeometry[Math.floor(wayGeometry.length / 2)] || [];
  const midHits = zones.filter((z) => geoJsonContainsPoint(z.boundaryGeometry, mLat, mLng));
  if (midHits.length === 1) return { zoneId: midHits[0].id, method: 'contains_midpoint' };
  if (midHits.length > 1) return { zoneId: midHits[0].id, method: 'multi_zone_deterministic' };

  const [fLat, fLng] = wayGeometry[0] || [];
  const firstHit = zones.find((z) => geoJsonContainsPoint(z.boundaryGeometry, fLat, fLng));
  if (firstHit) return { zoneId: firstHit.id, method: 'contains_first_vertex' };

  return { zoneId: fallbackZoneId, method: 'fallback_no_zone_match' };
}
