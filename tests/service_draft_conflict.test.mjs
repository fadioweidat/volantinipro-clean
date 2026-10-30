import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { draftInProgress, serviceDraftConflict } from "../src/lib/configuratorState.js";

test("a draft with customer choices of another service asks first", () => {
  assert.deepEqual(serviceDraftConflict({ type: "d2d", cityName: "Rho" }, "b2b"), { from: "d2d", to: "b2b" });
  assert.deepEqual(serviceDraftConflict({ type: "b2b", businessZone: "Varedo" }, "h2h"), { from: "b2b", to: "h2h" });
  assert.deepEqual(serviceDraftConflict({ type: "h2h", promoterAssignments: [{ location: "Milano" }] }, "d2d"), { from: "h2h", to: "d2d" });
  assert.deepEqual(serviceDraftConflict({ type: "d2d", quantitySource: "customer" }, "h2h"), { from: "d2d", to: "h2h" });
});

test("buttons that clear the draft also see a draft of the same service", () => {
  assert.deepEqual(draftInProgress({ type: "d2d", cityName: "Rho" }), { from: "d2d" });
  assert.deepEqual(draftInProgress({ type: null, cityName: "Rho" }), { from: null });
  assert.equal(draftInProgress({ type: "d2d", qty: 10000, quantitySource: "default" }), null);
  assert.equal(draftInProgress({ type: "d2d", cityName: "Rho", quoteSubmitted: true }), null);
});

test("every button that starts a new campaign protects the draft", () => {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const files = ["src/layouts/public/Navbar.jsx", "src/pages/public/ServiceCenter.jsx"];
  for (const file of files) {
    for (const line of read(file).split(/\r?\n/).filter((text) => text.includes("newCampaign: true"))) assert.match(line, /protectDraft: true/, file);
  }
  const elsewhere = read("src/app/AppRouter.jsx").match(/newCampaign: true/g) || [];
  assert.equal(elsewhere.length, 1, "only the dialog answer clears the draft");
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
