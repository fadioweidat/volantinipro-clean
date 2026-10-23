// Coverage weighted by families (TODO "copertura media semplice"): analysis-istat, Step 2 and
// Step 4 fallbacks, NIL shares. Never a mean or a sum of per-zone percentages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { familiesShare, familiesShareOfTotal, familiesWeightedCoverage, zoneFamiliesTotal } from "../src/lib/step2/familiesCoverage.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Cormano 3 km, production rows of 2026-10-23 (subset): small comuni fully inside, big quartieri sliced.
const cormanoLike = [
  { familiesInRadius: 9297, familiesTotal: 9297, coverage: 100 },
  { familiesInRadius: 873, familiesTotal: 17391, coverage: 5 },
  { familiesInRadius: 2889, familiesTotal: 34563, coverage: 8 },
];

test("weighted coverage = families inside / total families, not the mean of %", () => {
  assert.equal(familiesWeightedCoverage(cormanoLike), Math.round(100 * (9297 + 873 + 2889) / (9297 + 17391 + 34563))); // 21
  assert.notEqual(familiesWeightedCoverage(cormanoLike), Math.round((100 + 5 + 8) / 3)); // mean would say 38
  assert.equal(familiesWeightedCoverage([{ familiesInRadius: 10239, familiesTotal: 10239, coverage: 100 }]), 100);
  assert.equal(zoneFamiliesTotal({ familiesInRadius: 500, coverage: 25 }), 2000, "total derived from the zone's own % when missing");
  assert.equal(familiesWeightedCoverage([{ familiesInRadius: 500, coverage: 25 }, { familiesInRadius: 1000, familiesTotal: 1000 }]), 50);
});

test("missing figures give null, never an invented value", () => {
  assert.equal(familiesWeightedCoverage([]), null);
  assert.equal(familiesWeightedCoverage([{ familiesInRadius: 100 }]), null);
  assert.equal(familiesWeightedCoverage([{ coverage: 50 }]), null);
  assert.equal(familiesShare([{ families: 10 }], [{ families: null }]), null);
  assert.equal(familiesShareOfTotal([{ familiesTotal: 10 }], []), null);
});

test("NIL shares: selected families on the comune total; marginal zones on the radius families", () => {
  const nil = [{ familiesTotal: 6840 }, { familiesTotal: 3795 }, { familiesTotal: 17391 }, { familiesTotal: 8480 }];
  assert.equal(familiesShareOfTotal(nil.slice(0, 2), nil), Math.round(100 * (6840 + 3795) / (6840 + 3795 + 17391 + 8480)));
  const radius = [{ families: 9000 }, { families: 800 }, { families: 200 }];
  assert.equal(familiesShare(radius.slice(1), radius), 10);
});

test("analysis-istat: copertura_stimata weighted by families, method reported", () => {
  const src = read("supabase/functions/analysis-istat/index.ts");
  assert.match(src, /Math\.min\(100, Math\.round\(\(totalFamilies \/ familiesTotalSum\) \* 100\)\)/);
  assert.match(src, /const coverageMethod = familiesTotalKnown && familiesTotalSum > 0 \? "families_weighted" : "simple_mean";/);
  assert.match(src, /coverage_method: coverageMethod,/);
  assert.match(src, /copertura_stimata: avgCoverage,/);
  assert.match(src, /const reachScore = clamp\(avgCoverage \* 0\.74/);
});

test("Step 2 / Step 4 fallbacks and NIL shares use the families helpers", () => {
  const step2 = read("src/pages/public/configurator/Step2.jsx");
  assert.match(step2, /: familiesWeightedCoverage\(selZones\) : null,/);
  assert.match(step2, /const zoneCoveragePctForBox = isNilAnalysis && selZones\.length > 0 \? familiesShareOfTotal\(selZones, allMilanoNilRows\.map\(row => row\.zone\)\) : null;/);
  assert.ok(step2.indexOf("const zoneCoveragePctForBox") > step2.indexOf("const allMilanoNilRows"), "declared after its source");
  assert.match(step2, /const marginalZoneCoverage = familiesShare\(marginalResidentialZones, sortedResidentialZones\);/);
  assert.doesNotMatch(step2, /selZones\.reduce\(\(a, z\) => a \+ \(Number\(z\.coverage\) \|\| 0\), 0\)/);
  const step4 = read("src/pages/public/configurator/Step4.jsx");
  assert.match(step4, /const avgCov = familiesWeightedCoverage\(selZ\);/);
  assert.ok(step4.indexOf("const fallbackCoverageText") > step4.indexOf("const kpis = "), "declared after kpis");
  assert.doesNotMatch(step4, /[^$]\{kpis\.coverage \?\? avgCov\}%/);
  assert.match(read("src/lib/step2/zoneGeoHelpers.js"), /familiesTotal: c\.households_total > 0 \? Math\.round\(c\.households_total\) : null,/);
});
