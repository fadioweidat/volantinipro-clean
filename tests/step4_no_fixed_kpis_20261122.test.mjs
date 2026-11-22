// Hotfix 2026-11-22 (decisione Fadi): nello Step 4 si mostrano solo numeri
// calcolati da dati veri. "Affidabilita' dati 99,4%" era un valore fisso e
// "Budget adeguato per ..." un consiglio mostrato sempre: non devono tornare.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const panel = read("src/pages/public/configurator/step4/Step4TechnicalAnalysisPanel.jsx");
const step4 = read("src/pages/public/configurator/Step4.jsx");

test("Step 4: nessuna 'Affidabilita dati' con percentuale fissa", () => {
  assert.doesNotMatch(panel, /Affidabilità dati/);
  assert.doesNotMatch(panel, /["'`]\d{2}[.,]\d%["'`]/, "nessuna percentuale scritta a mano nei KPI");
});

test("Step 4: nessun consiglio fisso 'Budget adeguato'", () => {
  assert.doesNotMatch(step4, /Budget adeguato/);
});

test("Step 4: i KPI principali restano tre, tutti calcolati", () => {
  for (const label of ["Famiglie operative stimate", "Copertura zona", "Zone selezionate"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /repeat\(3, 1fr\)/);
});
