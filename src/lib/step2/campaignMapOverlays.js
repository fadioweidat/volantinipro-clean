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
  const cityKey = pv => pv?.city?.istat || pv?.city?.id || pv?.city?.label || pv?.cityName || '';
  return zones.flatMap((pv, index) => {
    const active = pv.id === activeId;
    const selectedIds = new Set(pv.selected || []);
    const sameCityRows = cityKey(pv) === cityKey(activePv) ? availableRows : [];
    const savedRows = pv.zonesAllocation || pv.allocation || [];
    const rows = active ? activeRows : [...savedRows, ...sameCityRows.filter(row => selectedIds.has(row.id))];
    const nilSelection = pv.nilManualMode || pv.areaMode === 'custom_zone';
    const seen = new Set();
    return rows.flatMap(row => {
      if (nilSelection && !selectedIds.has(row.id)) return [];
      const available = sameCityRows.find(candidate => candidate.id === row.id);
      const geometry = row.geometry || row.polygon_geojson || row.geometry_geojson || available?.geometry || available?.polygon_geojson || available?.geometry_geojson;
      if (!geometry || row.id == null || seen.has(row.id)) return [];
      seen.add(row.id);
      return [{ key: `${pv.id}:${row.id}`, ownerId: pv.id, active,
        color: pointOfSaleMapColor(pv.id, zones), label: pv.store_name || `Punto vendita ${index + 1} · ${pv.cityName || pv.city?.label || ''}`,
        name: row.name || row.label || available?.name || '', geometry }];
    });
  });
}
