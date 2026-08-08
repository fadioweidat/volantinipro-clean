import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const migration = fs.readFileSync(new URL("../supabase/migrations/20260805000010_gtfs_routes_stop_times.sql", import.meta.url), "utf8");
const poiMigration = fs.readFileSync(new URL("../supabase/migrations/20260805000011_poi_cache_radius.sql", import.meta.url), "utf8");
const poiFunction = fs.readFileSync(new URL("../supabase/functions/analysis-poi-search/index.ts", import.meta.url), "utf8");
const step2Map = fs.readFileSync(new URL("../src/components/Step2Map.jsx", import.meta.url), "utf8");
const nilMigration = fs.readFileSync(new URL("../supabase/migrations/20260805000012_milano_nil_pgt2030.sql", import.meta.url), "utf8");
const addressClient = fs.readFileSync(new URL("../src/lib/services/address-points-api.js", import.meta.url), "utf8");
const addressImporter = fs.readFileSync(new URL("../scripts/import_osm_addresses.mjs", import.meta.url), "utf8");
const addressRadiusMigration = fs.readFileSync(new URL("../supabase/migrations/20260805000013_address_points_radius_summary.sql", import.meta.url), "utf8");
const realNilToleranceMigration = fs.readFileSync(new URL("../supabase/migrations/20260805000014_real_nil_geometry_tolerance.sql", import.meta.url), "utf8");

test("official test pipeline includes territorial data import contracts", () => {
  assert.match(packageJson.scripts.test, /tests\/territorial_data_import\.test\.mjs/);
  assert.equal(fs.existsSync(new URL("../scripts/import_gtfs.mjs", import.meta.url)), true);
});

test("Step 2 map uses a real tokenless CARTO/OSM tile fallback, with automatic runtime fallback from Mapbox to CARTO on tile errors", () => {
  assert.match(step2Map, /if \(mbToken\)[\s\S]+mapbox[\s\S]+else[\s\S]+buildCartoLayer/);
  assert.match(step2Map, /attribution: CARTO_ATTR/);
  // Fallback automatico Mapbox -> CARTO a runtime (401/403 su token con
  // restrizione di dominio): un solo swap per sessione mappa, mai un loop.
  assert.match(step2Map, /fallbackTriggered/);
  assert.match(step2Map, /cartoFallback\.on\('tileerror', showMapErrorMsg\)/);
});

test("POI provider reads real cached coordinates in radius without D2D substitution", () => {
  assert.match(poiMigration, /st_dwithin/i);
  assert.match(poiMigration, /p\.geom is not null/i);
  assert.match(poiMigration, /revoke execute[\s\S]+from anon, authenticated/i);
  assert.match(poiFunction, /cachedPoiDbProvider/);
  assert.doesNotMatch(poiFunction, /map_sectors/);
});

test("GTFS activation persists routes and stop times with source-scoped deduplication", () => {
  assert.match(migration, /create table if not exists public\.gtfs_routes/i);
  assert.match(migration, /create table if not exists public\.gtfs_stop_times/i);
  assert.match(migration, /unique \(source, route_id\)/i);
  assert.match(migration, /unique \(source, trip_id, stop_sequence\)/i);
  assert.match(migration, /revoke execute[\s\S]+from anon, authenticated/i);
});

test("NIL schema is idempotent, spatially validated and has no embedded dataset", () => {
  assert.match(nilMigration, /create table if not exists public\.geo_municipality_nil/i);
  assert.match(nilMigration, /nil_code text not null unique/i);
  assert.match(nilMigration, /st_isvalid\(geom\)/i);
  assert.match(nilMigration, /st_coveredby\(new\.geom, milano_geom\)/i);
  assert.match(nilMigration, /using gist \(geom\)/i);
  assert.match(nilMigration, /get_nil_breakdown_in_radius/i);
  assert.match(nilMigration, /revoke execute[\s\S]+upsert_milano_nil_batch[\s\S]+from public/i);
  assert.doesNotMatch(nilMigration, /insert into public\.geo_municipality_nil[\s\S]+values\s*\(\s*['"]?1['"]?/i);
});

test("NIL DS964 reali conservano la geometria e usano la tolleranza derivata dall'export", () => {
  assert.match(realNilToleranceMigration, /minimum_inside_ratio constant double precision := 0\.82398/);
  assert.match(realNilToleranceMigration, /reference_export_sha256[\s\S]+81880a5797b8e3d1f36fca96b301ae9f0f38ef6bed0e1bde685f885d62f04a42/);
  assert.match(realNilToleranceMigration, /st_isvalid\(new\.geom\)/i);
  assert.match(realNilToleranceMigration, /st_srid\(new\.geom\) <> 4326/i);
  assert.match(realNilToleranceMigration, /st_intersects\(new\.geom, milano_geom\)/i);
  assert.match(realNilToleranceMigration, /geometry_preserved', true/);
  assert.doesNotMatch(realNilToleranceMigration, /new\.geom\s*:=/i);
  assert.doesNotMatch(realNilToleranceMigration, /st_intersection\(new\.geom/i);
  assert.match(realNilToleranceMigration, /security definer[\s\S]+set search_path = public, pg_temp/i);
  assert.match(realNilToleranceMigration, /grant execute[\s\S]+to anon, authenticated, service_role/i);
});

test("real OSM address importer preserves provenance and municipality filtering", () => {
  assert.match(packageJson.scripts["import:addresses"], /scripts\/import_osm_addresses\.mjs/);
  assert.match(addressImporter, /OpenStreetMap API 0\.6 \/ ODbL/);
  assert.match(addressImporter, /inGeometry\(item\.lng,item\.lat,geom\)/);
  assert.match(addressImporter, /upsert_address_points_batch/);
  assert.match(addressImporter, /addr:housenumber/);
  assert.doesNotMatch(addressImporter, /mock|fixture/i);
});

test("civici client uses the spatial radius RPC and exposes tooltip fields", () => {
  assert.match(addressClient, /rpc\/get_address_points_radius_summary/);
  assert.match(addressClient, /center_lat: centerLat, center_lng: centerLng, radius_km: radiusKm, max_rows: ROW_LIMIT/);
  assert.match(addressRadiusMigration, /st_dwithin/i);
  assert.match(addressRadiusMigration, /using gist \(\(geom::geography\)\)/i);
  assert.match(addressRadiusMigration, /grant select on public\.address_points to anon, authenticated, service_role/i);
  assert.match(addressRadiusMigration, /least\(1500, max_rows\)/i);
  assert.match(addressClient, /via: row\.via/);
  assert.match(addressClient, /numeroCivico: row\.numero_civico/);
  assert.match(step2Map, /point\.via, point\.numeroCivico/);
  assert.match(step2Map, /bindTooltip/);
});
