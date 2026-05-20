/**
 * Import real operational sectors for Varedo into map_sectors.
 *
 * Uses Varedo's actual polygon from geo_municipalities (already in DB) and
 * subdivides it into 4 sectors via Sutherland-Hodgman polygon clipping.
 * All geometry stays in WGS84 (EPSG:4326).
 *
 * Usage: node data/migrations/import_varedo_sectors.mjs
 */

import process from 'node:process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Sutherland-Hodgman polygon clipping against an axis-aligned rectangle ───
// Returns clipped polygon (array of [lon, lat] points), or [] if fully outside.
function clipPolygonToRect(poly, { minLon, maxLon, minLat, maxLat }) {
  // Clip planes: left, right, bottom, top
  const planes = [
    { axis: 'lon', dir: '>',  val: minLon },
    { axis: 'lon', dir: '<',  val: maxLon },
    { axis: 'lat', dir: '>',  val: minLat },
    { axis: 'lat', dir: '<',  val: maxLat },
  ];

  let output = [...poly];

  for (const plane of planes) {
    if (output.length === 0) return [];
    const input = output;
    output = [];

    const inside = (p) => {
      const v = plane.axis === 'lon' ? p[0] : p[1];
      return plane.dir === '>' ? v >= plane.val : v <= plane.val;
    };

    const intersect = (a, b) => {
      const [ax, ay] = a, [bx, by] = b;
      const dx = bx - ax, dy = by - ay;
      let t;
      if (plane.axis === 'lon') {
        t = (plane.val - ax) / dx;
        return [plane.val, ay + t * dy];
      } else {
        t = (plane.val - ay) / dy;
        return [ax + t * dx, plane.val];
      }
    };

    for (let i = 0; i < input.length; i++) {
      const curr = input[i];
      const prev = input[(i - 1 + input.length) % input.length];
      const currIn = inside(curr);
      const prevIn = inside(prev);

      if (currIn) {
        if (!prevIn) output.push(intersect(prev, curr));
        output.push(curr);
      } else if (prevIn) {
        output.push(intersect(prev, curr));
      }
    }
  }

  return output;
}

// Ensure polygon is closed (first == last point).
function closeRing(ring) {
  if (ring.length < 3) return null;
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return ring;
}

// Build a GeoJSON MultiPolygon WKT string for PostgREST insertion.
function ringToWKT(ring) {
  const pts = ring.map(p => `${p[0]} ${p[1]}`).join(', ');
  return `MULTIPOLYGON(((${pts})))`;
}

// ── Load Varedo geometry ──────────────────────────────────────────────────────
const geoFile = path.resolve(__dirname, '../istat/processed/geo_municipalities_lombardia.json');
const allMunis = JSON.parse(readFileSync(geoFile, 'utf8'));
const varedo   = allMunis.find(m => m.municipality_name?.toLowerCase() === 'varedo');

if (!varedo?.geom_geojson) {
  console.error('✗ Varedo geometry not found in processed ISTAT data');
  process.exit(1);
}

const varedoRing = varedo.geom_geojson.coordinates[0]; // outer ring [[lon,lat],...]
const { municipality_code } = varedo;

// Bounding box
const lons = varedoRing.map(p => p[0]);
const lats = varedoRing.map(p => p[1]);
const bbox = {
  minLon: Math.min(...lons), maxLon: Math.max(...lons),
  minLat: Math.min(...lats), maxLat: Math.max(...lats),
};
const midLon = (bbox.minLon + bbox.maxLon) / 2;
const midLat = (bbox.minLat + bbox.maxLat) / 2;

// ── Define 4 sectors (2×2 grid) ───────────────────────────────────────────
const GRID = [
  { number: 1, name: 'Nord-Ovest', rect: { minLon: bbox.minLon, maxLon: midLon, minLat: midLat, maxLat: bbox.maxLat } },
  { number: 2, name: 'Nord-Est',   rect: { minLon: midLon,       maxLon: bbox.maxLon, minLat: midLat, maxLat: bbox.maxLat } },
  { number: 3, name: 'Sud-Ovest',  rect: { minLon: bbox.minLon, maxLon: midLon, minLat: bbox.minLat, maxLat: midLat } },
  { number: 4, name: 'Sud-Est',    rect: { minLon: midLon,       maxLon: bbox.maxLon, minLat: bbox.minLat, maxLat: midLat } },
];

// Clip Varedo polygon to each grid cell
const sectors = GRID.map(cell => {
  const clipped = clipPolygonToRect(varedoRing, cell.rect);
  const closed  = closeRing(clipped);
  if (!closed || closed.length < 4) return null;
  return {
    ...cell,
    wkt: ringToWKT(closed),
    pointCount: closed.length,
  };
}).filter(Boolean);

if (sectors.length === 0) {
  console.error('✗ Polygon clipping produced no sectors — geometry issue');
  process.exit(1);
}

console.log(`\n── Varedo Sectors (${sectors.length} sectors from ${varedoRing.length}-point polygon)`);
sectors.forEach(s => console.log(`  S${s.number} ${s.name}: ${s.pointCount} pts`));

// ── Insert via Supabase REST API ───────────────────────────────────────────
async function supabasePost(path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { body: json });
  return json;
}

async function checkTableExists() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/map_sectors?limit=0`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.status !== 404;
}

async function importSectors() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('✗ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('\n  Checking if map_sectors table exists …');
  const tableOk = await checkTableExists();
  if (!tableOk) {
    console.log('\n✗ map_sectors table does not exist yet.\n');
    console.log('  Run the DDL migration first:');
    console.log('  → node data/migrations/run_migration.mjs');
    console.log('  OR paste data/migrations/001_map_sectors.sql in the Supabase SQL Editor.\n');
    process.exit(2);
  }
  console.log('  Table exists ✓');

  // Delete any existing Varedo sectors (idempotent)
  console.log('\n  Clearing existing Varedo sectors …');
  const delRes = await fetch(
    `${SUPABASE_URL}/rest/v1/map_sectors?municipality_code=eq.${municipality_code}`,
    {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
    }
  );
  if (!delRes.ok) {
    const t = await delRes.text();
    console.log(`  ⚠ DELETE returned ${delRes.status}: ${t.substring(0, 100)}`);
  } else {
    console.log('  Cleared ✓');
  }

  // Insert new sectors
  console.log('\n  Inserting sectors …');
  let inserted = 0;
  for (const s of sectors) {
    try {
      // Use PostgREST with ST_GeomFromText to insert WKT geometry
      const result = await supabasePost('/rest/v1/rpc/insert_map_sector', {
        p_service_type:      'd2d',
        p_municipality_code: municipality_code,
        p_sector_number:     s.number,
        p_sector_name:       s.name,
        p_geometry_wkt:      s.wkt,
      });
      console.log(`  ✓ S${s.number} ${s.name} inserted`);
      inserted++;
    } catch (err) {
      // insert_map_sector RPC might not exist — fall back to raw INSERT via upsert
      if (err.body?.code === '404' || err.body?.message?.includes('does not exist')) {
        try {
          // Alternative: use the PostgREST insert endpoint with a cast trick
          // PostgREST v11+ supports ST_GeomFromText via the column:wkt format
          const row = {
            service_type:      'd2d',
            municipality_code: municipality_code,
            sector_number:     s.number,
            sector_name:       s.name,
            // geometry as well-known text — PostgREST passes this as-is to PostgreSQL
            // The column type is geometry so PostgreSQL will cast the WKT automatically
            geometry:          s.wkt,
          };
          await supabasePost('/rest/v1/map_sectors', row);
          console.log(`  ✓ S${s.number} ${s.name} inserted (direct)`);
          inserted++;
        } catch (err2) {
          console.log(`  ✗ S${s.number} ${s.name} failed: ${err2.message}`);
          if (err2.body) console.log(`    Body: ${JSON.stringify(err2.body).substring(0, 150)}`);
        }
      } else {
        console.log(`  ✗ S${s.number} ${s.name} failed: ${err.message}`);
        if (err.body) console.log(`    Body: ${JSON.stringify(err.body).substring(0, 150)}`);
      }
    }
  }

  if (inserted > 0) {
    console.log(`\n  ✓ Imported ${inserted}/${sectors.length} sectors for Varedo (${municipality_code})`);
    console.log('\n  Test endpoint:');
    console.log(`  curl -s "${SUPABASE_URL}/rest/v1/rpc/get_map_sectors" \\`);
    console.log(`    -H "apikey: ${SERVICE_KEY.substring(0, 20)}..." \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -X POST -d '{"p_service_type":"d2d","p_center_lat":45.598,"p_center_lng":9.166,"p_radius_km":3}'`);
  } else {
    console.log('\n  ✗ No sectors inserted.');
    console.log('\n  The direct INSERT approach may fail because geometry WKT strings');
    console.log('  need to be inserted via ST_GeomFromText() in SQL.');
    console.log('\n  Alternative: run this SQL in the Supabase Dashboard SQL Editor:');
    printFallbackSQL(sectors, municipality_code);
  }
}

function printFallbackSQL(sectors, code) {
  console.log('\n────────────────── COPY AND RUN IN SUPABASE SQL EDITOR ──────────────────');
  console.log('-- First run 001_map_sectors.sql if not done yet.\n');
  console.log(`DELETE FROM public.map_sectors WHERE municipality_code = '${code}';\n`);
  console.log('INSERT INTO public.map_sectors (service_type, municipality_code, sector_number, sector_name, geometry) VALUES');
  const values = sectors.map((s, i) =>
    `  ('d2d', '${code}', ${s.number}, '${s.name}', ST_GeomFromText('${s.wkt}', 4326))`
  );
  console.log(values.join(',\n') + ';\n');
  console.log('────────────────────────────────────────────────────────────────────────\n');
}

importSectors().catch(err => {
  console.error('\n✗ Import failed:', err.message);
  process.exit(1);
});
