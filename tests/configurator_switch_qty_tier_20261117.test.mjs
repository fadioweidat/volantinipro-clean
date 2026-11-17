// Correzioni configuratore 2026-11-17 (OK Fadi: "Correggi 1, 2 e 3", fascia opzione b).
// 1) cambio servizio nei pulsanti dello Step 2: la zona campagna viene ricreata;
// 2) "Aumenta quantita'" nello Step 4 multi-comune: la nuova quantita' e'
//    ripartita per comune in proporzione al fabbisogno (niente fallback sulla
//    fascia del primo comune);
// 3) Bresso, Corsico, Cusano Milanino: fascia Hinterland (densita' >= 6000 ma
//    non Milano), uguale in Step 4, Preventivo Rapido e pagine citta'.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyTerritory, calculateMultiZoneDistributionPrice } from "../src/lib/pricing/distributionPricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";
import { rescaleZonesAllocationToQuantity, withAllocationForQuantity } from "../src/lib/pricing/rescaleZonesAllocation.js";
import { buildQuickQuoteDistributionZones } from "../src/lib/quickQuote/quickQuoteDistributionZones.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";

// 88 NIL di Milano con fabbisogno reale 816.076 (valori qualsiasi, somma esatta).
function milanoNilRows(assignedTotal) {
  let left = 816076;
  let leftAssigned = assignedTotal;
  return Array.from({ length: 88 }, (_, i) => {
    const required = i === 87 ? left : 9273;
    left -= required;
    const assigned = i === 87 ? leftAssigned : Math.min(leftAssigned, assignedTotal ? 0 : 0);
    leftAssigned -= assigned;
    return { name: `NIL ${i + 1}`, isNil: true, nilCode: String(i + 1), requiredFlyers: required, assignedFlyers: assigned };
  });
}
const selectedComuni = [{ name: "Cormano" }, { name: "Bresso" }, { name: "Milano" }];

test("3) Bresso, Corsico, Cusano Milanino sono Hinterland anche con densita' >= 6000; Milano resta Milano", () => {
  assert.equal(classifyTerritory({ name: "Bresso", densityPerKm2: 7838.55 }).tier, "HINTERLAND_DENSE");
  assert.equal(classifyTerritory({ name: "Corsico", densityPerKm2: 6728.28 }).tier, "HINTERLAND_DENSE");
  assert.equal(classifyTerritory({ name: "Cusano Milanino", densityPerKm2: 6072.05 }).tier, "HINTERLAND_DENSE");
  assert.equal(classifyTerritory({ name: "Milano", densityPerKm2: 7538.2 }).tier, "MILANO_CORE");
});

test("3) Step 4 con densita' reali (Bresso 7.839) = Preventivo Rapido = €23.171,53", () => {
  const zonesAllocation = [
    ...milanoNilRows(0).map((r) => ({ ...r, assignedFlyers: r.requiredFlyers })),
    { name: "Cormano", densita: 4625, requiredFlyers: 10227, assignedFlyers: 10227 },
    { name: "Bresso", densita: 7839, requiredFlyers: 13654, assignedFlyers: 13654 },
  ];
  const step4 = resolveConfiguratorDistributionZones({ selectedComuni, zonesAllocation }, 839957);
  assert.equal(step4.multiZone, true);
  assert.equal(calculateMultiZoneDistributionPrice(step4.zones).distributionSubtotal, 23171.53);
  const qq = buildQuickQuoteDistributionZones({
    comuni: [{ name: "Milano" }, { name: "Cormano" }, { name: "Bresso" }],
    breakdown: [
      { municipality: "Milano", recommendedQuantity: 816076 },
      { municipality: "Cormano", recommendedQuantity: 10227 },
      { municipality: "Bresso", recommendedQuantity: 13654 },
    ],
    quantity: 839957,
    allMatched: true,
  });
  const qqPrice = calculateQuotePricing({ quantity: 839957, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: qq.zones }).baseCost;
  assert.equal(qqPrice, 23171.53);
});

test("2) quantita' alzata nello Step 4: ripartizione per fabbisogno, prezzo per comune (non €28.708,54)", () => {
  // Step 2 a 10.000 pz: tutto su Cormano, Bresso e NIL a 0 (ordine di allocazione).
  const zonesAllocation = [
    ...milanoNilRows(0),
    { name: "Cormano", densita: 4625, requiredFlyers: 10227, assignedFlyers: 10000 },
    { name: "Bresso", densita: 7839, requiredFlyers: 13654, assignedFlyers: 0 },
  ];
  const before = resolveConfiguratorDistributionZones({ selectedComuni, zonesAllocation }, 839957);
  assert.equal(before.multiZone, false, "senza ripartizione: fallback sulla fascia del primo comune");
  assert.equal(calculateMultiZoneDistributionPrice(before.zones).distributionSubtotal, 28708.54);

  const input = withAllocationForQuantity({ selectedComuni, zonesAllocation }, 839957);
  const total = input.zonesAllocation.reduce((s, r) => s + r.assignedFlyers, 0);
  assert.equal(total, 839957);
  const after = resolveConfiguratorDistributionZones(input, 839957);
  assert.equal(after.multiZone, true);
  assert.deepEqual(after.zones, [
    { territory: "HINTERLAND_DENSE", quantity: 10227 },
    { territory: "HINTERLAND_DENSE", quantity: 13654 },
    { territory: "MILANO_CORE", quantity: 816076 },
  ]);
  assert.equal(calculateMultiZoneDistributionPrice(after.zones).distributionSubtotal, 23171.53);
});

test("2) quantita' invariata: la ripartizione scelta nello Step 2 non cambia", () => {
  const rows = [
    { name: "Cormano", requiredFlyers: 10227, assignedFlyers: 10000 },
    { name: "Bresso", requiredFlyers: 13654, assignedFlyers: 0 },
  ];
  assert.equal(rescaleZonesAllocationToQuantity(rows, 10000), rows);
  const input = { zonesAllocation: rows };
  assert.equal(withAllocationForQuantity(input, 10000), input);
});

test("2) ripartizione: somma esatta, resti al piu' grande, nessun dato inventato senza fabbisogno", () => {
  const rows = [{ requiredFlyers: 1 }, { requiredFlyers: 1 }, { requiredFlyers: 1 }].map((r) => ({ ...r, assignedFlyers: 0 }));
  assert.deepEqual(rescaleZonesAllocationToQuantity(rows, 10).map((r) => r.assignedFlyers), [4, 3, 3]);
  const noWeights = [{ assignedFlyers: 5 }, { assignedFlyers: 0 }];
  assert.equal(rescaleZonesAllocationToQuantity(noWeights, 100), noWeights);
  assert.equal(rescaleZonesAllocationToQuantity([{ requiredFlyers: 5, assignedFlyers: 5 }], 100).length, 1);
});

test("2) Step 3 e Step 4 usano la ripartizione allineata alla quantita' del preventivo", () => {
  const step4 = fs.readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");
  assert.match(step4, /resolveConfiguratorDistributionZones\(withAllocationForQuantity\(singlePointOfSaleDistributionInput \|\| data, flyerQty\), flyerQty\)/);
  const step3 = fs.readFileSync(new URL("../src/pages/public/configurator/Step3.jsx", import.meta.url), "utf8");
  assert.match(step3, /resolveConfiguratorDistributionZones\(withAllocationForQuantity\(data, activeQty\), activeQty\)/);
});

test("1) cambio servizio nello Step 2: la zona campagna viene ricreata quando l'elenco si svuota", () => {
  const src = fs.readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
  assert.match(src, /const initializeCampaignZones = \(\) => \{/);
  assert.match(src, /if \(!data\.campaignZones \|\| data\.campaignZones\.length === 0\) \{\s+initializeCampaignZones\(\);/);
  assert.match(src, /const campaignZonesEmpty = !Array\.isArray\(data\.campaignZones\) \|\| data\.campaignZones\.length === 0;/);
  assert.match(src, /if \(campaignZonesEmpty\) initializeCampaignZones\(\);\s+\}, \[campaignZonesEmpty\]\);/);
  const transition = fs.readFileSync(new URL("../src/lib/configuratorServiceTransition.js", import.meta.url), "utf8");
  assert.match(transition, /campaignZones: \[\],/, "il cambio servizio azzera ancora le zone del servizio precedente");
});
