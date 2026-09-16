// BUG — Step2/Step4 population mismatch (Cinisello Balsamo: Step2 "Popolazione
// stimata" 74.373 vs Step4 "Persone stimate" 82.586 in the same session).
//
// Root cause: Step4.jsx's "Persone stimate" KPI card (Famiglie e copertura
// section) always computed families * 2.4 (a fixed avg-household-size
// heuristic), ignoring `kpisPopulation` — the real ISTAT-sourced population
// value already computed in the same component and used consistently by
// Step2, Step4's own "Popolazione stimata" card (2 occurrences) and the PDF
// (`estimatedPopulation: kpisPopulation`). The *2.4 formula was a duplicate
// calculation path, not a distinct legitimate metric, mislabeled "Stima su
// base ISTAT" though it was never derived from ISTAT population data.
//
// Fix: the "Persone stimate" card now uses kpisPopulation (same canonical
// ISTAT source as Step2/PDF) whenever available, falling back to the
// families*2.4 heuristic — honestly labeled as an estimate, not ISTAT —
// only when no ISTAT population figure exists at all.
//
// Convention (see tests/step4_increase_quantity.test.mjs): contract test on
// the real source file, no live render needed.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const STEP4_SRC = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");

test("Step4 'Persone stimate' card uses kpisPopulation (canonical ISTAT source) as its primary value", () => {
  const cardIdx = STEP4_SRC.indexOf('l: "Persone stimate"');
  assert.ok(cardIdx > -1, "il blocco KPI 'Persone stimate' deve esistere");
  const block = STEP4_SRC.slice(cardIdx, cardIdx + 300);
  assert.match(
    block,
    /v:\s*formatNumber\(kpisPopulation\s*\?\?/,
    "il valore deve partire da kpisPopulation (la stessa fonte ISTAT usata da Step2, dall'altra card 'Popolazione stimata' e dal PDF), non da families*2.4 fisso"
  );
});

test("Step4 'Persone stimate' non dichiara 'ISTAT' quando il valore e' in realta' derivato da families*2.4", () => {
  const cardIdx = STEP4_SRC.indexOf('l: "Persone stimate"');
  const block = STEP4_SRC.slice(cardIdx, cardIdx + 300);
  // Il fallback *2.4 deve restare, ma solo quando kpisPopulation manca —
  // e la sua etichetta non deve piu' affermare falsamente "ISTAT".
  assert.match(block, /\* 2\.4/, "il fallback per i comuni senza popolazione ISTAT deve restare disponibile");
  assert.match(
    block,
    /sub:\s*kpisPopulation != null \? "Fonte: ISTAT" : /,
    "l'etichetta sorgente deve riflettere onestamente se il valore mostrato e' realmente ISTAT o una stima derivata"
  );
});

test("kpisPopulation resta la stessa variabile usata dalle card 'Popolazione stimata' (Step4) e dal PDF (estimatedPopulation)", () => {
  const popCardOccurrences = [...STEP4_SRC.matchAll(/l:\s*"Popolazione stimata"[\s\S]{0,120}?v:\s*formatNumber\(kpisPopulation/g)];
  assert.ok(popCardOccurrences.length >= 2, "entrambe le card 'Popolazione stimata' devono leggere kpisPopulation");
  assert.match(
    STEP4_SRC,
    /estimatedPopulation:\s*svcType === "d2d" \? kpisPopulation : null/,
    "il modello inviato al PDF deve usare la stessa kpisPopulation, non un calcolo duplicato"
  );
});
