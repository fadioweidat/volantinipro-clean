import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";
import { TERRITORY_TIERS } from "../src/lib/pricing/distributionPricing.js";

// P0 WIRING REALE — questi test guidano la stessa pipeline che Step3.jsx,
// Step4.jsx e QuickQuotePage.jsx ora chiamano davvero (calculateQuotePricing
// con distributionZones + resolveConfiguratorDistributionZones), non solo
// il motore puro isolato — la parte del ticket precedente lasciata a meta'.

test("resolveConfiguratorDistributionZones — zona singola (nessun campaignZones multi-comune reale)", async (t) => {
  await t.test("Milano singolo comune -> una zona, territorio corretto, quantita' intatta", () => {
    const { zones, multiZone } = resolveConfiguratorDistributionZones(
      { selectedComuni: [{ name: "Milano" }] }, 10000
    );
    assert.equal(multiZone, false);
    assert.deepEqual(zones, [{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 10000 }]);
  });

  await t.test("nessun comune selezionato ma cityName presente -> usa cityName", () => {
    const { zones } = resolveConfiguratorDistributionZones({ cityName: "Sondrio" }, 1000);
    assert.equal(zones[0].territory, TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN);
  });

  await t.test("quantita' non valida -> nessuna zona (mai inventare)", () => {
    const { zones } = resolveConfiguratorDistributionZones({ selectedComuni: [{ name: "Milano" }] }, 0);
    assert.deepEqual(zones, []);
  });
});

test("resolveConfiguratorDistributionZones — multi-comune reale (zonesAllocation)", async (t) => {
  await t.test("2 comuni con allocazione reale -> 2 zone con le quantita' REALI, non una divisione arbitraria", () => {
    const data = {
      selectedComuni: [{ name: "Seveso" }, { name: "Meda" }],
      zonesAllocation: [
        { name: "Seveso", assignedFlyers: 6000, requiredFlyers: 6000 },
        { name: "Meda", assignedFlyers: 4000, requiredFlyers: 4000 },
      ],
    };
    const { zones, multiZone } = resolveConfiguratorDistributionZones(data, 10000);
    assert.equal(multiZone, true);
    assert.equal(zones.length, 2);
    assert.deepEqual(zones.map((z) => z.quantity).sort((a, b) => a - b), [4000, 6000]);
    assert.ok(zones.every((z) => z.territory === TERRITORY_TIERS.HINTERLAND_DENSE));
  });

  await t.test("Milano + Sondrio -> due territori diversi, mai un'unica tariffa", () => {
    const data = {
      selectedComuni: [{ name: "Milano" }, { name: "Sondrio" }],
      zonesAllocation: [
        { name: "Milano", assignedFlyers: 5000 },
        { name: "Sondrio", assignedFlyers: 5000 },
      ],
    };
    const { zones } = resolveConfiguratorDistributionZones(data, 10000);
    const territories = zones.map((z) => z.territory).sort();
    assert.deepEqual(territories, [TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN, TERRITORY_TIERS.MILANO_CORE].sort());
  });

  await t.test("un comune selezionato senza allocazione reale corrispondente -> ricade su zona singola, MAI una somma parziale silenziosa", () => {
    const data = {
      selectedComuni: [{ name: "Seveso" }, { name: "Meda" }],
      zonesAllocation: [{ name: "Seveso", assignedFlyers: 6000 }], // manca Meda
    };
    const { zones, multiZone } = resolveConfiguratorDistributionZones(data, 10000);
    assert.equal(multiZone, false);
    assert.equal(zones.length, 1);
    assert.equal(zones[0].quantity, 10000); // quantita' aggregata intatta, non 6000 troncato
  });
});

test("calculateQuotePricing + distributionZones — stessa pipeline usata da Step3/Step4/QuickQuote", async (t) => {
  await t.test("Milano 10.000 = €350 (baseCost dalla griglia, non piu' flat QUOTE_PRICES)", () => {
    const r = calculateQuotePricing({
      quantity: 10000,
      pricePerThousand: 18.5, // presente ma IGNORATO per baseCost quando distributionZones e' valorizzato
      distributionZones: [{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 10000 }],
    });
    assert.equal(r.baseCost, 350);
    assert.equal(r.total, 350);
  });

  await t.test("Seveso 10.000 = €420", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5,
      distributionZones: [{ territory: TERRITORY_TIERS.HINTERLAND_DENSE, quantity: 10000 }],
    });
    assert.equal(r.total, 420);
  });

  await t.test("Como 10.000 = €520", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5,
      distributionZones: [{ territory: TERRITORY_TIERS.COMO_LECCO, quantity: 10000 }],
    });
    assert.equal(r.total, 520);
  });

  await t.test("Sondrio 10.000 = €750", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5,
      distributionZones: [{ territory: TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN, quantity: 10000 }],
    });
    assert.equal(r.total, 750);
  });

  await t.test("Milano 7.500 = interpolazione condivisa (280, punto medio esatto)", () => {
    const r = calculateQuotePricing({
      quantity: 7500, pricePerThousand: 18.5,
      distributionZones: [{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 7500 }],
    });
    assert.equal(r.baseCost, 280);
  });

  await t.test("Milano 10.000 Urgente live +20%", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5, urgency: "urgent",
      distributionZones: [{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 10000 }],
    });
    assert.equal(r.urgencySurcharge, 70);
    assert.equal(r.subtotalBeforePlan, 420);
  });

  await t.test("Milano 10.000 Express live +35%", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5, urgency: "express",
      distributionZones: [{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 10000 }],
    });
    assert.equal(r.urgencySurcharge, 122.5);
    assert.equal(r.total, 472.5);
  });

  await t.test("Milano 10.000 Annuale live -8%", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5, planDiscountPct: 8,
      distributionZones: [{ territory: TERRITORY_TIERS.MILANO_CORE, quantity: 10000 }],
    });
    assert.equal(r.planDiscountAmount, 28);
    assert.equal(r.total, 322);
  });

  await t.test("multi-zona Milano+Sondrio: total = somma delle due zone (mai un'unica tariffa)", () => {
    const r = calculateQuotePricing({
      quantity: 10000, pricePerThousand: 18.5,
      distributionZones: [
        { territory: TERRITORY_TIERS.MILANO_CORE, quantity: 5000 },
        { territory: TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN, quantity: 5000 },
      ],
    });
    // 5000 Milano = 210, 5000 Sondrio = 450 -> 660, mai 10000*tariffa-di-un-solo-territorio
    assert.equal(r.baseCost, 660);
    assert.notEqual(r.baseCost, 10000 * (18.5 / 1000));
  });

  await t.test("h2h/b2b: senza distributionZones, resta la tariffa flat invariata (nessuna griglia territoriale)", () => {
    const h2h = calculateQuotePricing({ quantity: 10000, pricePerThousand: 22.0 });
    assert.equal(h2h.baseCost, 220); // 10000 * 22/1000, formula flat originale, invariata
    const b2b = calculateQuotePricing({ quantity: 10000, pricePerThousand: 35.0 });
    assert.equal(b2b.baseCost, 350); // stesso VALORE numerico di Milano D2D per coincidenza di questo input, ma da formula flat diversa (verificato sotto)
    const b2bDifferentQty = calculateQuotePricing({ quantity: 7500, pricePerThousand: 35.0 });
    assert.equal(b2bDifferentQty.baseCost, 262.5); // lineare puro, NON l'interpolazione di griglia (che darebbe 280 se fosse Milano D2D)
  });
});
