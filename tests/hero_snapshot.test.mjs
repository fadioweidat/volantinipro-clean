// Hero scenario snapshot: real analysis-istat data saved by `npm run snapshot:hero`.
// Valid -> used without any live call; missing or corrupt -> null -> live call.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HERO_SCENARIO, normalizeHomepageAnalysis } from "../src/components/home/homepageHeroData.js";
import { HERO_SNAPSHOT_ROW_FIELDS, pickHeroSnapshotData, validateHeroSnapshot, formatSnapshotDate } from "../src/components/home/heroSnapshot.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const committed = JSON.parse(read("src/components/home/heroScenarioSnapshot.json"));
const clone = (o) => JSON.parse(JSON.stringify(o));

test("committed snapshot is valid for the hero scenario and carries real figures", () => {
  const v = validateHeroSnapshot(committed, HERO_SCENARIO);
  assert.ok(v, "snapshot passes validation");
  assert.match(v.dateLabel, /^\d{2}\/\d{2}\/\d{4}$/);
  const a = normalizeHomepageAnalysis(v.data);
  assert.ok(a.families > 0 && a.municipalityCount > 0 && a.familiesShare > 0 && a.familiesShare <= 100);
  assert.equal(a.missingGeometries, 0, "every zone has its border");
});

test("committed snapshot contains only the fields the hero reads (no OMI, no scores, no keys)", () => {
  const raw = read("src/components/home/heroScenarioSnapshot.json");
  assert.doesNotMatch(raw, /omi|reach_score|roi_score|copertura_stimata|apikey|eyJ|sb_publishable|sb_secret/i);
  assert.deepEqual(Object.keys(committed.data).sort(), ["comuni_breakdown", "sources"]);
  for (const row of committed.data.comuni_breakdown) {
    for (const key of Object.keys(row)) assert.ok(HERO_SNAPSHOT_ROW_FIELDS.includes(key), key);
  }
});

test("pickHeroSnapshotData strips everything the hero does not use", () => {
  const picked = pickHeroSnapshotData({
    values: { famiglie_stimate: 1, reach_score: 80 },
    metadata: { omi: { values: [1, 2] } },
    sources: ["ISTAT", "OpenAI", "Dati geografici / PostGIS"],
    comuni_breakdown: [{ comune_name: "Cormano", municipality_code: "015086", households_in_radius: 10, households_total: 10, pct_copertura: 100, geometry_geojson: "{}", age_0_14_pct: 13, average_income: null, density_per_km2: 4625 }],
  });
  assert.deepEqual(Object.keys(picked).sort(), ["comuni_breakdown", "sources"]);
  assert.deepEqual(picked.sources, ["ISTAT", "Dati geografici / PostGIS"]);
  assert.deepEqual(Object.keys(picked.comuni_breakdown[0]).sort(), ["comune_name", "geometry_geojson", "households_in_radius", "households_total", "municipality_code", "pct_copertura"]);
});

test("missing or corrupt snapshot -> null (the hero then makes the live call)", () => {
  // "now" follows the committed snapshot, so refreshing it (npm run snapshot:hero) never breaks the test.
  const now = Date.parse(committed.generatedAt) + 60 * 60 * 1000;
  const bad = [
    ["missing file", undefined],
    ["not an object", "x"],
    ["wrong version", { ...clone(committed), version: 2 }],
    ["other scenario", { ...clone(committed), scenario: { ...committed.scenario, radiusKm: 5 } }],
    ["other comune", { ...clone(committed), scenario: { ...committed.scenario, name: "Seveso" } }],
    ["invalid date", { ...clone(committed), generatedAt: "ieri" }],
    ["future date", { ...clone(committed), generatedAt: "2030-01-01T00:00:00Z" }],
    ["error payload", { ...clone(committed), data: { ...committed.data, error: "TERRITORIAL_DATA_NOT_AVAILABLE" } }],
    ["no rows", { ...clone(committed), data: { comuni_breakdown: [], sources: [] } }],
    ["rows without families", (() => { const c = clone(committed); c.data.comuni_breakdown.forEach((r) => { delete r.households_in_radius; }); return c; })()],
    ["rows without totals (no share)", (() => { const c = clone(committed); c.data.comuni_breakdown.forEach((r) => { delete r.households_total; }); return c; })()],
    ["data missing", (() => { const c = clone(committed); delete c.data; return c; })()],
  ];
  for (const [label, snap] of bad) assert.equal(validateHeroSnapshot(snap, HERO_SCENARIO, now), null, label);
  assert.ok(validateHeroSnapshot(clone(committed), HERO_SCENARIO, now), "the untouched snapshot is still valid");
});

test("date label is Italian dd/mm/yyyy in Europe/Rome", () => {
  assert.equal(formatSnapshotDate("2026-10-20T22:30:00Z"), "21/10/2026");
  assert.equal(formatSnapshotDate("nope"), null);
});

test("hero wiring: eager glob (no build break if deleted), live call only without snapshot, visible date, placeholders", () => {
  const hero = read("src/components/home/VolantiniProHeroMap.jsx");
  assert.match(hero, /import\.meta\.glob\('\.\/heroScenarioSnapshot\.json', \{ eager: true, import: 'default' \}\)/);
  assert.match(hero, /const live = active && !snapshot;/);
  assert.match(hero, /dataDateLabel=\{snapshot\?\.dateLabel \|\| null\}/);
  assert.match(read("src/components/home/HomepageTerritoryMap.jsx"), /\{dataDateLabel&&<span className="vph-map-context-date">Dati ISTAT aggiornati al \{dataDateLabel\}<\/span>\}/);
  assert.match(hero, /const pending = snapshot \? false : \(!error && !data \|\| loading\);/);
  const css = read("src/components/home/homepage-hero.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.vph-skeleton \{ animation:none;/);
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts["snapshot:hero"], /scripts\/snapshot-hero\.mjs/);
  assert.match(read("TODO.md"), /Rigenerare snapshot hero quando ISTAT pubblica nuovi dati/);
});
