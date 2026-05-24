/**
 * Generator: clips ISTAT municipality polygons into operational sectors.
 * Outputs SQL to stdout — redirect to the migration file.
 *
 * Usage: node data/migrations/gen_sectors_013.mjs > supabase/migrations/013_seed_map_sectors_more_municipalities.sql
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Municipalities to seed — codes verified from geo_municipalities_lombardia.json
const TARGETS = [
  { code: '015086', name: 'Cormano',          sectors: 3 },
  { code: '015032', name: 'Bresso',            sectors: 3 },
  { code: '015166', name: 'Paderno Dugnano',   sectors: 4 },
  { code: '108027', name: 'Limbiate',           sectors: 4 },
  { code: '015206', name: 'Senago',             sectors: 3 },
  { code: '108035', name: 'Nova Milanese',      sectors: 3 },
  { code: '108010', name: 'Bovisio-Masciago',   sectors: 3 },
  { code: '108019', name: 'Cesano Maderno',     sectors: 4 },
  { code: '108023', name: 'Desio',              sectors: 4 },
];

// ── Sutherland-Hodgman polygon clipping ──────────────────────────────────────
function clipPolygonToRect(poly, { minLon, maxLon, minLat, maxLat }) {
  const planes = [
    { axis: 'lon', dir: '>', val: minLon },
    { axis: 'lon', dir: '<', val: maxLon },
    { axis: 'lat', dir: '>', val: minLat },
    { axis: 'lat', dir: '<', val: maxLat },
  ];

  let out = [...poly];

  for (const pl of planes) {
    if (!out.length) return [];
    const inp = out; out = [];

    const inside = (p) => {
      const v = pl.axis === 'lon' ? p[0] : p[1];
      return pl.dir === '>' ? v >= pl.val : v <= pl.val;
    };
    const intersect = (a, b) => {
      const [ax, ay] = a, [bx, by] = b;
      const dx = bx - ax, dy = by - ay;
      if (pl.axis === 'lon') {
        const t = (pl.val - ax) / dx;
        return [pl.val, ay + t * dy];
      }
      const t = (pl.val - ay) / dy;
      return [ax + t * dx, pl.val];
    };

    for (let i = 0; i < inp.length; i++) {
      const curr = inp[i];
      const prev = inp[(i - 1 + inp.length) % inp.length];
      const cIn = inside(curr), pIn = inside(prev);
      if (cIn) { if (!pIn) out.push(intersect(prev, curr)); out.push(curr); }
      else if (pIn) out.push(intersect(prev, curr));
    }
  }
  return out;
}

function closeRing(ring) {
  if (!ring || ring.length < 3) return null;
  const [f, l] = [ring[0], ring[ring.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([...f]);
  return ring;
}

function ringToWKT(ring) {
  return `MULTIPOLYGON(((${ring.map(p => `${p[0].toFixed(8)} ${p[1].toFixed(8)}`).join(', ')})))`;
}

// ── Grid definitions per sector count ────────────────────────────────────────
function makeGrid(bbox, n) {
  const { minLon, maxLon, minLat, maxLat } = bbox;
  const dLon = maxLon - minLon;
  const dLat = maxLat - minLat;

  if (n === 3) {
    // Pick orientation: strip along the longer axis
    if (dLat >= dLon) {
      // Taller than wide → N / Centro / S strips
      const lat1 = minLat + dLat / 3;
      const lat2 = minLat + (2 * dLat) / 3;
      return [
        { number: 1, name: 'Nord',   rect: { minLon, maxLon, minLat: lat2, maxLat } },
        { number: 2, name: 'Centro', rect: { minLon, maxLon, minLat: lat1, maxLat: lat2 } },
        { number: 3, name: 'Sud',    rect: { minLon, maxLon, minLat, maxLat: lat1 } },
      ];
    } else {
      // Wider than tall → O / Centro / E strips
      const lon1 = minLon + dLon / 3;
      const lon2 = minLon + (2 * dLon) / 3;
      return [
        { number: 1, name: 'Ovest',  rect: { minLon, maxLon: lon1, minLat, maxLat } },
        { number: 2, name: 'Centro', rect: { minLon: lon1, maxLon: lon2, minLat, maxLat } },
        { number: 3, name: 'Est',    rect: { minLon: lon2, maxLon, minLat, maxLat } },
      ];
    }
  }

  if (n === 4) {
    // Asymmetric 2×2 (avoids perfectly equal boring quadrants)
    const mLon = minLon + dLon * 0.48;
    const mLat = minLat + dLat * 0.52;
    return [
      { number: 1, name: 'Nord-Ovest', rect: { minLon, maxLon: mLon, minLat: mLat, maxLat } },
      { number: 2, name: 'Nord-Est',   rect: { minLon: mLon, maxLon, minLat: mLat, maxLat } },
      { number: 3, name: 'Sud-Ovest',  rect: { minLon, maxLon: mLon, minLat, maxLat: mLat } },
      { number: 4, name: 'Sud-Est',    rect: { minLon: mLon, maxLon, minLat, maxLat: mLat } },
    ];
  }

  // Fallback 2 sectors
  const mLat = (minLat + maxLat) / 2;
  return [
    { number: 1, name: 'Nord', rect: { minLon, maxLon, minLat: mLat, maxLat } },
    { number: 2, name: 'Sud',  rect: { minLon, maxLon, minLat, maxLat: mLat } },
  ];
}

function generateSectors(ring, n) {
  const lons = ring.map(p => p[0]);
  const lats = ring.map(p => p[1]);
  const bbox = {
    minLon: Math.min(...lons), maxLon: Math.max(...lons),
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
  };

  return makeGrid(bbox, n).map(cell => {
    const clipped = clipPolygonToRect(ring, cell.rect);
    const closed  = closeRing(clipped);
    if (!closed || closed.length < 4) return null;
    return { ...cell, wkt: ringToWKT(closed), pts: closed.length };
  }).filter(Boolean);
}

// ── Load ISTAT data ───────────────────────────────────────────────────────────
const geoFile = path.resolve(__dirname, '../istat/processed/geo_municipalities_lombardia.json');
const allMunis = JSON.parse(readFileSync(geoFile, 'utf8'));

const byCode = {};
for (const m of allMunis) {
  if (m.municipality_code) byCode[m.municipality_code] = m;
}

// ── Build SQL ─────────────────────────────────────────────────────────────────
const lines = [
  `-- Migration 013: Operational sectors seed for Brianza / Nord-Milano municipalities`,
  `-- Real ISTAT polygon geometries (WGS84) clipped into operational delivery zones.`,
  `-- Safe to re-run: uses DELETE + INSERT per municipality.`,
  `-- Run via Supabase Dashboard SQL Editor or \`supabase db push\`.`,
  ``,
];

let totalSectors = 0;
let totalMunis   = 0;

for (const target of TARGETS) {
  const muni = byCode[target.code];
  if (!muni?.geom_geojson) {
    lines.push(`-- SKIP ${target.name} (${target.code}): geometry not found in ISTAT data`);
    continue;
  }

  // Extract outer ring (handle Polygon or MultiPolygon)
  let ring;
  const gj = muni.geom_geojson;
  if (gj.type === 'Polygon') {
    ring = gj.coordinates[0];
  } else if (gj.type === 'MultiPolygon') {
    // Use the largest ring
    ring = gj.coordinates.reduce((best, poly) =>
      poly[0].length > best.length ? poly[0] : best, []);
  }

  if (!ring?.length) {
    lines.push(`-- SKIP ${target.name}: empty ring`);
    continue;
  }

  const sectors = generateSectors(ring, target.sectors);
  if (!sectors.length) {
    lines.push(`-- SKIP ${target.name}: clipping produced no sectors`);
    continue;
  }

  process.stderr.write(`  ✓ ${muni.municipality_name} (${target.code}): ${sectors.length} sectors\n`);

  lines.push(`-- ── ${muni.municipality_name} (${target.code}) ${'─'.repeat(Math.max(0, 54 - muni.municipality_name.length))}`);
  lines.push(`DELETE FROM public.map_sectors`);
  lines.push(`  WHERE municipality_code = '${target.code}' AND service_type = 'd2d';`);
  lines.push(``);
  lines.push(`INSERT INTO public.map_sectors`);
  lines.push(`  (service_type, municipality_code, sector_number, sector_name, geometry)`);
  lines.push(`VALUES`);

  const vals = sectors.map(s =>
    `  ('d2d', '${target.code}', ${s.number}, '${s.name}', ST_GeomFromText('${s.wkt}', 4326))`
  );
  lines.push(vals.join(',\n') + ';');
  lines.push(``);

  totalSectors += sectors.length;
  totalMunis++;
}

lines.push(`-- ── Verify ─────────────────────────────────────────────────────────────────`);
lines.push(`-- SELECT municipality_code, sector_number, sector_name,`);
lines.push(`--        round(st_area(geometry::geography)/1e6, 3) as area_km2`);
lines.push(`-- FROM public.map_sectors`);
lines.push(`-- WHERE service_type = 'd2d' AND municipality_code != '108045'`);
lines.push(`-- ORDER BY municipality_code, sector_number;`);

process.stderr.write(`\nTotal: ${totalSectors} sectors across ${totalMunis} municipalities\n`);
process.stdout.write(lines.join('\n') + '\n');
