// 2026-10-23: address_points leaves the database (option B). Only its own objects are
// dropped, never with CASCADE; the Civici layer is no longer offered by any service.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERVICE_LAYERS } from "../src/lib/services/service-config.js";

const sql = readFileSync(new URL("../supabase/migrations/20261023233000_drop_address_points.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = sql.replace(/^--.*$/gm, "");

test("drops exactly the table and its 8 functions, without CASCADE", () => {
  const drops = [...code.matchAll(/DROP (FUNCTION|TABLE) IF EXISTS "public"\."([a-z_]+)"/g)].map((m) => m[2]);
  assert.deepEqual(drops.sort(), [
    "address_points", "get_address_points_bbox", "get_address_points_in_radius", "get_address_points_osm_in_radius",
    "get_address_points_radius_summary", "materialize_dbgt_address_points", "sync_address_points_geom",
    "touch_address_points_updated_at", "upsert_address_points_batch",
  ]);
  assert.doesNotMatch(code, /CASCADE|TRUNCATE|DELETE|ALTER/i);
  assert.ok(code.indexOf("DROP TABLE") > code.indexOf("upsert_address_points_batch"), "RPCs dropped before the table");
  assert.ok(code.indexOf("sync_address_points_geom") > code.indexOf("DROP TABLE"), "trigger functions after the table");
});

test("no Step 2 service can turn the Civici layer back on", () => {
  for (const cfg of Object.values(SERVICE_LAYERS)) assert.ok(!cfg.layers.some((l) => l.id === "civici"));
});
