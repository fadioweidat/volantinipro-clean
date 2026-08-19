// Mappa di report disegnata direttamente su <canvas>, senza tile raster e
// senza html2canvas: verificato dal vivo che html2canvas non cattura i pannelli
// Leaflet (posizionati via CSS transform) — risultato un JPEG vuoto (solo
// colore di sfondo), sia con tile.openstreetmap.org sia con CartoDB CORS-enabled.
// Incompatibilita' nota di html2canvas con Leaflet, non un problema di rete/CORS.
// Questa strategia disegna confine reale + traccia GPS reale con una
// proiezione equirettangolare semplice (stessa idea di projectMeters in
// geofenceEngine.js) — mai un tile finto, mai dati geografici inventati:
// se non c'e' ne' confine ne' traccia, ritorna null e il chiamante mostra
// il placeholder onesto.
const SNAPSHOT_WIDTH = 640;
const SNAPSHOT_HEIGHT = 380;
const PADDING = 36;

function ringsFromGeometry(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function computeBbox(rings, path) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const consume = (lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };
  rings.forEach((ring) => ring.forEach(([lng, lat]) => consume(lng, lat)));
  path.forEach(([lat, lng]) => consume(lng, lat));
  if (!Number.isFinite(minLng)) return null;
  // Estensione minima per evitare divisioni per zero su un solo punto.
  if (maxLng - minLng < 0.0005) { minLng -= 0.0025; maxLng += 0.0025; }
  if (maxLat - minLat < 0.0005) { minLat -= 0.0025; maxLat += 0.0025; }
  return { minLng, maxLng, minLat, maxLat };
}

function makeProjector(bbox) {
  const drawW = SNAPSHOT_WIDTH - PADDING * 2;
  const drawH = SNAPSHOT_HEIGHT - PADDING * 2;
  const lngSpan = bbox.maxLng - bbox.minLng;
  const latSpan = bbox.maxLat - bbox.minLat;
  // Correzione approssimativa per la latitudine media (i gradi di longitudine
  // "si stringono" salendo di latitudine) — sufficiente per l'estensione
  // ridotta di una singola zona di distribuzione, non serve altro qui.
  const midLatRad = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const lngScale = Math.cos(midLatRad);
  const scaleX = drawW / (lngSpan * lngScale || 1);
  const scaleY = drawH / (latSpan || 1);
  const scale = Math.min(scaleX, scaleY);
  const usedW = lngSpan * lngScale * scale;
  const usedH = latSpan * scale;
  const offsetX = PADDING + (drawW - usedW) / 2;
  const offsetY = PADDING + (drawH - usedH) / 2;
  return (lng, lat) => [
    offsetX + (lng - bbox.minLng) * lngScale * scale,
    offsetY + (bbox.maxLat - lat) * scale, // y invertita: nord in alto
  ];
}

export async function captureZoneMapSnapshot({ boundaryGeometry = null, points = [] } = {}) {
  const path = (points || [])
    .map((p) => [Number(p.lat), Number(p.lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  const rings = ringsFromGeometry(boundaryGeometry);
  if (!rings.length && path.length === 0) return null;

  try {
    const bbox = computeBbox(rings, path);
    if (!bbox) return null;
    const project = makeProjector(bbox);

    const canvas = document.createElement('canvas');
    canvas.width = SNAPSHOT_WIDTH;
    canvas.height = SNAPSHOT_HEIGHT;
    const ctx = canvas.getContext('2d');

    // Sfondo neutro cartografico (nessun tile raster: dichiarato, non
    // spacciato per una vera basemap).
    ctx.fillStyle = '#eef2ef';
    ctx.fillRect(0, 0, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);
    ctx.strokeStyle = 'rgba(23,33,31,0.06)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= SNAPSHOT_WIDTH; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, SNAPSHOT_HEIGHT); ctx.stroke(); }
    for (let gy = 0; gy <= SNAPSHOT_HEIGHT; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SNAPSHOT_WIDTH, gy); ctx.stroke(); }

    // Confine reale del comune/zona.
    if (rings.length) {
      rings.forEach((ring) => {
        ctx.beginPath();
        ring.forEach(([lng, lat], index) => {
          const [x, y] = project(lng, lat);
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(232,87,26,0.08)';
        ctx.fill();
        ctx.strokeStyle = '#e8571a';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Traccia GPS reale.
    if (path.length > 1) {
      ctx.beginPath();
      path.forEach(([lat, lng], index) => {
        const [x, y] = project(lng, lat);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Marker inizio/fine traccia.
    if (path.length) {
      const [startLat, startLng] = path[0];
      const [sx, sy] = project(startLng, startLat);
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0f766e'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      if (path.length > 1) {
        const [endLat, endLng] = path[path.length - 1];
        const [ex, ey] = project(endLng, endLat);
        ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(23,33,31,0.45)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Mappa schematica report — confine e traccia in scala reale, senza cartografia di sfondo.', 10, SNAPSHOT_HEIGHT - 10);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
