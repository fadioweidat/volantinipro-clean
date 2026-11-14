// Step 1 starts at 10.000 as a proposal. Step 2 may recommend another
// quantity but must not silently overwrite the visible Step 1 amount.
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

test("Step 2 keeps the visible 10.000 until the customer chooses an amount", () => {
  const gate = step2.slice(step2.indexOf("// Keep the displayed Step 1 quantity"), step2.indexOf("// ── RESIDUO NIL"));
  assert.doesNotMatch(gate, /setAvailableFlyers\(|setData\(/);
  assert.match(step2, /function selectCoverageQuantityDecision\(nextDecision\)/);
  assert.match(step2, /markQuantityChosenByCustomer\(\)/);
});

test("quantity decisions in Step 2 become the customer's choice", () => {
  for (const fn of ["function updateManual(id, val) {", "function selectCoverageQuantityDecision(nextDecision) {", "function updateManualFlyersQuantity(value) {"]) {
    const body = step2.slice(step2.indexOf(fn), step2.indexOf(fn) + 200);
    assert.match(body, /markQuantityChosenByCustomer\(\);/, fn);
  }
});
