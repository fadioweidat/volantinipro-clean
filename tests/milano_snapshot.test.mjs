// "Milano intera" snapshot for the homepage calculator and Preventivo Rapido:
// valid -> used without any request; missing/corrupt -> null -> live request.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MILANO_NIL_COUNT, MILANO_SNAPSHOT_ROW_FIELDS, formatMilanoSnapshotDate, pickMilanoSnapshotData, validateMilanoSnapshot } from "../src/lib/quote/milanoSnapshot.js";
import { buildHomeCalculatorAnalysisArgs } from "../src/lib/quote/homeCalculatorAnalysis.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const committed = JSON.parse(read("src/lib/quote/milanoWholeCitySnapshot.json"));
const clone = (o) => JSON.parse(JSON.stringify(o));

test("committed snapshot is a complete Milano intera with real figures", () => {
  const v = validateMilanoSnapshot(committed);
  assert.ok(v, "snapshot passes validation");
  assert.match(v.dateLabel, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(v.analysis.kind, "milano");
  assert.equal(v.analysis.nilCount, MILANO_NIL_COUNT);
  assert.ok(v.analysis.families > 700000 && v.analysis.recommended > v.analysis.families);
  assert.equal(v.analysis.coverage, 100);
});

test("snapshot was made with the same request as the live one", () => {
  const [lat, lng, radius, , , , , analysisLevel, selectionScope, codes] = buildHomeCalculatorAnalysisArgs({ name: "Milano", lat: committed.request.lat, lng: committed.request.lng });
  assert.deepEqual(committed.request, { lat, lng, radius, analysisLevel, selectionScope, selectedMunicipalityCodes: codes });
});

test("snapshot holds only what the calculator reads (no geometry, OMI, scores or keys)", () => {
  const raw = read("src/lib/quote/milanoWholeCitySnapshot.json");
  assert.doesNotMatch(raw, /geometry|omi_|reach_score|roi_score|apikey|eyJ|sb_publishable|sb_secret/i);
  for (const row of committed.data.comuni_breakdown) {
    for (const key of Object.keys(row)) assert.ok(MILANO_SNAPSHOT_ROW_FIELDS.includes(key), key);
  }
  const picked = pickMilanoSnapshotData({ values: { famiglie_stimate: 1, reach_score: 9 }, metadata: { warnings: ["MAPBOX_UNAVAILABLE:MAPBOX_403", "MILANO_NIL_COMPLETE_INCOMPLETE_OR_DUPLICATED: x"], omi: {} }, comuni_breakdown: [{ nil_code: "1", geometry_geojson: "{}", households_total: 5 }] });
  assert.deepEqual(picked, { values: { famiglie_stimate: 1 }, comuni_breakdown: [{ nil_code: "1", households_total: 5 }], metadata: { warnings: ["MILANO_NIL_COMPLETE_INCOMPLETE_OR_DUPLICATED: x"] } });
});

test("missing, partial or corrupt snapshot -> null (live request)", () => {
  const now = Date.parse("2026-10-22T15:00:00Z");
  const bad = [
    ["missing", undefined],
    ["wrong version", { ...clone(committed), version: 2 }],
    ["future date", { ...clone(committed), generatedAt: "2030-01-01T00:00:00Z" }],
    ["invalid date", { ...clone(committed), generatedAt: "ieri" }],
    ["partial (87 NIL)", (() => { const c = clone(committed); c.data.comuni_breakdown.pop(); return c; })()],
    ["duplicated NIL", (() => { const c = clone(committed); c.data.comuni_breakdown[1].nil_code = c.data.comuni_breakdown[0].nil_code; return c; })()],
    ["not NIL rows", (() => { const c = clone(committed); c.data.comuni_breakdown[0].territory_level = "comune"; return c; })()],
    ["incomplete warning", (() => { const c = clone(committed); c.data.metadata.warnings = ["MILANO_NIL_COMPLETE_INCOMPLETE_OR_DUPLICATED: expected 88"]; return c; })()],
    ["no families", (() => { const c = clone(committed); c.data.comuni_breakdown.forEach((r) => { delete r.households_in_radius; delete r.households_total; delete r.volantini_nel_raggio; }); return c; })()],
    ["error payload", { ...clone(committed), data: { ...committed.data, error: "TERRITORIAL_DATA_NOT_AVAILABLE" } }],
  ];
  for (const [label, snap] of bad) assert.equal(validateMilanoSnapshot(snap, now), null, label);
  assert.ok(validateMilanoSnapshot(clone(committed), now));
  assert.equal(formatMilanoSnapshotDate("2026-10-22T22:30:00Z"), "23/10/2026");
});

test("pages: snapshot first, live request only without it; Step 2 untouched", () => {
  const source = read("src/lib/quote/milanoSnapshotSource.js");
  assert.match(source, /import\.meta\.glob\('\.\/milanoWholeCitySnapshot\.json', \{ eager: true, import: 'default' \}\)/);
  const calc = read("src/components/home/HomeQuoteCalculator.jsx");
  assert.match(calc, /const milanoSnapshot = isMilanoComune\(comune\) \? MILANO_SNAPSHOT : null;/);
  assert.match(calc, /useServiceAnalysis\(\.\.\.buildHomeCalculatorAnalysisArgs\(milanoSnapshot \? null : comune\)\)/);
  assert.match(calc, /: milanoSnapshot \? 'ready'/);
  assert.match(calc, /Dati ISTAT aggiornati al \{milanoSnapshot\.dateLabel\}/);
  const quick = read("src/pages/public/QuickQuotePage.jsx");
  assert.match(quick, /useServiceAnalysis\(\.\.\.buildHomeCalculatorAnalysisArgs\(service === "d2d" && !milanoSnapshot \? milanoComune : null\)\)/);
  assert.match(quick, /const milano = milanoSnapshot \? milanoSnapshot\.analysis :/);
  assert.doesNotMatch(read("src/pages/public/configurator/Step2.jsx"), /milanoSnapshot|MILANO_SNAPSHOT/);
  assert.match(JSON.parse(read("package.json")).scripts["snapshot:milano"], /scripts\/snapshot-milano\.mjs/);
  assert.match(read("TODO.md"), /Rigenerare snapshot Milano/);
});
