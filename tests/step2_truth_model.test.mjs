import assert from "node:assert/strict";
import { buildStep2TruthModel, buildStep2ToStep3Payload, projectStep2LegacyAliases } from "../src/lib/step2/buildStep2TruthModel.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

const model = buildStep2TruthModel({
  rawData: { territorialAnalysis: { values: { families: 12000 } } },
  userSelections: { areaMode: "custom_zone", selectedNils: ["a", "b"] },
  availability: { territorialData: true, coverage: true, demographics: true },
  sourceMetadata: [{ name: "ISTAT", connected: true }, { name: "Edifici", connected: false }],
  territory: { label: "Milano", modeLabel: "NIL selezionati" },
  territories: [{ code: "015146", name: "Milano" }],
  service: { key: "d2d", title: "Door to Door" },
  serviceData: { kpis: { families: 12000, area: 28.3 } },
  insertedQuantity: 10000,
  currentQuantity: 10000,
  baseRequirement: 12000,
  recommendedRequirement: 13200,
  calculationStatus: "ready",
  allocation: [
    { id: "a", name: "NIL A", priorityRank: 1, requiredFlyers: 7000, assignedFlyers: 7000 },
    { id: "b", name: "NIL B", priorityRank: 2, requiredFlyers: 6200, assignedFlyers: 3000 },
    { id: "c", name: "NIL C", priorityRank: 3, requiredFlyers: 2000, assignedFlyers: 0 },
  ],
  availableZoneCount: 88,
  dailyCapacity: 4000,
  confidenceInputs: { buildings: { available: 0, total: 1, limitation: "Fonte edifici non collegata." } },
});

test("coverage, shortage and surplus come from the truth model", () => {
  assert.equal(model.coverage.operationalPct, 75.8);
  assert.equal(model.quantity.shortage, 3200);
  assert.equal(model.quantity.surplus, 0);
});
test("quantity concepts remain separate", () => {
  assert.deepEqual(model.quantity, { inserted: 10000, current: 10000, baseRequirement: 12000, operationalMargin: 1200, operationalMarginPct: 10, recommendedRequirement: 13200, shortage: 3200, missing: 3200, surplus: 0, allocatedQuantity: 10000, unallocatedQuantity: 0 });
});
test("allocation is canonical and preserves legacy row aliases", () => {
  assert.equal(model.allocation.rows[1].coveragePct, 48.4);
  assert.equal(model.allocation.rows[1].coveragePercent, 48.4);
  assert.equal(model.zones.full, 1);
  assert.equal(model.zones.partial, 1);
  assert.equal(model.zones.excluded, 1);
});
test("raw data, selections, availability and source metadata are retained", () => {
  assert.equal(model.rawData.territorialAnalysis.values.families, 12000);
  assert.equal(model.userSelections.areaMode, "custom_zone");
  assert.equal(model.availability.demographics, true);
  assert.equal(model.sourceMetadata[0].name, "ISTAT");
});
test("service-specific data is isolated", () => {
  assert.equal(model.d2d.available, true);
  assert.equal(model.d2d.kpis.families, 12000);
  assert.equal(model.h2h.available, false);
  assert.equal(model.business.available, false);
});
test("null is never converted to zero", () => {
  const unavailable = buildStep2TruthModel({ service: { key: "h2h" }, insertedQuantity: null, currentQuantity: undefined, baseRequirement: null, recommendedRequirement: null });
  assert.equal(unavailable.quantity.inserted, null);
  assert.equal(unavailable.quantity.current, null);
  assert.equal(unavailable.quantity.recommendedRequirement, null);
  assert.equal(unavailable.quantity.shortage, null);
  assert.equal(unavailable.quantity.surplus, null);
  assert.equal(unavailable.coverage.operationalPct, null);
  assert.equal(unavailable.calculation.status, "unavailable");
});
test("explicit zero remains a verified zero", () => {
  const zero = buildStep2TruthModel({ insertedQuantity: 0, currentQuantity: 0, baseRequirement: 0, recommendedRequirement: 0 });
  assert.equal(zero.quantity.current, 0);
  assert.equal(zero.quantity.shortage, 0);
  assert.equal(zero.quantity.surplus, 0);
});
test("duration distinguishes operator-days and calendar days", () => {
  assert.equal(model.duration.operatorDays, 2.5);
  assert.equal(model.duration.calendarDays, null);
  assert.equal(buildStep2TruthModel({ currentQuantity: 10000, dailyCapacity: 4000, operatorCount: 2 }).duration.calendarDays, 2);
});
test("payload persists truth and aliases are exact projections", () => {
  const payload = buildStep2ToStep3Payload(model);
  const aliases = projectStep2LegacyAliases(model);
  assert.equal(payload.truthModel, model);
  assert.equal(payload.rawData, model.rawData);
  assert.equal(payload.userSelections, model.userSelections);
  assert.equal(payload.availability, model.availability);
  assert.equal(payload.sourceMetadata, model.sourceMetadata);
  assert.deepEqual({ requiredFlyers: payload.requiredFlyers, missingFlyers: payload.missingFlyers, remainingFlyers: payload.remainingFlyers, serviceKpis: payload.serviceKpis, businessMaterialPlan: payload.businessMaterialPlan }, aliases);
});

console.log(`\n${passed} PASS | 0 FAIL`);
