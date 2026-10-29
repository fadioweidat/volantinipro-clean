import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { GRID_QUANTITIES, TERRITORY_MINIMUMS, TERRITORY_TIERS, calculateDistributionZonePrice, interpolateGridPrice } from "../src/lib/pricing/distributionPricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";
import { calculateHomepagePriceExample, getDoorToDoorCampaignMinimum, getStartingPricePerThousand } from "../src/lib/pricing/homepagePricing.js";

test("D2D starting price is the lowest real per-1.000 rate on the territorial grid (high volumes)", () => {
  const rates = Object.values(TERRITORY_TIERS).flatMap((tier) =>
    GRID_QUANTITIES.map((qty) => (calculateDistributionZonePrice(tier, qty) / qty) * 1000));
  const expected = Math.min(...rates);
  assert.equal(getStartingPricePerThousand("d2d"), expected);
  // Reached at a real grid tier: price of that tier divided by its quantity.
  const tier = Object.values(TERRITORY_TIERS).find((t) =>
    GRID_QUANTITIES.some((q) => (calculateDistributionZonePrice(t, q) / q) * 1000 === expected));
  assert.ok(tier, "rate comes from a real grid point, not from extrapolation");
  // Never below the grid: the extrapolation beyond the last tier is not used.
  const lastQty = GRID_QUANTITIES.at(-1);
  assert.ok(interpolateGridPrice(tier, lastQty * 2) / (lastQty * 2) * 1000 < expected);
});

test("D2D campaign minimum is the lowest per-territory minimum of the engine", () => {
  assert.equal(getDoorToDoorCampaignMinimum(), Math.min(...Object.values(TERRITORY_MINIMUMS)));
  assert.equal(getDoorToDoorCampaignMinimum(), Math.min(...Object.values(TERRITORY_TIERS).map((t) => calculateDistributionZonePrice(t, 1))));
});

test("H2H starting price is the configurator flat rate for 1.000 flyers; Business has no public price", () => {
  // 2026-10-29: Hand to Hand a tariffa oraria (handToHandPricing.js), nessun prezzo per 1.000.
  assert.equal(getStartingPricePerThousand("h2h"), null);
  assert.equal(QUOTE_PRICES.h2h, undefined);
  assert.equal(getStartingPricePerThousand("b2b"), null);
});

test("Cormano example matches the Quick Quote single-comune path", () => {
  const zones = resolveConfiguratorDistributionZones({ selectedComuni: [{ name: "Cormano" }] }, 5000).zones;
  const quick = calculateQuotePricing({ quantity: 5000, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: zones });
  const example = calculateHomepagePriceExample({ comune: "Cormano", provincia: "MI", quantity: 5000 });
  assert.equal(example.total, quick.total);
  assert.ok(Number.isFinite(example.total) && example.total > 0);
});

test("pricing cards carry no hardcoded price and label the example visibly", () => {
  const source = readFileSync(new URL("../src/components/home/ServicesSection.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /€\s?\d/);
  assert.match(source, /startingPriceNote\("d2d"\)/);
  // H2H: no starting price until the rate is confirmed (engine untouched).
  assert.doesNotMatch(source, /startingPriceNote\("h2h"\)/);
  assert.ok(source.includes("priceNote: `${formatQuoteCurrency(H2H_HOURLY_RATE_EUR, 0)} l'ora per operatore`,"));
  assert.ok(source.includes("priceDetail: `Minimo ${H2H_MIN_HOURS_PER_OUTING} ore per uscita · IVA esclusa`,"));
  assert.match(source, /Minimo campagna da \$\{formatQuoteCurrency\(D2D_MINIMUM, 0\)\} · IVA esclusa/);
  assert.match(source, /getDoorToDoorCampaignMinimum\(\)/);
  assert.match(source, /Su progetto/);
  assert.match(source, />\s*Esempio\s*</);
  assert.match(source, /Prezzo finale calcolato in automatico in base a zona, quantità e servizio\. Preventivo immediato, senza impegno\./);
});
