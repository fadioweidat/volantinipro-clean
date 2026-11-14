// Preventivo Rapido con piu' comuni (2026-11-14): prima applicava la tariffa
// fissa 18,50 €/1.000 a tutta la quantita' (Milano + Cormano + Bresso costava
// €15.539,20, meno di Milano da sola €22.184,05). Ora ogni comune e' prezzato
// con il listino sulla sua quantita' e i prezzi si sommano, come nello Step 4.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildQuickQuoteDistributionZones } from "../src/lib/quickQuote/quickQuoteDistributionZones.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { calculateMultiZoneDistributionPrice, calculateDistributionZonePrice } from "../src/lib/pricing/distributionPricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";

const comuni = [{ name: "Milano" }, { name: "Cormano" }, { name: "Bresso" }];
const breakdown = [
  { municipality: "Milano", recommendedQuantity: 816076 },
  { municipality: "Cormano", recommendedQuantity: 10227 },
  { municipality: "Bresso", recommendedQuantity: 13654 },
];
const quickPrice = (input) => {
  const z = buildQuickQuoteDistributionZones(input);
  return calculateQuotePricing({ quantity: input.quantity, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: z.priceable ? z.zones : null }).baseCost;
};
// Step 4: stesse zone dalla ripartizione reale dello Step 2 (zonesAllocation).
const step4Price = (rows) => {
  const zones = resolveConfiguratorDistributionZones({ selectedComuni: rows.map(([name]) => ({ name })), zonesAllocation: rows.map(([name, q]) => ({ name, assignedFlyers: q })) }, rows.reduce((s, [, q]) => s + q, 0)).zones;
  return calculateMultiZoneDistributionPrice(zones).distributionSubtotal;
};

test("Milano + Cormano + Bresso (automatica) = listino per comune = Step 4, e costa piu' di Milano da sola", () => {
  const multi = quickPrice({ comuni, breakdown, quantity: 839957, allMatched: true });
  assert.equal(multi, 23171.53);
  assert.equal(multi, step4Price([["Milano", 816076], ["Cormano", 10227], ["Bresso", 13654]]));
  const alone = quickPrice({ comuni: [{ name: "Milano" }], breakdown: [breakdown[0]], quantity: 816076, allMatched: true });
  assert.equal(alone, 22184.05);
  assert.ok(multi > alone, `${multi} > ${alone}`);
  assert.notEqual(multi, 15539.2, "mai piu' la tariffa fissa 18,50 €/1.000");
});

test("Cormano + Bresso = €987,48 come lo Step 4 su www (€428,63 + €558,85)", () => {
  const z = buildQuickQuoteDistributionZones({ comuni: comuni.slice(1), breakdown: breakdown.slice(1), quantity: 23881, allMatched: true });
  assert.deepEqual(z.perComune.map((c) => [c.name, c.quantity, calculateDistributionZonePrice(c.territory, c.quantity)]), [["Cormano", 10227, 428.63], ["Bresso", 13654, 558.85]]);
  assert.equal(quickPrice({ comuni: comuni.slice(1), breakdown: breakdown.slice(1), quantity: 23881, allMatched: true }), 987.48);
});

test("quantita' manuale sotto e sopra il fabbisogno: la somma per comune e' sempre la quantita' richiesta", () => {
  for (const q of [10000, 23881, 50000, 1]) {
    const z = buildQuickQuoteDistributionZones({ comuni: comuni.slice(1), breakdown: breakdown.slice(1), quantity: q, allMatched: true });
    if (q < 2) { assert.equal(z.priceable, false, "un comune a 0 pezzi non e' prezzabile"); continue; }
    assert.equal(z.perComune.reduce((s, c) => s + c.quantity, 0), q);
  }
  // 50.000 su un fabbisogno di 23.881: l'eccedenza e' ripartita, non persa.
  const over = buildQuickQuoteDistributionZones({ comuni: comuni.slice(1), breakdown: breakdown.slice(1), quantity: 50000, allMatched: true });
  assert.deepEqual(over.perComune.map((c) => c.quantity), [21412, 28588]);
});

test("un solo comune: prezzo invariato rispetto a prima", () => {
  const before = calculateQuotePricing({ quantity: 10000, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: resolveConfiguratorDistributionZones({ selectedComuni: [{ name: "Cormano" }] }, 10000).zones }).baseCost;
  assert.equal(quickPrice({ comuni: [{ name: "Cormano" }], breakdown: [], quantity: 10000, allMatched: true }), before);
  assert.equal(before, 420);
});

test("comune senza dati: nessun prezzo, mai la tariffa fissa", () => {
  const z = buildQuickQuoteDistributionZones({ comuni: comuni.slice(1), breakdown: [breakdown[1], { municipality: "Bresso", recommendedQuantity: null }], quantity: 20000, allMatched: false });
  assert.equal(z.priceable, false);
  assert.equal(z.zones, null);
});

test("QuickQuotePage: niente piu' gate a un solo comune, canPrice blocca il multi-comune senza dati, quantita' reali salvate", () => {
  const src = fs.readFileSync(new URL("../src/pages/public/QuickQuotePage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /service === "d2d" && comuni\.length === 1 && pricingQty > 0/);
  assert.match(src, /buildQuickQuoteDistributionZones\(\{ comuni, breakdown: campaign\.breakdown, quantity: pricingQty, allMatched: campaign\.allMatched \}\)/);
  assert.match(src, /comuni\.length < 2 \|\| \(campaign\.allMatched && campaign\.breakdown\.every/);
  assert.match(src, /quantityByComune\.get\(c\.name\)/);
  assert.match(src, /data-testid="quick-quote-per-comune-prices"/);
});
