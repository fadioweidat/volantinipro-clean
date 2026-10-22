// Homepage calculator, Milano: the analysis is by NIL (no "Milano" comune row),
// which the old name match read as "Non abbiamo dati ISTAT per Milano".
// Fixtures = real analysis-istat answers recorded 2026-10-22 (geometry stripped).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHomeCalculatorAnalysisArgs, readHomeCalculatorAnalysis, isMilanoComune, MILANO_WHOLE_CITY_RADIUS_KM } from "../src/lib/quote/homeCalculatorAnalysis.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/home_calculator/${name}.json`, import.meta.url), "utf8"));
const MILANO = { name: "Milano", lat: 45.4642, lng: 9.19 };
const MONZA = { name: "Monza", lat: 45.58, lng: 9.27 };

test("Milano uses the Step 2 'Milano intera' request; other comuni keep the single-comune request", () => {
  assert.equal(isMilanoComune(MILANO), true);
  assert.equal(isMilanoComune({ name: "milano " }), true);
  assert.equal(isMilanoComune({ name: "Milano Marittima" }), false);
  assert.equal(isMilanoComune(MONZA), false);
  assert.deepEqual(buildHomeCalculatorAnalysisArgs(MILANO), [45.4642, 9.19, MILANO_WHOLE_CITY_RADIUS_KM, "d2d", "Milano", null, "comune", "nil", "municipality", "015146"]);
  assert.equal(MILANO_WHOLE_CITY_RADIUS_KM, 15);
  assert.deepEqual(buildHomeCalculatorAnalysisArgs(MONZA), [45.58, 9.27, 3, "d2d", "Monza", null, "comune", null, "municipality", null]);
  assert.equal(buildHomeCalculatorAnalysisArgs(null)[4], null, "no comune, no request");
});

test("Milano intera: sum of the 88 NILs, same quantity rule as Step 2", () => {
  const { body } = fixture("milano_intera");
  const a = readHomeCalculatorAnalysis(body, MILANO);
  assert.equal(a.kind, "milano");
  assert.equal(a.nilCount, 88);
  assert.equal(a.families, 744299);
  const perNil = body.comuni_breakdown.reduce((s, r) => s + r.volantini_nel_raggio, 0);
  assert.equal(a.recommended, perNil);
  assert.ok(Math.abs(a.recommended - Math.round(744299 * 1.1)) <= 88, "only per-NIL rounding differs");
  assert.equal(a.coverage, 100);
});

test("a partial Milano answer (old 3 km request: 31 NILs) is never shown as Milano intera, and is not 'no data'", () => {
  const { body } = fixture("milano_3km_old_request");
  const a = readHomeCalculatorAnalysis(body, MILANO);
  assert.equal(a.families, undefined);
  assert.equal(a.incomplete, true);
  assert.ok(!a.missing, "rows exist: not 'Non abbiamo dati ISTAT'");
});

test("ordinary comune unchanged; a comune outside the dataset is the only 'no data'", () => {
  const monza = readHomeCalculatorAnalysis(fixture("monza").body, MONZA);
  assert.equal(monza.kind, "comune");
  assert.equal(monza.families, fixture("monza").body.comuni_breakdown[0].households_in_radius);
  assert.ok(monza.recommended > monza.families);
  const roma = fixture("roma_outside_dataset").body;
  assert.equal(roma.error, "TERRITORIAL_DATA_NOT_AVAILABLE");
  assert.equal(readHomeCalculatorAnalysis(roma, { name: "Roma" }), null, "error answers are handled by the component status");
});

test("component: 'Non abbiamo dati ISTAT' only for missing data, Milano note under the figures", () => {
  const calc = readFileSync(new URL("../src/components/home/HomeQuoteCalculator.jsx", import.meta.url), "utf8");
  assert.match(calc, /: analysis\?\.missing \? 'unavailable'\s*\n\s*: 'error';/);
  assert.match(calc, /Nel configuratore puoi scegliere i singoli quartieri\./);
  assert.match(calc, /status === 'ready' && isMilano &&/);
});
