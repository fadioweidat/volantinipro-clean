// Homepage calculator, Milano: the analysis is by NIL (no "Milano" comune row),
// which the old name match read as "Non abbiamo dati ISTAT per Milano".
// Fixtures = real analysis-istat answers recorded 2026-10-22 (geometry stripped).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHomeCalculatorAnalysisArgs, readHomeCalculatorAnalysis, isMilanoComune, MILANO_WHOLE_CITY_RADIUS_KM, splitQuickQuoteComuni, buildQuickQuoteAnchorAnalysisArgs } from "../src/lib/quote/homeCalculatorAnalysis.js";

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

test("Preventivo Rapido: Milano gets its own 'Milano intera' request, the other comuni keep the anchor request", () => {
  const seveso = { name: "Seveso", lat: 45.64, lng: 9.14 };
  const meda = { name: "Meda", lat: 45.66, lng: 9.15 };
  assert.deepEqual(splitQuickQuoteComuni([MILANO]), { milano: MILANO, others: [] });
  assert.deepEqual(splitQuickQuoteComuni([seveso, MILANO, meda]), { milano: MILANO, others: [seveso, meda] });
  assert.equal(buildQuickQuoteAnchorAnalysisArgs([], "d2d", null)[4], null, "Milano alone: no anchor request");
  assert.deepEqual(buildQuickQuoteAnchorAnalysisArgs([seveso], "d2d", 5000), [45.64, 9.14, 3, "d2d", "Seveso", 5000, "comune", null, "municipality", null]);
  assert.deepEqual(buildQuickQuoteAnchorAnalysisArgs([seveso, meda], "d2d", null), [45.64, 9.14, 25, "d2d", "Seveso", null, "comune", null, "multi", null]);
  assert.equal(buildQuickQuoteAnchorAnalysisArgs([seveso], "h2h", null)[4], null, "H2H/B2B use the per-comune POI requests");
  const milano = readHomeCalculatorAnalysis(fixture("milano_intera").body, MILANO);
  assert.ok(milano.population > 0, "population summed from the NILs");
});

test("Preventivo Rapido wiring: Milano row from the NIL sum, clear message instead of an endless 'In calcolo…'", () => {
  const quick = readFileSync(new URL("../src/pages/public/QuickQuotePage.jsx", import.meta.url), "utf8");
  assert.match(quick, /useServiceAnalysis\(\.\.\.buildQuickQuoteAnchorAnalysisArgs\(otherComuni, service, qty\)\)/);
  assert.match(quick, /useServiceAnalysis\(\.\.\.buildHomeCalculatorAnalysisArgs\(service === "d2d" \? milanoComune : null\)\)/);
  assert.match(quick, /if \(c === milanoComune\) \{/);
  assert.match(quick, /recommendedFlyers: ok \? milano\.recommended : null, matched: Boolean\(ok\)/);
  assert.match(quick, /Dati ISTAT non disponibili per \{d2dUnmatched\.join\(", "\)\} in questo momento\./);
  assert.match(quick, /d2dUnmatched\.length \? "Da inserire" : \(hasComuni \? "In calcolo…" : "In attesa"\)/);
});