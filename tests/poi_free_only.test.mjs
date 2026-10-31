import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildPoiAnalysis } from "../src/lib/analysis/poiAnalysisAdapter.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const poi = (category, lat, priority = 5) => ({ name: category, category, lat, lng: 9.04, priority });
const pois = [poi("Stazione", 45.53, 10), poi("Scuola", 45.531, 8), poi("Supermercato", 45.532), poi("Farmacia", 45.533), poi("Bar", 45.534, 4), poi("Studio legale", 45.535)];

test("Hand to Hand gets the same fields as the old function, from real POI", () => {
  const { values, metadata, sources, error } = buildPoiAnalysis({ pois, lat: 45.53, lng: 9.04, radiusKm: 3, service: "h2h" });
  assert.equal(error, undefined);
  assert.equal(values.poi_count, 6);
  assert.equal(values.transit_points, 1);
  assert.equal(values.schools_events_count, 1);
  assert.deepEqual(sources, ["OpenStreetMap"]);
  assert.equal(metadata.hotspots[0].category, "Stazione");
  for (const key of ["potential_flow", "reach_score", "roi_score", "confidence_score"]) assert.ok(values[key] >= 0 && values[key] <= 100, key);
});

test("Business gets activity and category fields", () => {
  const { values } = buildPoiAnalysis({ pois, lat: 45.53, lng: 9.04, radiusKm: 3, service: "b2b" });
  assert.equal(values.detected_activities, 3);
  assert.equal(values.target_activities_count, 4);
  assert.ok(values.top_categories.length > 0);
});

test("no POI means no invented numbers", () => {
  const out = buildPoiAnalysis({ pois: [], lat: 45.53, lng: 9.04, radiusKm: 3, service: "h2h" });
  assert.equal(out.error, "POI_DATA_NOT_AVAILABLE");
  assert.deepEqual(out.values, {});
});

test("paid providers are off in code and the site no longer calls them", () => {
  const fn = read("supabase/functions/analysis-poi-search/index.ts");
  assert.match(fn, /const PAID_POI_PROVIDERS_ENABLED = false;/);
  assert.match(fn, /PAID_POI_PROVIDERS_ENABLED \? await googlePlacesProvider/);
  assert.match(fn, /PAID_POI_PROVIDERS_ENABLED \? await foursquareProvider/);
  const hook = read("src/hooks/useServiceAnalysis.js");
  assert.ok(hook.indexOf("fetchPoiAnalysis({") < hook.indexOf("response = await fetch(url"));
  const walk = (dir) => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
  const code = walk(fileURLToPath(new URL("../src", import.meta.url))).filter((file) => /\.(js|jsx)$/.test(file));
  for (const file of code) assert.doesNotMatch(readFileSync(file, "utf8"), /places.googleapis|maps.googleapis|api.foursquare/, file);
});
