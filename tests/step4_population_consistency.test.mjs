// BUG — Step2/Step4 population mismatch (Cinisello Balsamo: Step2 "Popolazione
// stimata" 74.373 vs Step4 "Persone stimate" 82.586 in the same session).
//
// Aggiornato 2026-11-23: il fallback famiglie x 2,4 (coefficiente fisso) e'
// stato tolto. Card "Persone stimate", card "Popolazione stimata" e PDF
// leggono lo stesso valore (populationForPdf, da estimateCampaignPersons):
// popolazione ISTAT dell'area con un PV; con piu' PV il rapporto
// popolazione/famiglie ISTAT di ogni PV x sue famiglie uniche. Se il dato non
// e' calcolabile la card non c'e'.
//
// Convention (see tests/step4_increase_quantity.test.mjs): contract test on
// the real source file, no live render needed.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const STEP4_SRC = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Step4 'Persone stimate' usa il dato ISTAT condiviso, mai un coefficiente fisso", () => {
  const cardIdx = STEP4_SRC.indexOf('l: "Persone stimate"');
  assert.ok(cardIdx > -1, "il blocco KPI 'Persone stimate' deve esistere");
  const block = STEP4_SRC.slice(cardIdx - 120, cardIdx + 300);
  assert.match(block, /\.\.\.\(populationForPdf != null \? \[\{/);
  assert.match(block, /v: formatNumber\(populationForPdf\)/);
  assert.doesNotMatch(STEP4_SRC, /\* 2\.4\b/);
  assert.doesNotMatch(STEP4_SRC, /coefficiente medio/);
});

test("card Popolazione, card Persone e PDF usano la stessa fonte", () => {
  assert.match(STEP4_SRC, /const personsEstimate = estimateCampaignPersons\(\{/);
  assert.match(STEP4_SRC, /const populationForPdf = personsEstimate \? personsEstimate\.value : null;/);
  const popCards = [...STEP4_SRC.matchAll(/l: "Popolazione stimata",\n\s*v: populationForPdf != null \? formatNumber\(populationForPdf\) : null/g)];
  assert.ok(popCards.length >= 2, "entrambe le righe 'Popolazione stimata' leggono populationForPdf");
  assert.match(STEP4_SRC, /estimatedPopulation: svcType === "d2d" \? populationForPdf : null/);
});
