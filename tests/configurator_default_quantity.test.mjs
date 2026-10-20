// Step 1 starts at 10.000 as a placeholder. If the customer never chose a
// quantity, Step 2 (D2D) uses the recommended quantity of the territory; a
// quantity chosen in Step 1 or decided in Step 2 is never overwritten.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const router = read("src/app/AppRouter.jsx");
const step1 = read("src/pages/public/configurator/Step1.jsx");
const step2 = read("src/pages/public/configurator/Step2.jsx");

// resolveDraftQuantitySource is a pure function; evaluate it from the source.
const fnSrc = router.match(/export function resolveDraftQuantitySource\(draft\) \{[\s\S]*?\n\}/)[0].replace("export ", "");
const resolveDraftQuantitySource = new Function(`${fnSrc}; return resolveDraftQuantitySource;`)();

test("a new campaign starts with a default (not chosen) quantity", () => {
  assert.match(router, /qty: 10000, quantitySource: "default",/);
  assert.match(router, /quantitySource: resolveDraftQuantitySource\(\{ \.\.\.persistedDraft, \.\.\.draft \}\)/);
});

test("drafts: explicit source kept; legacy drafts with a quantity are treated as chosen", () => {
  assert.equal(resolveDraftQuantitySource({}), "default");
  assert.equal(resolveDraftQuantitySource(null), "default");
  assert.equal(resolveDraftQuantitySource({ qty: 10000, quantitySource: "default" }), "default");
  assert.equal(resolveDraftQuantitySource({ qty: 25000, quantitySource: "customer" }), "customer");
  assert.equal(resolveDraftQuantitySource({ qty: 25000 }), "customer", "legacy draft: never overwrite");
});

test("every Step 1 quantity control marks the quantity as chosen", () => {
  assert.equal((step1.match(/quantitySource: "customer"/g) || []).length, 4, "chips, slider, manual input change and blur");
});

test("Step 2 adopts the recommended quantity only for a default quantity, D2D, one point of sale, settled analysis, no decision", () => {
  const effect = step2.slice(step2.indexOf("const recommendedForDefaultQuantity"), step2.indexOf("// ── RESIDUO NIL"));
  assert.match(effect, /if \(data\.quantitySource !== "default"\) return;/);
  assert.match(effect, /if \(!isResidentialStep2 \|\| !analysisOwnedByActiveZone \|\| apiLoading \|\| apiPending \|\| !hasUsableAllocationData\) return;/);
  assert.match(effect, /data\.campaignZones\.length : 0\) > 1\) return;/);
  assert.match(effect, /if \(coverageDecision\) return;/);
  assert.match(effect, /setAvailableFlyers\(recommendedForDefaultQuantity\);/);
  assert.match(effect, /qty: recommendedForDefaultQuantity,/);
});

test("quantity decisions in Step 2 become the customer's choice", () => {
  for (const fn of ["function updateManual(id, val) {", "function selectCoverageQuantityDecision(nextDecision) {", "function updateManualFlyersQuantity(value) {"]) {
    const body = step2.slice(step2.indexOf(fn), step2.indexOf(fn) + 200);
    assert.match(body, /markQuantityChosenByCustomer\(\);/, fn);
  }
});
