// 2026-10-29 (urgent): Step 1 showed "Distribuzione (stima) €185,00" for 10.000 Door to Door
// flyers (old flat 18,50 €/1.000), below every tier of the real grid (€350–€750). Before the
// zone is chosen Step 1 now shows the real grid range, with urgency and plan applied like the
// final quote; never a value below the grid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { doorToDoorRangeBeforeZone } from "../src/lib/pricing/step1Estimate.js";
import { TERRITORY_TIERS, calculateDistributionZonePrice, calculateMultiZoneDistributionPrice } from "../src/lib/pricing/distributionPricing.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("10.000 Door to Door before the zone: €350–€750, as the prices page", () => {
  assert.deepEqual(doorToDoorRangeBeforeZone(10000), { min: 350, max: 750 });
  assert.deepEqual(doorToDoorRangeBeforeZone(5000), { min: 210, max: 450 });
  assert.deepEqual(doorToDoorRangeBeforeZone(1000), { min: 120, max: 220 });
});

test("never below the grid, for any quantity", () => {
  for (const qty of [500, 1000, 2500, 7300, 10000, 33000, 50000, 80000]) {
    const r = doorToDoorRangeBeforeZone(qty);
    const grid = Object.values(TERRITORY_TIERS).map((t) => calculateDistributionZonePrice(t, qty));
    assert.equal(r.min, Math.min(...grid), String(qty));
    assert.equal(r.max, Math.max(...grid), String(qty));
  }
});

test("urgency and plan applied exactly like the final quote (calculateQuotePricing)", () => {
  for (const [urgency, plan] of [["urgent", 0], ["express", 0], ["normal", 3], ["urgent", 8]]) {
    const r = doorToDoorRangeBeforeZone(10000, { urgency, planDiscountPct: plan });
    const quote = (tier) => calculateQuotePricing({ quantity: 10000, pricePerThousand: 18.5, urgency, planDiscountPct: plan,
      distributionZones: [{ territory: tier, quantity: 10000 }] }).total;
    assert.equal(r.min, quote(TERRITORY_TIERS.MILANO_CORE), `${urgency}/${plan}`);
    assert.equal(r.max, quote(TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN), `${urgency}/${plan}`);
  }
  assert.deepEqual(doorToDoorRangeBeforeZone(10000, { urgency: "urgent" }), { min: 420, max: 900 });
  assert.equal(calculateMultiZoneDistributionPrice([{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 10000 }]).distributionSubtotal, 350);
});

test("Step 1 summary shows the range for Door to Door; other services unchanged", () => {
  const step1 = read("src/pages/public/configurator/Step1.jsx");
  assert.match(step1, /const d2dRange = \(data\.type \|\| "d2d"\) === "d2d" \? doorToDoorRangeBeforeZone\(activeQty, \{ urgency: data\.urgency, planDiscountPct: discPct \}\) : null;/);
  assert.match(step1, /distributionRange: d2dRange/);
  const summary = read("src/components/Step1Summary.jsx");
  assert.ok(summary.includes("<span>Distribuzione</span><strong>da <Amount value={range.min} /> a <Amount value={range.max} /></strong>"));
  assert.ok(summary.includes("da <Amount value={range.min + estimate.printCost} /> a <Amount value={range.max + estimate.printCost} />"));
  assert.ok(summary.includes(`const Amount = ({ value }) => <span style={{ whiteSpace: "nowrap", font: "inherit", color: "inherit", textTransform: "none", letterSpacing: "normal" }}>{eur(value)}</span>;`));
  assert.match(summary, /il prezzo esatto si calcola nello Step 2, dopo la scelta della zona/);
});

test("summary amounts always group thousands (€ 1.087,12)", () => {
  const src = read("src/components/Step1Summary.jsx");
  assert.ok(src.includes('const [int, dec] = Number(n || 0).toFixed(2).split(".");'));
  assert.ok(src.includes("return `€\u00a0${int"));
  assert.ok(src.includes('int.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".")'));
});
