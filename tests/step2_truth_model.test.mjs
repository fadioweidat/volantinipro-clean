import assert from "node:assert/strict";
import { buildStep2TruthModel } from "../src/lib/step2/buildStep2TruthModel.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

const model = buildStep2TruthModel({
  territory: { label: "Milano", modeLabel: "Comune completo" },
  service: { key: "d2d", title: "Door to Door" },
  insertedQuantity: 10000, currentQuantity: 10000,
  baseRequirement: 12000, recommendedRequirement: 13200,
  zones: [
    { id: "a", name: "NIL A", priorityRank: 1, requiredFlyers: 7000, assignedFlyers: 7000 },
    { id: "b", name: "NIL B", priorityRank: 2, requiredFlyers: 6200, assignedFlyers: 3000 },
    { id: "c", name: "NIL C", priorityRank: 3, requiredFlyers: 2000, assignedFlyers: 0 },
  ],
  availableZoneCount: 88, dailyCapacity: 4000,
  sources: [{ connected: true }, { connected: false }],
  confidenceInputs: { buildings: { available: 0, total: 1, limitation: "Fonte edifici non collegata." } },
});

test("coverage uses operational requirement denominator", () => {
  assert.equal(model.coverage.operationalPct, 75.8);
  assert.match(model.coverage.formula, /fabbisogno operativo/i);
});
test("quantity concepts remain separate", () => {
  assert.deepEqual(model.quantity, { inserted: 10000, current: 10000, baseRequirement: 12000, operationalMargin: 1200, operationalMarginPct: 10, recommendedRequirement: 13200, missing: 3200, surplus: 0, allocatedQuantity: 10000, unallocatedQuantity: 0 });
});
test("zone counts have distinct semantics", () => {
  assert.deepEqual({ available: model.zones.available, involved: model.zones.involved, full: model.zones.full, partial: model.zones.partial, excluded: model.zones.excluded }, { available: 88, involved: 2, full: 1, partial: 1, excluded: 1 });
});
test("zone coverage is possible and capped", () => {
  assert.equal(model.zones.rows[0].coveragePct, 100);
  assert.equal(model.zones.rows[1].coveragePct, 48.4);
  assert.ok(model.zones.rows.every((zone) => zone.coveragePct == null || zone.coveragePct <= 100));
});
test("first priority follows canonical rank", () => assert.equal(model.zones.firstPriority.name, "NIL A"));
test("calendar duration is unavailable without operators", () => {
  assert.equal(model.duration.operatorDays, 2.5);
  assert.equal(model.duration.days, null);
  assert.equal(model.duration.calculable, false);
});
test("calendar duration is calculated with operators", () => {
  assert.equal(buildStep2TruthModel({ currentQuantity: 10000, dailyCapacity: 4000, operatorCount: 2 }).duration.days, 2);
});
test("confidence reacts section by section", () => {
  assert.equal(model.confidence.buildings.label, "Bassa");
  assert.equal(model.confidence.coverage.label, "Media");
});
test("territory and sources share the canonical model", () => {
  assert.equal(model.territory.label, "Milano");
  assert.equal(model.sources.length, 2);
});
test("current quantity zero remains zero instead of falling back to inserted", () => {
  assert.equal(buildStep2TruthModel({ insertedQuantity: 10000, currentQuantity: 0, recommendedRequirement: 5000 }).quantity.current, 0);
});

console.log(`\n${passed} PASS | 0 FAIL`);
