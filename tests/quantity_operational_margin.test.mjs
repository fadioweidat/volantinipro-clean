// Quick Quote recommends the same quantity as Step 2 (households + the
// operational margin returned by analysis-istat), and the margin shown to the
// customer is derived from the service response, never hardcoded.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeTerritorialCampaign, extractMunicipalityTerritorialData } from "../src/lib/quickQuote/territorialCampaignCalculator.js";
import { formatOperationalMarginNote, getOperationalMarginPct, getZoneFullCoverageFlyers } from "../src/lib/doorToDoorCoverage.js";

// Shape of a real analysis-istat comuni_breakdown row (Cormano, municipality scope).
const CORMANO_ROW = { comune_name: "Cormano", households_total: 9297, households_in_radius: 9297, population_total: 20744, volantini_nel_raggio: 10227 };

test("extractMunicipalityTerritorialData exposes the service flyer field", () => {
  assert.deepEqual(extractMunicipalityTerritorialData(CORMANO_ROW), { households: 9297, population: 20744, recommendedFlyers: 10227 });
  assert.equal(extractMunicipalityTerritorialData(null).recommendedFlyers, null);
});

test("Quick Quote recommended quantity = Step 2 rule (volantini_nel_raggio)", () => {
  const { households, population, recommendedFlyers } = extractMunicipalityTerritorialData(CORMANO_ROW);
  const rows = [{ municipality: "Cormano", households, population, recommendedFlyers, matched: true }];
  const result = computeTerritorialCampaign({ municipalityRows: rows, requestedQuantity: null, service: "d2d" });
  const step2Zone = { families: 9297, volantiniNelRaggio: 10227 };
  assert.equal(result.recommendedQuantity, getZoneFullCoverageFlyers(step2Zone));
  assert.equal(result.recommendedQuantity, 10227);
  assert.equal(result.breakdown[0].households, 9297);
  assert.equal(result.breakdown[0].recommendedQuantity, 10227);
  assert.equal(result.operationalMarginPct, 10);
});

test("proportional split for a partial quantity sums to the requested quantity", () => {
  const rows = [
    { municipality: "A", households: 1000, population: null, recommendedFlyers: 1100, matched: true },
    { municipality: "B", households: 3000, population: null, recommendedFlyers: 3300, matched: true },
  ];
  const result = computeTerritorialCampaign({ municipalityRows: rows, requestedQuantity: 2200, service: "d2d" });
  assert.equal(result.recommendedQuantity, 4400);
  assert.deepEqual(result.breakdown.map((b) => b.requestedQuantity), [550, 1650]);
  assert.equal(result.estimatedCoverage, 50);
});

test("margin percentage and note come from the numbers, not from a constant", () => {
  assert.equal(getOperationalMarginPct(9297, 10227), 10);
  assert.equal(getOperationalMarginPct(1000, 1125), 12.5);
  assert.equal(getOperationalMarginPct(1000, 1000), 0);
  assert.equal(getOperationalMarginPct(null, 1000), null);
  assert.equal(formatOperationalMarginNote(10), "Include margine operativo del 10%");
  assert.equal(formatOperationalMarginNote(12.5), "Include margine operativo del 12,5%");
  assert.equal(formatOperationalMarginNote(0), null);
  assert.equal(formatOperationalMarginNote(null), null);
});

test("the note is shown under the recommended quantity in homepage and Quick Quote", () => {
  const quick = readFileSync(new URL("../src/pages/public/QuickQuotePage.jsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/components/home/HomeQuoteCalculator.jsx", import.meta.url), "utf8");
  assert.match(quick, /formatOperationalMarginNote\(campaign\.operationalMarginPct\)/);
  assert.match(home, /formatOperationalMarginNote\(getOperationalMarginPct\(families, recommended\)\)/);
  for (const src of [quick, home]) assert.doesNotMatch(src, /margine operativo del 10/);
});
