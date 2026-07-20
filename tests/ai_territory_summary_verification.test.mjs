import assert from "node:assert/strict";
import {
  extractNumbersFromText,
  verifyNumbersAgainstPayload,
} from "../supabase/functions/analyze-territory-summary/numericVerification.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const payload = {
  service: "d2d",
  centerMunicipality: "Varedo",
  radiusKm: 3,
  familiesTotal: 42870,
  populationTotal: 105233,
  quantityInserted: 10000,
  quantityRecommended: 38973,
  coveragePercent: 23.3,
  score: {
    pct: 73,
    scoreScale: 100,
    components: [
      { key: "families", name: "Famiglie raggiungibili", contribution: 24, max: 34 },
      { key: "coverage", name: "Copertura operativa", contribution: 12, max: 24 },
    ],
  },
  comuniBreakdown: [
    { name: "Varedo", families: 22870, assignedQuantity: 7524, coveragePercent: 100, priorityRank: 1 },
    { name: "Bovisio Masciago", families: 20000, assignedQuantity: 2476, coveragePercent: 35.8, priorityRank: 2 },
  ],
};

test("testo valido: tutti i numeri provengono dal payload", () => {
  const text =
    "La configurazione attuale copre 10.000 volantini sulle 42.870 famiglie raggiungibili nel raggio di 3 km da Varedo. " +
    "La distribuzione si concentra su Varedo, dove sono assegnati 7.524 volantini con copertura del 100%. " +
    "Bovisio Masciago resta parzialmente scoperto, con 2.476 volantini assegnati su una copertura del 35,8%. " +
    "La quantita consigliata per una copertura completa e di 38.973 volantini.";
  const result = verifyNumbersAgainstPayload(text, payload);
  assert.equal(result.valid, true);
  assert.deepEqual(result.invalidNumbers, []);
});

test("numero inventato: il testo viene scartato", () => {
  const text =
    "La configurazione attuale copre 10.000 volantini sulle 42.870 famiglie raggiungibili. " +
    "Si stima che aumenterai la copertura di 5.000 famiglie extra rispetto allo scenario attuale.";
  const result = verifyNumbersAgainstPayload(text, payload);
  assert.equal(result.valid, false);
  assert.ok(result.invalidNumbers.includes(5000));
});

test("percentuale riformattata in modo legittimo resta valida", () => {
  const text = "La copertura scenario corrente e del 23,3% del fabbisogno operativo, per uno score di 73.";
  const result = verifyNumbersAgainstPayload(text, payload);
  assert.equal(result.valid, true);
});

test("percentuale diversa (non presente nel payload) viene scartata", () => {
  const text = "La copertura scenario corrente e del 24,3% del fabbisogno operativo.";
  const result = verifyNumbersAgainstPayload(text, payload);
  assert.equal(result.valid, false);
  assert.ok(result.invalidNumbers.includes(24.3));
});

test("estrazione numeri: gestisce migliaia, decimali e percentuali it-IT", () => {
  const numbers = extractNumbersFromText("10.000 volantini, copertura 1,3%, 87 zone disponibili");
  assert.deepEqual(
    numbers.map((n) => n.value),
    [10000, 1.3, 87]
  );
  assert.equal(numbers[1].isPercent, true);
});

test("stringa vuota o assente non produce numeri", () => {
  assert.deepEqual(extractNumbersFromText(""), []);
  assert.deepEqual(extractNumbersFromText(null), []);
});

console.log(`AI territory summary verification tests: ${passed} passed`);
