import { canonicalZoneId } from './zoneGeoHelpers.js';

const COLORS = ['#38BDF8', '#F59E0B', '#A78BFA', '#FB7185', '#2DD4BF', '#A3E635'];

export function pointOfSaleMapColor(id, zones = []) {
  let hash = 0;
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const ids = [...new Set(zones.map(pv => String(pv.id)))].sort();
  const used = new Set();
  for (const ownerId of ids) {
    let ownerHash = 0;
    for (const char of ownerId) ownerHash = (ownerHash * 31 + char.charCodeAt(0)) >>> 0;
    let index = ownerHash % COLORS.length;
    if (used.size < COLORS.length) while (used.has(index)) index = (index + 1) % COLORS.length;
    used.add(index);
    if (ownerId === String(id)) return COLORS[index];
  }
  return COLORS[hash % COLORS.length];
}

// Display projection only: preserve original geometries, ownership and quantities.
export function buildCampaignMapOverlays(zones, activeId, activeRows = [], availableRows = []) {
  if (!Array.isArray(zones) || zones.length < 2) return [];
  const activePv = zones.find(pv => pv.id === activeId);
  const cityKey = pv => String(pv?.city?.name || pv?.city?.label || pv?.cityName || '').replace(/\s*\([A-Z]{2}\)\s*$/i, '').trim().toLowerCase();
  return zones.flatMap((pv, index) => {
    const active = pv.id === activeId;
    const selectedIds = new Set((pv.selected || []).map(canonicalZoneId));
    const sameCityRows = cityKey(pv) === cityKey(activePv) ? availableRows : [];
    const savedRows = pv.zonesAllocation || pv.allocation || [];
    const rows = active ? activeRows : [...savedRows, ...sameCityRows.filter(row => selectedIds.has(canonicalZoneId(row.id)))];
    const nilSelection = pv.nilManualMode || pv.areaMode === 'custom_zone';
    const seen = new Set();
    const center = pv.city || pv;
    // Un PV a raggio occupa solo il suo cerchio, come i poligoni della mappa.
    const clip = pv.searchMode === 'address' && !nilSelection && Number(pv.radiusKm ?? pv.radius) > 0
      && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))
      ? { lat: Number(center.lat), lng: Number(center.lng), radiusKm: Number(pv.radiusKm ?? pv.radius) }
      : null;
    return rows.flatMap(row => {
      if (nilSelection && !selectedIds.has(canonicalZoneId(row.id))) return [];
      const available = sameCityRows.find(candidate => candidate.id === row.id);
      const geometry = row.geometry || row.polygon_geojson || row.geometry_geojson || available?.geometry || available?.polygon_geojson || available?.geometry_geojson;
      if (!geometry || row.id == null || seen.has(row.id)) return [];
      seen.add(row.id);
      return [{ key: `${pv.id}:${row.id}`, ownerId: pv.id, active,
        color: pointOfSaleMapColor(pv.id, zones), label: pv.store_name || `Punto vendita ${index + 1} · ${pv.cityName || pv.city?.label || ''}`,
        name: row.name || row.label || available?.name || '', geometry, clip }];
    });
  });
}

export function pointOfSaleCenter(pv) {
  const point = pv?.searchMode === 'address' ? pv.selectedSearchPoint : null;
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) ? point : pv?.city || null;
}

// Cerchi dei punti vendita a raggio: uno per PV, anche senza territori salvati.
// Il PV attivo usa il centro e il raggio correnti della mappa, gli altri quelli
// salvati. Solo presentazione: quantita' e allocazioni non passano di qui.
export function buildPointOfSaleRings(zones, activeId, activeView = null) {
  if (!Array.isArray(zones) || zones.length < 2) return [];
  return zones.flatMap((pv, index) => {
    const active = pv.id === activeId;
    const isRadius = active ? Boolean(activeView) : pv.searchMode === 'address' && !pv.nilManualMode && pv.areaMode !== 'custom_zone';
    // Il centro di un PV a raggio e' il suo indirizzo; city e' solo il comune.
    const center = active ? activeView : (pointOfSaleCenter(pv) || null);
    const radiusKm = Number(active ? activeView?.radiusKm : pv.radiusKm ?? pv.radius);
    if (!isRadius || !center || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng)) || !(radiusKm > 0)) return [];
    return [{ id: pv.id, active, number: index + 1, lat: Number(center.lat), lng: Number(center.lng), radiusKm,
      color: pointOfSaleMapColor(pv.id, zones), label: pv.store_name || `Punto vendita ${index + 1}` }];
  });
}

// Attivo: bordo continuo. Inattivo: tratteggiato. Nessun riempimento: i colori
// dei territori restano quelli del livello geografico.
export function pointOfSaleRingStyle(ring, activeColor) {
  return ring.active
    ? { color: activeColor, weight: 2.5, opacity: 0.95, fill: false, interactive: false }
    : { color: ring.color, weight: 2, opacity: 0.9, dashArray: '6 5', fill: false, interactive: false };
}
