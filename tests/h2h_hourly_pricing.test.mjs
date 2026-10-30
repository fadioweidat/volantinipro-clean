// 2026-10-29 (approved): Hand to Hand at €25/hour per operator (VAT excluded), minimum 3 hours per
// outing; operators and hours instead of a quantity; flyers estimated as a 250–350/hour range, never
// a guaranteed number (250/hour only for internal planning); outside Milano city "Spostamento
// calcolato nel preventivo" without an amount; urgency and plans as Door to Door; no Smart Pairing;
// the old €22 per 1.000 rate removed everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  H2H_HOUR_OPTIONS, H2H_HOURLY_RATE_EUR, H2H_MIN_HOURS_PER_OUTING, billableHours, calculateHandToHandPricing,
  handToHandFlyersRange, handToHandNeedsTravel, handToHandOperatorHours, handToHandPlanningFlyers,
} from "../src/lib/pricing/handToHandPricing.js";
import { QUOTE_PRICES, BASE_PRICES } from "../src/lib/appConstants.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { H2H_FLYERS_PER_PROMOTER_HOUR } from "../src/lib/step2/operationalMetrics.js";
import { PROMOTER_SHIFT_DURATION_OPTIONS } from "../src/lib/step1/step1OptionLists.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("rate, minimum and hour options", () => {
  assert.equal(H2H_HOURLY_RATE_EUR, 25);
  assert.equal(H2H_MIN_HOURS_PER_OUTING, 3);
  assert.deepEqual(H2H_HOUR_OPTIONS, [3, 4, 5, 6, 7, 8]);
  assert.deepEqual(PROMOTER_SHIFT_DURATION_OPTIONS.map((o) => o.value), [3, 4, 5, 6, 7, 8]);
  assert.equal(billableHours(1), 3);
  assert.equal(billableHours(5), 5);
});

test("price = hours × €25 per operator, then urgency and plan exactly like Door to Door", () => {
  assert.equal(calculateHandToHandPricing({ operatorHours: [3] }).total, 75);
  assert.equal(calculateHandToHandPricing({ operatorHours: [4, 4] }).total, 200);
  assert.equal(calculateHandToHandPricing({ operatorHours: [2] }).total, 75); // minimum 3 hours
  for (const [urgency, plan] of [["urgent", 0], ["express", 0], ["normal", 5], ["urgent", 8]]) {
    const h2h = calculateHandToHandPricing({ operatorHours: [4, 6], urgency, planDiscountPct: plan });
    const same = calculateQuotePricing({ quantity: 1, baseCostOverride: 250, urgency, planDiscountPct: plan });
    assert.equal(h2h.total, same.total, `${urgency}/${plan}`);
  }
  assert.equal(calculateHandToHandPricing({ operatorHours: [4], urgency: "urgent" }).total, 120);
  assert.equal(calculateHandToHandPricing({ operatorHours: [4] }).smartPairingDiscount, 0);
});

test("flyers: customer range 250–350/hour, planning 250/hour", () => {
  assert.deepEqual(handToHandFlyersRange([4, 4]), { min: 2000, max: 2800 });
  assert.equal(handToHandPlanningFlyers(4), 1000);
  assert.equal(H2H_FLYERS_PER_PROMOTER_HOUR, 250);
});

test("operators and hours from the configurator; travel outside Milano city", () => {
  assert.deepEqual(handToHandOperatorHours({ promoterCount: 2, serviceDurationHours: 4, promoterAssignments: [{ serviceDurationHours: 6 }] }), [6, 4]);
  assert.deepEqual(handToHandOperatorHours({}), [3]);
  assert.equal(handToHandNeedsTravel(["Milano"]), false);
  assert.equal(handToHandNeedsTravel([{ name: "Milano" }, { name: "Monza" }]), true);
});

test("the €22 per 1.000 rate is gone", () => {
  assert.equal(QUOTE_PRICES.h2h, undefined);
  assert.equal(BASE_PRICES.h2h, undefined);
  for (const file of ["src/pages/public/configurator/Step4.jsx", "src/pages/public/QuickQuotePage.jsx", "src/pages/public/configurator/Step2.jsx", "src/pages/public/configurator/Step3.jsx"]) {
    assert.ok(read(file).includes("handToHandPricing.js"), file);
  }
});

test("Step 4 and Quick Quote use the hourly engine; Smart Pairing excluded for Hand to Hand", () => {
  const step4 = read("src/pages/public/configurator/Step4.jsx");
  assert.ok(step4.includes("? calculateHandToHandPricing({ operatorHours: h2hOperatorHours, urgency: data.urgency, planDiscountPct: subDiscPct, extras: distributionExtras })"));
  assert.ok(step4.includes("const disc = !isHandToHandQuote && realSelectedPairingDiscounts.length"));
  assert.ok(step4.includes("travelNote: h2hNeedsTravel ? H2H_TRAVEL_NOTE : null"));
  const step3 = read("src/pages/public/configurator/Step3.jsx");
  assert.ok(step3.includes('const smartPairingNotForService = (data.type || "d2d") === "h2h";'));
  assert.ok(step3.includes("const realSmartPairingSlots = smartPairingNotForService ? [] :"));
  const quick = read("src/pages/public/QuickQuotePage.jsx");
  assert.ok(quick.includes("? calculateHandToHandPricing({ operatorHours: h2hOperatorHours, urgency, extras: extraLineItems })"));
  assert.ok(quick.includes("<FieldLabel>3. Operatori e ore</FieldLabel>"));
});

test("readable calculation in summaries; 'Materiale' instead of 'Volantini'/'Quantità' in Step 4", async () => {
  const { describeHandToHandCalculation } = await import("../src/lib/pricing/handToHandPricing.js");
  assert.equal(describeHandToHandCalculation([4, 4]), "2 operatori × 4 ore = 8 ore totali × €25/ora = €200,00");
  assert.equal(describeHandToHandCalculation([4, 6]), "Ore per operatore 4 + 6 = 10 ore totali × €25/ora = €250,00");
  assert.equal(describeHandToHandCalculation([3]), "1 operatore × 3 ore = 3 ore totali × €25/ora = €75,00");
  assert.ok(read("src/components/Step1Summary.jsx").includes("{h2h.calculation}"));
  assert.ok(read("src/pages/public/configurator/step4/Step4PricingSummaryPanel.jsx").includes("{h2hDetail.calculation}"));
  const step4 = read("src/pages/public/configurator/Step4.jsx");
  assert.ok(step4.includes('[isHandToHandQuote ? "Materiale" : "Volantini", formatNumber(flyerQty), C.orange]'));
  assert.ok(step4.includes('l: isHandToHandQuote ? "materiale" : "quantità",'));
  assert.ok(step4.includes('l: isHandToHandQuote ? "Materiale" : "Quantità",'));
  assert.equal(step4.split('l: isHandToHandQuote ? "Materiale assegnato" : "Quantità assegnata",').length - 1, 2);
});

test("Smart Pairing texts say the real maximum (40% same zone, on distribution)", () => {
  assert.ok(read("src/pages/public/ServiceCenter.jsx").includes("Riduci il costo della distribuzione fino al 40% senza rinunciare a nulla."));
  assert.doesNotMatch(read("src/pages/public/ServiceCenter.jsx"), /fino al 20%/);
  assert.ok(read("src/components/home/SmartPairingSection.jsx").includes("Risparmio fino al 40% sulla distribuzione"));
});
