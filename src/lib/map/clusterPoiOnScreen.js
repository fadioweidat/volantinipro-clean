// Presentation only: source coordinates and POI identities remain unchanged.
export function clusterPoiOnScreen(pois, project, spacing = 44) {
  const cells = new Map();
  for (const p of pois) {
    const xy = project(p);
    const key = `${Math.floor(xy.x / spacing)},${Math.floor(xy.y / spacing)}`;
    const cell = cells.get(key) || { pois: [], x: 0, y: 0 };
    cell.pois.push(p);
    cell.x += xy.x;
    cell.y += xy.y;
    cells.set(key, cell);
  }
  const groups = [...cells.values()].map(cell => ({
    ...cell, x: cell.x / cell.pois.length, y: cell.y / cell.pois.length,
  }));
  // Merge adjacent groups, including neighbours across a grid boundary.
  // Recheck the weighted centre after each merge so bubbles remain separated.
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) >= spacing) continue;
      const count = a.pois.length + b.pois.length;
      a.x = (a.x * a.pois.length + b.x * b.pois.length) / count;
      a.y = (a.y * a.pois.length + b.y * b.pois.length) / count;
      a.pois.push(...b.pois);
      groups.splice(j, 1);
      i = -1;
      break;
    }
  }
  return groups.map(({ pois: group }) => {
    if (group.length === 1) return { ...group[0], isCluster: false };
    const rep = group.reduce((best, p) => p.priority > best.priority ? p : best, group[0]);
    return {
      lat: group.reduce((sum, p) => sum + p.lat, 0) / group.length,
      lng: group.reduce((sum, p) => sum + p.lng, 0) / group.length,
      isCluster: true, count: group.length, color: rep.color,
      category: rep.category, pois: group,
    };
  });
}
