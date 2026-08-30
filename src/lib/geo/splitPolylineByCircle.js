// Split geometrico puro di una polilinea rispetto al cerchio della GOMMA.
// Usato SOLO sulle bozze non salvate (draftLines) di CoverageAdjustmentPanel:
// la porzione dentro il cerchio viene rimossa, le parti fuori restano come
// 0..N LineString valide. Nessuna dipendenza esterna, deterministico.
//
// Proiezione locale equirettangolare centrata sul punto della gomma: per le
// distanze in gioco (raggio 5–50 m) l'errore e' trascurabile e i tagli
// segmento/cerchio sono esatti (quadratica), NON una semplice distanza dal
// vertice — il cerchio taglia anche a meta' di un segmento lungo senza
// vertici interni.

const M_PER_DEG_LAT = 111320;

function isFinitePair(p) {
  return Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));
}

/** Lunghezza di una polilinea [[lat,lng],...] in metri (haversine). */
export function polylineLengthMeters(line) {
  if (!Array.isArray(line) || line.length < 2) return 0;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    const [lat1, lng1] = line[i - 1];
    const [lat2, lng2] = line[i];
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}

/**
 * @param {Array<[number,number]>} line  polilinea [[lat,lng],...]
 * @param {[number,number]} center       centro gomma [lat,lng]
 * @param {number} radiusM               raggio gomma in metri
 * @returns {Array<Array<[number,number]>>} 0..N LineString residue (>=2 punti ciascuna)
 *   - cerchio che non interseca         -> [line]
 *   - cerchio che copre tutta la linea  -> []
 *   - taglio centrale                   -> [pezzoA, pezzoB]
 *   - taglio all'estremita'             -> [pezzo accorciato]
 */
export function splitPolylineByCircle(line, center, radiusM) {
  if (!Array.isArray(line) || line.length < 2) return [];
  const clean = line.filter(isFinitePair).map(([lat, lng]) => [Number(lat), Number(lng)]);
  if (clean.length < 2) return [];
  const r = Number(radiusM);
  if (!Number.isFinite(r) || r <= 0) return [clean];
  if (!isFinitePair(center)) return [clean];

  const clat = Number(center[0]);
  const clng = Number(center[1]);
  const kx = M_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  const toXY = ([lat, lng]) => [(lng - clng) * kx, (lat - clat) * ky];
  const r2 = r * r;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  const residuals = [];
  let cur = [];
  const pushPt = (pt) => {
    const lastPt = cur[cur.length - 1];
    if (!lastPt || lastPt[0] !== pt[0] || lastPt[1] !== pt[1]) cur.push(pt);
  };
  const flush = () => {
    if (cur.length >= 2) residuals.push(cur);
    cur = [];
  };

  for (let i = 0; i < clean.length - 1; i += 1) {
    const A = clean[i];
    const B = clean[i + 1];
    const [ax, ay] = toXY(A);
    const [bx, by] = toXY(B);
    const dx = bx - ax;
    const dy = by - ay;
    const aa = dx * dx + dy * dy;

    // parametri t in (0,1) dove il segmento attraversa la circonferenza
    const ts = [0, 1];
    if (aa > 1e-9) {
      const bb = 2 * (ax * dx + ay * dy);
      const cc = ax * ax + ay * ay - r2;
      const disc = bb * bb - 4 * aa * cc;
      if (disc > 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-bb - sq) / (2 * aa);
        const t2 = (-bb + sq) / (2 * aa);
        if (t1 > 1e-9 && t1 < 1 - 1e-9) ts.push(t1);
        if (t2 > 1e-9 && t2 < 1 - 1e-9) ts.push(t2);
      }
    }
    ts.sort((p, q) => p - q);

    for (let k = 0; k < ts.length - 1; k += 1) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2;
      const mx = ax + dx * tm;
      const my = ay + dy * tm;
      const inside = mx * mx + my * my < r2;
      if (inside) {
        flush(); // porzione dentro il cerchio: interrompe il residuo corrente
      } else {
        const p0 = t0 <= 0 ? A : t0 >= 1 ? B : lerp(A, B, t0);
        const p1 = t1 >= 1 ? B : t1 <= 0 ? A : lerp(A, B, t1);
        pushPt(p0);
        pushPt(p1);
      }
    }
  }
  flush();

  return residuals
    .map((seg) => seg.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)))
    .filter((seg) => seg.length >= 2);
}
