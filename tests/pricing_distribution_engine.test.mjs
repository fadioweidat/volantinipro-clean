import assert from "node:assert/strict";
import test from "node:test";
import {
  TERRITORY_TIERS,
  interpolateGridPrice,
  calculateDistributionZonePrice,
  calculateMultiZoneDistributionPrice,
  classifyTerritory,
  calculateDoorToDoorPricing,
  estimateOperatorDays,
  roundMoney,
  URGENCY_LEVELS,
  PLAN_CODES,
} from "../src/lib/pricing/distributionPricing.js";
import { calculateExtrasWithControlPro, CONTROL_PRO_PRICE } from "../src/lib/pricing/controlProBundle.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";

const { MILANO_CORE, HINTERLAND_DENSE, COMO_LECCO, LOW_DENSITY_MOUNTAIN } = TERRITORY_TIERS;

// Sezione 22 del ticket — casi test prezzi, ognuno mappato 1:1 sul test
// case corrispondente (A..L) cosi' un fallimento e' immediatamente
// leggibile come "quale lettera del ticket e' rotta".

test("TEST A — Milano 10.000 standard singola no extra = €350", () => {
  const r = calculateDoorToDoorPricing({ zones: [{ territory: MILANO_CORE, quantity: 10000 }] });
  assert.equal(r.distributionTotal, 350);
});

test("TEST B — Seveso (hinterland) 10.000 = €420", () => {
  assert.equal(classifyTerritory({ name: "Seveso" }).tier, HINTERLAND_DENSE);
  const r = calculateDoorToDoorPricing({ zones: [{ territory: HINTERLAND_DENSE, quantity: 10000 }] });
  assert.equal(r.distributionTotal, 420);
});

test("TEST C — Como 10.000 = €520", () => {
  assert.equal(classifyTerritory({ name: "Como" }).tier, COMO_LECCO);
  const r = calculateDoorToDoorPricing({ zones: [{ territory: COMO_LECCO, quantity: 10000 }] });
  assert.equal(r.distributionTotal, 520);
});

test("TEST D — Sondrio/montagna 10.000 = €750", () => {
  assert.equal(classifyTerritory({ name: "Sondrio" }).tier, LOW_DENSITY_MOUNTAIN);
  const r = calculateDoorToDoorPricing({ zones: [{ territory: LOW_DENSITY_MOUNTAIN, quantity: 10000 }] });
  assert.equal(r.distributionTotal, 750);
});

test("TEST E — Milano 5.000 = €210", () => {
  const r = calculateDoorToDoorPricing({ zones: [{ territory: MILANO_CORE, quantity: 5000 }] });
  assert.equal(r.distributionTotal, 210);
});

test("TEST F — Milano 7.500 = interpolato stabilmente tra €210 e €350", () => {
  const price = calculateDistributionZonePrice(MILANO_CORE, 7500);
  assert.ok(price > 210 && price < 350, `atteso tra 210 e 350, ottenuto ${price}`);
  assert.equal(price, 280); // punto medio esatto tra i due tier (interpolazione lineare)
  // Monotonia attorno al punto (nessuno scalino brutale, sezione 4)
  const p7499 = calculateDistributionZonePrice(MILANO_CORE, 7499);
  const p7501 = calculateDistributionZonePrice(MILANO_CORE, 7501);
  assert.ok(p7499 < price && price < p7501);
});

test("TEST G — Milano 10.000 Urgente: distribuzione prima di altri aggiustamenti = €420 (base €350 + 20%)", () => {
  const r = calculateDoorToDoorPricing({ zones: [{ territory: MILANO_CORE, quantity: 10000 }], urgency: URGENCY_LEVELS.URGENT });
  assert.equal(r.distributionSubtotal, 350);
  assert.equal(r.urgencySurcharge, 70);
  assert.equal(r.preDiscountSubtotal, 420);
});

test("TEST H — Milano 10.000 Express: €350 x 1.35 = €472,50", () => {
  const r = calculateDoorToDoorPricing({ zones: [{ territory: MILANO_CORE, quantity: 10000 }], urgency: URGENCY_LEVELS.EXPRESS });
  assert.equal(r.preDiscountSubtotal, 472.5);
  assert.equal(r.distributionTotal, 472.5);
});

test("TEST I — Milano 10.000 Annuale: €350 - 8% = €322", () => {
  const r = calculateDoorToDoorPricing({ zones: [{ territory: MILANO_CORE, quantity: 10000 }], planCode: PLAN_CODES.ANNUAL });
  assert.equal(r.planDiscountAmount, 28);
  assert.equal(r.distributionTotal, 322);
});

test("TEST J — Sondrio 1.000: minimo economico €220 (non il prezzo di griglia se piu' basso)", () => {
  const r = calculateDoorToDoorPricing({ zones: [{ territory: LOW_DENSITY_MOUNTAIN, quantity: 1000 }] });
  assert.equal(r.distributionTotal, 220);
  // Verifica esplicita del floor anche per una quantita' fittizia molto piccola
  assert.equal(calculateDistributionZonePrice(MILANO_CORE, 10), 120);
});

test("TEST K — campagna multi-comune: MAI la tariffa del primo comune applicata a tutta la quantita'", () => {
  // 10.000 divisi su Varese-equivalente (hinterland, 6000) + montagna (4000)
  // — NON deve risultare uguale a "10000 tutti al tier del primo comune".
  const zones = [
    { territory: HINTERLAND_DENSE, quantity: 6000 },
    { territory: LOW_DENSITY_MOUNTAIN, quantity: 4000 },
  ];
  const { zonePrices, distributionSubtotal } = calculateMultiZoneDistributionPrice(zones);
  const firstComuneOnlyPrice = calculateDistributionZonePrice(HINTERLAND_DENSE, 10000);
  assert.notEqual(distributionSubtotal, firstComuneOnlyPrice);
  assert.equal(zonePrices.length, 2);
  assert.equal(distributionSubtotal, roundMoney(zonePrices[0].price + zonePrices[1].price));
});

test("TEST L — Controllo Pro: €99 senza duplicare GPS/foto proof gia' inclusi", () => {
  const selected = [
    { id: "tracking_gps", price: 60 },
    { id: "photo_proof", price: 30 },
    { id: "graphic_design", price: 79 }, // non incluso nel bundle, resta a parte
  ];
  const { extraCost, dedupedIds } = calculateExtrasWithControlPro(selected, true);
  assert.equal(extraCost, CONTROL_PRO_PRICE + 79);
  assert.deepEqual(dedupedIds.sort(), ["photo_proof", "tracking_gps"]);

  // Senza Controllo Pro selezionato: nessun dedup, somma normale.
  const normal = calculateExtrasWithControlPro(selected, false);
  assert.equal(normal.extraCost, 60 + 30 + 79);
});

test("Interpolazione: estrapolazione sotto il primo tier e sopra l'ultimo resta monotona e non negativa", () => {
  const below = interpolateGridPrice(MILANO_CORE, 100);
  assert.ok(below >= 0 && below < 120);
  const above = interpolateGridPrice(MILANO_CORE, 60000);
  assert.ok(above > 1500);
});

test("Classificazione: fallback prudente quando non c'e' ne' nome ne' densita' affidabile", () => {
  const result = classifyTerritory({});
  assert.equal(result.tier, HINTERLAND_DENSE);
  assert.equal(result.confidence, "low");
});

test("Classificazione: densita' reale guida il fallback per comuni non nell'elenco esplicito", () => {
  const dense = classifyTerritory({ name: "ComuneSconosciutoXYZ", densityPerKm2: 7000 });
  assert.equal(dense.tier, MILANO_CORE);
  assert.equal(dense.confidence, "density");
  const rural = classifyTerritory({ name: "ComuneSconosciutoXYZ", densityPerKm2: 300 });
  assert.equal(rural.tier, LOW_DENSITY_MOUNTAIN);
});

test("Admin KPI giornate/uomo (sezioni 16-17): nessun costo del personale inventato, solo giornate stimate", () => {
  const r = estimateOperatorDays(MILANO_CORE, 10000, 3);
  assert.equal(r.operatorDays, roundMoney(10000 / 2750));
  assert.equal(r.teamDays, roundMoney((10000 / 2750) / 3));
  assert.equal(r.assumedTeamSize, 3);
});

test("Money rounding: un solo punto di arrotondamento, niente drift da floating point", () => {
  assert.equal(roundMoney(472.500000001), 472.5);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
});

// Sezione 21 — Quick Quote e Step4 devono produrre lo stesso prezzo per lo
// stesso input, perche' ora condividono la stessa calculateQuotePricing().
// Qui verifichiamo direttamente il bug gia' corretto: prima "express" non
// applicava ALCUN sovrapprezzo nel totale finale (solo binario "urgent").
test("calculateQuotePricing: urgenza a 3 livelli (fix del bug pre-esistente su express)", () => {
  const standard = calculateQuotePricing({ quantity: 10000, pricePerThousand: 18.5, urgency: "normal" });
  const urgent = calculateQuotePricing({ quantity: 10000, pricePerThousand: 18.5, urgency: "urgent" });
  const express = calculateQuotePricing({ quantity: 10000, pricePerThousand: 18.5, urgency: "express" });
  assert.equal(standard.urgencySurcharge, 0);
  assert.equal(urgent.urgencySurcharge, roundMoney(standard.baseCost * 0.2));
  assert.equal(express.urgencySurcharge, roundMoney(standard.baseCost * 0.35));
  assert.ok(express.urgencySurcharge > urgent.urgencySurcharge, "express deve costare di piu' di urgent, prima non costava nulla in piu' di standard");
});
