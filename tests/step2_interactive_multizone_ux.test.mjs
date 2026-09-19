import test from "node:test";
import assert from "node:assert/strict";
import { getServiceExplanation, SERVICE_EXPLANATIONS } from "../src/lib/step2/serviceExplanations.js";
import { fetchSectors, normalizeSectorServiceType } from "../src/lib/services/sectors-api.js";
import { filterNilRows, rankNilSearchResults } from "../src/lib/step2/milanoNilView.js";
import { computeDoorToDoorCoverage } from "../src/lib/doorToDoorCoverage.js";
import { buildStep2TruthModel } from "../src/lib/step2/buildStep2TruthModel.js";

test("Service explanations coverage for all 7 services", () => {
  const serviceKeys = ["d2d", "h2h", "b2b", "schools", "metro", "cars", "posters"];
  for (const key of serviceKeys) {
    const exp = getServiceExplanation(key);
    assert.ok(exp, `Missing explanation for service: ${key}`);
    assert.ok(exp.name && exp.name.length > 0, `Missing name for service: ${key}`);
    assert.ok(exp.summary && exp.summary.length > 0, `Missing summary for service: ${key}`);
    assert.ok(Array.isArray(exp.bullets) && exp.bullets.length >= 3, `Expected at least 3 bullets for service: ${key}`);
    assert.ok(Array.isArray(exp.helpFaq) && exp.helpFaq.length >= 3, `Expected at least 3 FAQs for service: ${key}`);
    assert.ok(exp.kpiHouseholdLabel, `Missing kpiHouseholdLabel for service: ${key}`);
  }
});

test("Milano NIL Autocomplete search & ranking returns accurate results", () => {
  const mockRows = [
    { type: "zone", zone: { id: "nil_14", nil_code: "14", name: "BRUZZANO", families: 7524, pop: 12500 } },
    { type: "zone", zone: { id: "nil_15", nil_code: "15", name: "COMASINA", families: 6800, pop: 11200 } },
    { type: "zone", zone: { id: "nil_16", nil_code: "16", name: "AFFORI", families: 9200, pop: 15100 } },
    { type: "zone", zone: { id: "nil_1", nil_code: "1", name: "DUOMO", families: 5100, pop: 8900 } },
  ];

  const bruzzanoFiltered = filterNilRows(mockRows, "bruzz");
  assert.equal(bruzzanoFiltered.length, 1);
  assert.equal(bruzzanoFiltered[0].zone.name, "BRUZZANO");

  const ranked = rankNilSearchResults(mockRows, "comasina");
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].name, "COMASINA");
});

test("Multi-zone selection aggregation & Door to Door coverage calculations", () => {
  const bruzzano = { id: "nil_14", nil_code: "14", name: "BRUZZANO", families: 7524 };
  const comasina = { id: "nil_15", nil_code: "15", name: "COMASINA", families: 6800 };
  const selectedZones = [bruzzano, comasina];

  const totalFamilies = selectedZones.reduce((acc, z) => acc + z.families, 0);
  assert.equal(totalFamilies, 14324);

  // 10,000 flyers with 14,324 families -> Partial coverage
  const cov10k = computeDoorToDoorCoverage({
    insertedFlyers: 10000,
    selectedZones,
  });
  assert.equal(cov10k.fullCoverageFlyers, 14324);
  assert.equal(cov10k.missingFlyers, 4324);
  assert.equal(cov10k.status, "partial");

  // Full coverage with 14,324 flyers
  const covFull = computeDoorToDoorCoverage({
    insertedFlyers: 14324,
    selectedZones,
  });
  assert.equal(covFull.fullCoverageFlyers, 14324);
  assert.equal(covFull.missingFlyers, 0);
  assert.equal(covFull.status, "sufficient");
});

test("Truth model consistency when selecting recommended quantity", () => {
  const bruzzano = { id: "nil_14", name: "BRUZZANO", requiredFlyers: 7524, assignedFlyers: 7524 };
  const truthModel = buildStep2TruthModel({
    service: { key: "d2d" },
    insertedQuantity: 10000,
    currentQuantity: 7524,
    recommendedRequirement: 7524,
    allocation: [bruzzano],
  });

  assert.equal(truthModel.service.key, "d2d");
  assert.equal(truthModel.quantity.current, 7524);
  assert.equal(truthModel.quantity.recommendedRequirement, 7524);
  assert.equal(truthModel.coverage.operationalPct, 100);
});
