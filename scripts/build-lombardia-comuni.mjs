// Crea public/data/territories/lombardia-comuni.json dalla lettura di
// public.geo_municipalities (municipality_code c, municipality_name n,
// ST_AsGeoJSON(geom, 5)::json g), salvata come JSON. Solo contesto visivo dello
// Step 2: KPI e quantita' continuano a usare le geometrie dell'analisi.
// Uso: node scripts/build-lombardia-comuni.mjs <lettura.json>
import { readFileSync, writeFileSync } from "node:fs";

const TOLERANCE_DEGREES = 0.0004; // circa 40 m a queste latitudini
const OUTPUT = new URL("../public/data/territories/lombardia-comuni.json", import.meta.url);

function distanceToSegment([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function simplifyLine(points) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let furthest = -1;
    let max = TOLERANCE_DEGREES;
    for (let i = start + 1; i < end; i += 1) {
      const distance = distanceToSegment(points[i], points[start], points[end]);
      if (distance > max) { max = distance; furthest = i; }
    }
    if (furthest >= 0) {
      keep[furthest] = 1;
      stack.push([start, furthest], [furthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

// Un anello chiuso si divide a meta': il primo e l'ultimo punto coincidono.
function simplifyRing(ring) {
  const half = Math.floor(ring.length / 2);
  const out = [...simplifyLine(ring.slice(0, half + 1)).slice(0, -1), ...simplifyLine(ring.slice(half))];
  return out.length >= 4 ? out : ring;
}

const roundPoint = ([lng, lat]) => [Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];
const simplifyPolygon = (polygon) => polygon.map((ring) => simplifyRing(ring).map(roundPoint));

export function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: simplifyPolygon(geometry.coordinates) };
  return { type: "MultiPolygon", coordinates: geometry.coordinates.map(simplifyPolygon) };
}

const input = process.argv[2];
if (input) {
  const raw = readFileSync(input, "utf8");
  const { rows } = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  const comuni = rows.map((row) => ({ c: row.c, n: row.n, g: simplifyGeometry(row.g) }));
  writeFileSync(OUTPUT, JSON.stringify({ source: "public.geo_municipalities", comuni }));
  console.log(`${comuni.length} comuni`);
}
