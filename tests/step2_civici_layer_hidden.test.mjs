// 2026-10-23: the Step 2 "Civici" layer is hidden before address_points leaves the
// database (option B approved): no service offers it, so nothing calls its RPCs.
import test from "node:test";
import assert from "node:assert/strict";
import { SERVICE_LAYERS } from "../src/lib/services/service-config.js";

test("no service offers the Civici layer; the other layers are unchanged", () => {
  for (const [svc, cfg] of Object.entries(SERVICE_LAYERS)) {
    const ids = cfg.layers.map((l) => l.id);
    assert.ok(!ids.includes("civici"), `${svc} still offers civici`);
    assert.ok(ids.includes("radius") && ids.includes("poi") && ids.includes("comuni") && ids.includes("settori"), svc);
  }
  assert.deepEqual(SERVICE_LAYERS.d2d.layers.map((l) => l.id), ["radius", "comuni", "settori", "density", "poi", "tracking"]);
});
