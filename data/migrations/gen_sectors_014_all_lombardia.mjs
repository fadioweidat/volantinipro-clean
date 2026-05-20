/**
 * Generator: 014_seed_map_sectors_all_lombardia.sql
 * Clips ISTAT municipality polygons into operational delivery sectors
 * for ALL 1,502 Lombardia municipalities.
 *
 * Sector count by area_km2:
 *   < 5  km² → 3 sectors  (piccoli)
 *   5-30 km² → 4 sectors  (medi)
 *   30-80 km² → 6 sectors (grandi)
 *   80-150 km² → 8 sectors (molto grandi)
 *   > 150 km² → 12 sectors (Milano, valli alpine grandi)
 *
 * Usage: node data/migrations/gen_sectors_014_all_lombardia.mjs
 * Output: supabase/migrations/014_seed_map_sectors_all_lombardia.sql
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Grid name lookup: "${cols}x${rows}" → sector names (Nord-first, Ovest-first) ─
const GRID_NAMES = {
  '1x3': ['Nord', 'Centro', 'Sud'],
  '3x1': ['Ovest', 'Centro', 'Est'],
  '2x2': ['Nord-Ovest', 'Nord-Est', 'Sud-Ovest', 'Sud-Est'],
  '2x3': ['Nord-Ovest', 'Nord-Est', 'Centro-Ovest', 'Centro-Est', 'Sud-Ovest', 'Sud-Est'],
  '2x4': ['Nord-Ovest', 'Nord-Est', 'CN-Ovest', 'CN-Est', 'CS-Ovest', 'CS-Est', 'Sud-Ovest', 'Sud-Est'],
  '3x4': [
    'N-Ovest', 'Nord', 'N-Est',
    'CN-Ovest', 'CN-Centro', 'CN-Est',
    'CS-Ovest', 'CS-Centro', 'CS-Est',
    'S-Ovest',  'Sud',       'S-Est',
  ],
};

// ── Determine grid layout ─────────────────────────────────────────────────────
function sectorLayout(areaKm2, bbox) {
  const wide = (bbox.maxLon - bbox.minLon) > (bbox.maxLat - bbox.minLat) * 1.4;
  if (!areaKm2 || areaKm2 <= 5)   return wide ? [3, 1] : [1, 3];
  if (areaKm2 <= 30)               return [2, 2];
  if (areaKm2 <= 80)               return [2, 3];
  if (areaKm2 <= 150)              return [2, 4];
  return [3, 4]; // > 150 km²
}

// ── Grid cell rectangles ──────────────────────────────────────────────────────
// Returns cells top-to-bottom (Nord first) left-to-right (Ovest first).
function makeGridCells(bbox, cols, rows) {
  const { minLon, maxLon, minLat, maxLat } = bbox;
  const dLon = (maxLon - minLon) / cols;
  const dLat = (maxLat - minLat) / rows;
  const cells = [];
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        minLon: minLon + c * dLon,
        maxLon: minLon + (c + 1) * dLon,
        minLat: minLat + r * dLat,
        maxLat: minLat + (r + 1) * dLat,
      });
    }
  }
  return cells;
}

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
      if (pl.axis === 'lon') { const t = (pl.val - ax) / dx; return [pl.val, ay + t * dy]; }
      const t = (pl.val - ay) / dy; return [ax + t * dx, pl.val];
    };

    for (let i = 0; i < inp.length; i++) {
      const curr = inp[i], prev = inp[(i - 1 + inp.length) % inp.length];
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

// ── Main sector generator ─────────────────────────────────────────────────────
function generateSectors(ring, areaKm2) {
  const lons = ring.map(p => p[0]);
  const lats = ring.map(p => p[1]);
  const bbox = {
    minLon: Math.min(...lons), maxLon: Math.max(...lons),
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
  };

  const [cols, rows] = sectorLayout(areaKm2, bbox);
  const key = `${cols}x${rows}`;
  const names = GRID_NAMES[key] ?? [];
  const cells = makeGridCells(bbox, cols, rows);

  const sectors = [];
  cells.forEach((rect, i) => {
    const clipped = clipPolygonToRect(ring, rect);
    const closed  = closeRing(clipped);
    if (!closed || closed.length < 4) return; // degenerate cell — skip
    sectors.push({
      number: sectors.length + 1,
      name:   names[i] ?? `Zona ${sectors.length + 1}`,
      wkt:    ringToWKT(closed),
    });
  });

  return sectors;
}

// ── Load ISTAT data ───────────────────────────────────────────────────────────
const geoPath = path.resolve(__dirname, '../istat/processed/geo_municipalities_lombardia.json');
const allMunis = JSON.parse(readFileSync(geoPath, 'utf8'));

process.stderr.write(`Loaded ${allMunis.length} municipalities from ISTAT\n`);

// ── Counters ──────────────────────────────────────────────────────────────────
let totalMunis = 0, totalSectors = 0, skippedNoGeom = 0, skippedNoSectors = 0;
const sectorDist = {}; // n → count of municipalities

// ── Build SQL ─────────────────────────────────────────────────────────────────
const parts = [];

parts.push(`-- Migration 014: Operational sectors for ALL ${allMunis.length} Lombardia municipalities`);
parts.push(`-- Generated from geo_municipalities_lombardia.json (ISTAT WGS84 polygons)`);
parts.push(`-- Sector thresholds: <5km²→3  5-30→4  30-80→6  80-150→8  >150→12`);
parts.push(`-- Supersedes migrations 011/012/013 for service_type='d2d'.`);
parts.push(`-- Safe to re-run: clears all d2d sectors then re-inserts.`);
parts.push(`-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/mqkelrsvksrzrpmbstvd/sql/new`);
parts.push(``);
parts.push(`-- ── Clear all existing D2D sectors ─────────────────────────────────────────`);
parts.push(`DELETE FROM public.map_sectors WHERE service_type = 'd2d';`);
parts.push(``);

for (const muni of allMunis) {
  if (!muni.geom_geojson || !muni.municipality_code) { skippedNoGeom++; continue; }

  // Extract outer ring (largest ring for MultiPolygon)
  let ring;
  const gj = muni.geom_geojson;
  if (gj.type === 'Polygon') {
    ring = gj.coordinates[0];
  } else if (gj.type === 'MultiPolygon') {
    ring = gj.coordinates.reduce((best, poly) =>
      poly[0].length > best.length ? poly[0] : best, []);
  }

  if (!ring?.length) { skippedNoGeom++; continue; }

  const sectors = generateSectors(ring, muni.area_km2 || 0);
  if (!sectors.length) { skippedNoSectors++; continue; }

  const code = muni.municipality_code;
  const n    = sectors.length;
  sectorDist[n] = (sectorDist[n] || 0) + 1;

  parts.push(`-- ${muni.municipality_name} (${code}) ${muni.area_km2 ? muni.area_km2.toFixed(1) + 'km²' : ''}`);
  parts.push(`INSERT INTO public.map_sectors (service_type, municipality_code, sector_number, sector_name, geometry) VALUES`);
  const vals = sectors.map(s =>
    `  ('d2d', '${code}', ${s.number}, '${s.name}', ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText('${s.wkt}', 4326)), 3)))`
  );
  parts.push(vals.join(',\n') + ';');
  parts.push('');

  totalMunis++;
  totalSectors += n;

  if (totalMunis % 250 === 0) process.stderr.write(`  Processed ${totalMunis}/${allMunis.length}...\n`);
}

// ── SQL Validation block (runs after all inserts, inside same transaction) ────
parts.push(`-- ── Validazione (eseguita dopo tutti gli INSERT) ──────────────────────────────`);
parts.push(`DO $$`);
parts.push(`DECLARE`);
parts.push(`  v_empty      integer;`);
parts.push(`  v_invalid    integer;`);
parts.push(`  v_wrong_srid integer;`);
parts.push(`  v_zero_area  integer;`);
parts.push(`  v_munis      integer;`);
parts.push(`  v_sectors    integer;`);
parts.push(`BEGIN`);
parts.push(`  SELECT COUNT(*) INTO v_empty`);
parts.push(`    FROM public.map_sectors WHERE service_type = 'd2d' AND ST_IsEmpty(geometry);`);
parts.push(`  SELECT COUNT(*) INTO v_invalid`);
parts.push(`    FROM public.map_sectors WHERE service_type = 'd2d' AND NOT ST_IsValid(geometry);`);
parts.push(`  SELECT COUNT(*) INTO v_wrong_srid`);
parts.push(`    FROM public.map_sectors WHERE service_type = 'd2d' AND ST_SRID(geometry) != 4326;`);
parts.push(`  SELECT COUNT(*) INTO v_zero_area`);
parts.push(`    FROM public.map_sectors`);
parts.push(`    WHERE service_type = 'd2d'`);
parts.push(`      AND round((ST_Area(geometry::geography) / 1e6)::numeric, 6) <= 0;`);
parts.push(`  SELECT COUNT(DISTINCT municipality_code), COUNT(*)`);
parts.push(`    INTO v_munis, v_sectors`);
parts.push(`    FROM public.map_sectors WHERE service_type = 'd2d';`);
parts.push(`  RAISE NOTICE '── Migration 014 — Riepilogo validazione ─────────────────────────';`);
parts.push(`  RAISE NOTICE 'Comuni processati  : %', v_munis;`);
parts.push(`  RAISE NOTICE 'Settori generati   : %', v_sectors;`);
parts.push(`  RAISE NOTICE 'Geometrie vuote    : % (atteso 0)', v_empty;`);
parts.push(`  RAISE NOTICE 'Geometrie invalide : % (atteso 0)', v_invalid;`);
parts.push(`  RAISE NOTICE 'SRID errati        : % (atteso 0)', v_wrong_srid;`);
parts.push(`  RAISE NOTICE 'Area zero          : % (atteso 0)', v_zero_area;`);
parts.push(`  IF v_empty      > 0 THEN RAISE EXCEPTION 'Trovate % geometrie vuote',            v_empty;      END IF;`);
parts.push(`  IF v_invalid    > 0 THEN RAISE EXCEPTION 'Trovate % geometrie non valide (ST_IsValid)', v_invalid; END IF;`);
parts.push(`  IF v_wrong_srid > 0 THEN RAISE EXCEPTION '% geometrie con SRID != 4326',         v_wrong_srid; END IF;`);
parts.push(`  IF v_zero_area  > 0 THEN RAISE EXCEPTION '% settori con area_km2 = 0',           v_zero_area;  END IF;`);
parts.push(`  IF v_munis < 1400   THEN RAISE EXCEPTION 'Troppo pochi comuni: % (attesi ~1500)', v_munis;      END IF;`);
parts.push(`  RAISE NOTICE 'Validazione SUPERATA ✓';`);
parts.push(`END;`);
parts.push(`$$;`);
parts.push(``);

parts.push(`-- ── Summary ─────────────────────────────────────────────────────────────────`);
parts.push(`-- Municipalities: ${totalMunis}  |  Sectors: ${totalSectors}`);
parts.push(`-- Skipped (no geometry): ${skippedNoGeom}  |  Skipped (empty clip): ${skippedNoSectors}`);
parts.push(`-- Sector distribution: ${JSON.stringify(sectorDist)}`);
parts.push(`--`);
parts.push(`-- Verify after running:`);
parts.push(`-- SELECT COUNT(DISTINCT municipality_code) as comuni, COUNT(*) as settori`);
parts.push(`-- FROM public.map_sectors WHERE service_type = 'd2d';`);
parts.push(`--`);
parts.push(`-- Test specific municipalities:`);
parts.push(`-- SELECT sector_number, sector_name, round(st_area(geometry::geography)/1e6,3) as area_km2`);
parts.push(`-- FROM public.map_sectors WHERE municipality_code='015146' ORDER BY sector_number; -- Milano`);

// ── Write output ──────────────────────────────────────────────────────────────
const outPath = path.resolve(__dirname, '../../supabase/migrations/014_seed_map_sectors_all_lombardia.sql');
writeFileSync(outPath, parts.join('\n') + '\n', 'utf8');

process.stderr.write(`\n── Done ─────────────────────────────────────────────────────────────────────\n`);
process.stderr.write(`  Municipalities : ${totalMunis}\n`);
process.stderr.write(`  Sectors total  : ${totalSectors}\n`);
process.stderr.write(`  Skipped        : ${skippedNoGeom + skippedNoSectors}\n`);
process.stderr.write(`  Sector dist.   : ${JSON.stringify(sectorDist)}\n`);
process.stderr.write(`  Output         : ${outPath}\n`);
