export function ringContainsOrOnBoundaryPoint(ring, lat, lng) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  const tol = 1e-9;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ptI = ring[i];
    const ptJ = ring[j];
    if (!Array.isArray(ptI) || !Array.isArray(ptJ) || ptI.length < 2 || ptJ.length < 2) continue;
    let xi = Number(ptI[0]);
    let yi = Number(ptI[1]);
    let xj = Number(ptJ[0]);
    let yj = Number(ptJ[1]);
    if (Math.abs(xi) > 35 && Math.abs(yi) < 20 && Math.abs(nLat) > 35 && Math.abs(nLng) < 20) {
      [xi, yi] = [yi, xi];
      [xj, yj] = [yj, xj];
    }
    const dx = xj - xi;
    const dy = yj - yi;
    const cross = (nLng - xi) * dy - (nLat - yi) * dx;
    if (Math.abs(cross) < 1e-7) {
      if (
        nLng >= Math.min(xi, xj) - tol &&
        nLng <= Math.max(xi, xj) + tol &&
        nLat >= Math.min(yi, yj) - tol &&
        nLat <= Math.max(yi, yj) + tol
      ) {
        return true;
      }
    }
    const intersect =
      (yi > nLat) !== (yj > nLat) &&
      nLng < ((xj - xi) * (nLat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function geoJsonContainsPoint(geometry, lat, lng) {
  if (!geometry || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);

  function polygonContains(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    const outerRing = coords[0];
    if (!ringContainsOrOnBoundaryPoint(outerRing, nLat, nLng)) return false;
    for (let k = 1; k < coords.length; k++) {
      if (ringContainsOrOnBoundaryPoint(coords[k], nLat, nLng)) return false;
    }
    return true;
  }

  if (geometry.type === "Polygon") {
    return polygonContains(geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    if (!Array.isArray(geometry.coordinates)) return false;
    return geometry.coordinates.some((poly) => polygonContains(poly));
  }
  return false;
}

export function geoJsonApproxCentroid(geometry) {
  const ring =
    geometry?.type === "Polygon"
      ? geometry.coordinates?.[0]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates?.[0]?.[0]
        : null;
  if (!ring || !ring.length) return null;
  let sumLng = 0;
  let sumLat = 0;
  ring.forEach(([lng, lat]) => {
    sumLng += Number(lng) || 0;
    sumLat += Number(lat) || 0;
  });
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}
