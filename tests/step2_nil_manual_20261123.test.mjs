// Fase 2 (2026-11-23), gruppi D1 e D2 — quartieri NIL di Milano.
// D1: la selezione automatica non sovrascrive le NIL scelte a mano (3a88fdc).
// D2: "Scegli NIL" salva il PV attivo come zona personalizzata NIL, non come
//     "Comune intero" (d675ce7, riscritto con gli azzeramenti di switchToComuneMode).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const step2 = fs.readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("D1: NIL manuali protette in qualunque modalita'", () => {
  assert.match(step2, /if \(nilManualMode && isResidentialStep2\) return;/);
  assert.doesNotMatch(step2, /if \(nilManualMode && isComuneMode && isResidentialStep2 && requestedAnalysisLevel === "nil"\) return;/);
});

test("D2: 'Scegli NIL' non passa piu' da 'Comune intero'", () => {
  assert.match(step2, /onChooseNil=\{chooseNilManualMode\}/);
  assert.doesNotMatch(step2, /onChooseNil=\{\(\) => \{ switchToComuneMode\(\);/);
});

test("D2: il PV attivo viene salvato come zona personalizzata NIL", () => {
  const fn = step2.slice(step2.indexOf("const chooseNilManualMode = () => {"), step2.indexOf("const switchToNilMode = () => {"));
  assert.ok(fn.length > 0);
  assert.match(fn, /setNilManualMode\(true\);/);
  assert.match(fn, /setSelected\(\[\]\);/);
  assert.match(fn, /z\.id === prev\.activeZoneId \? \{/);
  assert.match(fn, /areaMode: "custom_zone",\n\s*territoryMode: "custom_zone",\n\s*coverageMode: "nil",/);
  for (const reset of ["setComuniPriorityOrder([])", "setCoverageDecision(null)", "setCoverageStrategy(null)", "setRadiusSelectionConfirmed(false)"]) {
    assert.ok(fn.includes(reset), `azzera come "Comune": ${reset}`);
  }
});
