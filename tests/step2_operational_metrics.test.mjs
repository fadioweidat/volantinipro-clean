import assert from "node:assert/strict";
import {
  D2D_DAILY_CAPACITY,
  buildOperationalAdvice,
  calculateOperationalScore,
  classifyOperationalScore,
  estimateOperationalDays,
  resolveAssignedQuantity,
} from "../src/lib/step2/operationalMetrics.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("score: somma componenti uguale al totale", () => {
  const result = calculateOperationalScore({ families: 6176, density: 2898, coverage: 100, comuniCount: 1 });
  assert.equal(result.components.reduce((sum, item) => sum + item.contribution, 0), result.score);
});

test("score: classificazioni bassa, media e alta seguono le soglie reali", () => {
  assert.equal(classifyOperationalScore(57), "low");
  assert.equal(classifyOperationalScore(58), "medium");
  assert.equal(classifyOperationalScore(78), "high");
});

test("score: valori mancanti non producono NaN o valori fuori scala", () => {
  for (const input of [{}, { families: NaN, density: null, coverage: undefined, comuniCount: -2 }, { families: 1e9, density: 1e9, coverage: 1e9, comuniCount: 1e9 }]) {
    const result = calculateOperationalScore(input);
    assert.ok(Number.isFinite(result.score));
    assert.ok(result.score >= 0 && result.score <= 100);
    result.components.forEach(item => assert.ok(Number.isFinite(item.contribution)));
  }
});

test("consiglio: copertura completa e score basso segnala bassa efficienza", () => {
  const advice = buildOperationalAdvice({ score: 51, coverage: 100, assignedQuantity: 10000, recommendedQuantity: 6794, density: 2898, territoryCount: 1 });
  assert.equal(advice.classification, "low");
  assert.match(advice.summary, /efficienza operativa è bassa/i);
  assert.doesNotMatch(advice.summary, /sicurezza/i);
});

test("consiglio: copertura completa e score alto è positivo", () => {
  const advice = buildOperationalAdvice({ score: 85, coverage: 100, assignedQuantity: 7000, recommendedQuantity: 6800, density: 5000, territoryCount: 1 });
  assert.match(advice.summary, /buona compatibilità operativa/i);
});

test("consiglio: copertura parziale o quantità insufficiente non è positivo", () => {
  const partial = buildOperationalAdvice({ score: 85, coverage: 70, assignedQuantity: 7000, recommendedQuantity: 7000 });
  const shortage = buildOperationalAdvice({ score: 85, coverage: 100, assignedQuantity: 5000, recommendedQuantity: 7000 });
  assert.match(partial.summary, /parziale/i);
  assert.match(shortage.summary, /mancano/i);
});

test("consiglio: quantità superiore e dati incompleti espongono i fattori", () => {
  const advice = buildOperationalAdvice({ score: 65, coverage: 100, assignedQuantity: 9000, recommendedQuantity: 7000, hasPartialTerritorialData: true });
  assert.ok(advice.factors.some(value => value.includes("oltre")));
  assert.ok(advice.factors.some(value => value.includes("non disponibili")));
});

test("giorni: richiede il numero di operatori e usa la quantità assegnata", () => {
  assert.equal(estimateOperationalDays(6794, D2D_DAILY_CAPACITY).days, null);
  assert.equal(estimateOperationalDays(10000, D2D_DAILY_CAPACITY, 1).days, 3);
  assert.equal(estimateOperationalDays(8001, D2D_DAILY_CAPACITY, 2).days, 2);
  assert.equal(estimateOperationalDays(10000, D2D_DAILY_CAPACITY).operatorDays, 2.5);
});

test("giorni: capacità nulla o non valida non inventa una stima", () => {
  assert.equal(estimateOperationalDays(10000, 0).days, null);
  assert.equal(estimateOperationalDays(10000, NaN).days, null);
});

test("decisione quantità: Mantieni, Adatta e manuale sono deterministici", () => {
  const state = { insertedQuantity: 10000, recommendedQuantity: 6794 };
  assert.equal(resolveAssignedQuantity({ ...state, decision: "keepCurrent" }), 10000);
  assert.equal(resolveAssignedQuantity({ ...state, decision: "useRecommended" }), 6794);
  assert.equal(resolveAssignedQuantity({ ...state, decision: "manual", manualQuantity: 7500 }), 7500);
});

test("persistenza semantica: quantità originaria resta separata da quella assegnata", () => {
  const persisted = { insertedFlyersOriginal: 10000, coverageDecision: "useRecommended", recommendedFlyers: 6794 };
  const assigned = resolveAssignedQuantity({ insertedQuantity: persisted.insertedFlyersOriginal, recommendedQuantity: persisted.recommendedFlyers, decision: persisted.coverageDecision });
  assert.equal(persisted.insertedFlyersOriginal, 10000);
  assert.equal(assigned, 6794);
  assert.equal(estimateOperationalDays(assigned).days, null);
  assert.equal(estimateOperationalDays(assigned).operatorDays, assigned / D2D_DAILY_CAPACITY);
});

console.log(`\n${passed} PASS | 0 FAIL`);
