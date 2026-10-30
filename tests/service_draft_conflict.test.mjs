import assert from "node:assert/strict";
import test from "node:test";
import { serviceDraftConflict } from "../src/lib/configuratorState.js";

test("a draft with customer choices of another service asks first", () => {
  assert.deepEqual(serviceDraftConflict({ type: "d2d", cityName: "Rho" }, "b2b"), { from: "d2d", to: "b2b" });
  assert.deepEqual(serviceDraftConflict({ type: "b2b", businessZone: "Varedo" }, "h2h"), { from: "b2b", to: "h2h" });
  assert.deepEqual(serviceDraftConflict({ type: "h2h", promoterAssignments: [{ location: "Milano" }] }, "d2d"), { from: "h2h", to: "d2d" });
  assert.deepEqual(serviceDraftConflict({ type: "d2d", quantitySource: "customer" }, "h2h"), { from: "d2d", to: "h2h" });
});

test("nothing to ask: same service, no real choices, empty or already sent draft", () => {
  assert.equal(serviceDraftConflict({ type: "d2d", cityName: "Rho" }, "d2d"), null);
  assert.equal(serviceDraftConflict({ type: "b2b", cityName: "Rho" }, "business-distribution"), null);
  assert.equal(serviceDraftConflict({ type: "d2d", qty: 10000, quantitySource: "default", selectedComuni: [] }, "b2b"), null);
  assert.equal(serviceDraftConflict({ type: null, cityName: "Rho" }, "b2b"), null);
  assert.equal(serviceDraftConflict(null, "b2b"), null);
  assert.equal(serviceDraftConflict({ type: "d2d", cityName: "Rho" }, undefined), null);
  assert.equal(serviceDraftConflict({ type: "d2d", cityName: "Rho", quoteSubmitted: true }, "b2b"), null);
});
