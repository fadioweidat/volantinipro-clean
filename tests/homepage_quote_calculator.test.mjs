import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankMunicipalitySuggestions } from "../src/lib/geocoding/searchItalianMunicipalities.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const CALC = read("src/components/home/HomeQuoteCalculator.jsx");
const SECTION = read("src/components/home/QuantityValueSection.jsx");
const QUICK = read("src/pages/public/QuickQuotePage.jsx");

test("homepage calculator shows no hardcoded territorial figures", () => {
  for (const src of [CALC, SECTION]) {
    assert.doesNotMatch(src, /9\.297|10\.227|Valore dimostrativo/);
  }
  assert.match(SECTION, /<HomeQuoteCalculator onConfigure=\{onConfigure\} \/>/);
});

test("calculator reuses the configurator pipeline (same request as Quick Quote, same quantity rule as Step 2)", () => {
  assert.match(CALC, /useServiceAnalysis\(\s*comune\?\.lat, comune\?\.lng, SINGLE_COMUNE_RADIUS_KM, 'd2d', comune\?\.name \|\| null, null, 'comune', null, comune \? 'municipality' : null, null/);
  assert.match(CALC, /apiToZones\(data, null\)/);
  assert.match(CALC, /getZoneFullCoverageFlyers\(zone\)/);
  assert.match(CALC, /searchItalianMunicipalities\(query/);
});

test("calculator distinguishes no-data from outages and always keeps the configurator CTA", () => {
  assert.match(CALC, /error === 'TERRITORIAL_DATA_NOT_AVAILABLE' \? 'unavailable'/);
  assert.match(CALC, /Non abbiamo dati ISTAT per/);
  assert.match(CALC, /Dati territoriali non disponibili per/);
  assert.match(CALC, /Calcola il preventivo online/);
});

test("Quick Quote and homepage share one comune search (no duplicated Nominatim query)", () => {
  assert.match(QUICK, /searchItalianMunicipalities\(comuneInput\)/);
  assert.doesNotMatch(QUICK, /nominatim\.openstreetmap\.org\/search/);
  assert.doesNotMatch(CALC, /nominatim\.openstreetmap\.org/);
});

test("ranking keeps exact/prefix matches first (unchanged from Quick Quote)", () => {
  const ranked = rankMunicipalitySuggestions([{ name: "Varese" }, { name: "Varedo" }], "vared");
  assert.deepEqual(ranked.map((s) => s.name), ["Varedo", "Varese"]);
});

test("configurator link and suggestion dedup", async () => {
  // JSX module: load through the same tsx loader the suite uses.
  const { buildConfiguratorHref, uniqueByComune } = await import("../src/components/home/HomeQuoteCalculator.jsx");
  assert.equal(buildConfiguratorHref("Cormano"), "/configuratore?service=d2d&comune=Cormano&source=homepage_calculator");
  assert.equal(buildConfiguratorHref("Sesto San Giovanni"), "/configuratore?service=d2d&comune=Sesto+San+Giovanni&source=homepage_calculator");
  const list = uniqueByComune([{ name: "Cormano", province: "Milano" }, { name: "Cormano", province: "Milano" }, { name: "Cormano", province: "Altro" }]);
  assert.equal(list.length, 2);
});

test("calculator shows no step tabs (only step 1 exists on the homepage)", () => {
  assert.doesNotMatch(CALC, /vpq-example-steps|Quantità e servizi|Percorso nel configuratore/);
});
