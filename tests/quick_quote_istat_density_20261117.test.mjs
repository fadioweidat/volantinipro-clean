// 2026-11-17 (decisione Fadi: "Allinea a €330"): il Preventivo Rapido e
// l'esempio della homepage usano la densita' ISTAT del comune, come lo Step 4
// e le pagine citta'. Prima conoscevano solo il nome e ricadevano sulla fascia
// Hinterland di riserva: Rho, Segrate, Brescia... €260 invece di €330.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildQuickQuoteDistributionZones } from "../src/lib/quickQuote/quickQuoteDistributionZones.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";
import { calculateDistributionZonePrice } from "../src/lib/pricing/distributionPricing.js";
import { classifyMunicipalityForPrice, municipalityIstatDensity, withIstatDensity } from "../src/lib/step2/municipalityPricingTier.js";
import { CITY_SLUGS, cityFacts } from "../src/lib/seo/cityPagesData.js";
import { calculateHomepagePriceExample } from "../src/lib/pricing/homepagePricing.js";

const quickPrice = (comuni, breakdown, quantity) => {
  const z = buildQuickQuoteDistributionZones({ comuni, breakdown, quantity, allMatched: true });
  return calculateQuotePricing({ quantity, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: z.priceable ? z.zones : null }).baseCost;
};

test("ogni pagina citta': pagina = Step 4 = Preventivo Rapido per 5.000 volantini", () => {
  for (const slug of CITY_SLUGS) {
    const f = cityFacts(slug);
    const step4 = calculateDistributionZonePrice(classifyMunicipalityForPrice({ name: f.name }).tier, 5000);
    assert.equal(step4, f.price5000, `${slug}: Step 4 ${step4} vs pagina ${f.price5000}`);
    assert.equal(quickPrice([{ name: f.name }], [], 5000), f.price5000, `${slug}: Preventivo Rapido vs pagina`);
  }
});

test("Rho, Segrate, Brescia: €330 nel Preventivo Rapido (fascia Como/Lecco per densita')", () => {
  for (const name of ["Rho", "Segrate", "Brescia"]) assert.equal(quickPrice([{ name }], [], 5000), 330, name);
});

test("comuni con eccezione per nome restano invariati; Milano + Cormano + Bresso = €23.171,53", () => {
  assert.equal(quickPrice([{ name: "Cormano" }], [], 5000), 260);
  assert.equal(quickPrice([{ name: "Sesto San Giovanni" }], [], 5000), 260);
  assert.equal(quickPrice([{ name: "Milano" }], [], 5000), 210);
  const multi = quickPrice(
    [{ name: "Milano" }, { name: "Cormano" }, { name: "Bresso" }],
    [{ municipality: "Milano", recommendedQuantity: 816076 }, { municipality: "Cormano", recommendedQuantity: 10227 }, { municipality: "Bresso", recommendedQuantity: 13654 }],
    839957,
  );
  assert.equal(multi, 23171.53);
});

test("multi-comune con un comune poco denso: ogni comune con la sua fascia", () => {
  const z = buildQuickQuoteDistributionZones({
    comuni: [{ name: "Cormano" }, { name: "Rho" }],
    breakdown: [{ municipality: "Cormano", recommendedQuantity: 10227 }, { municipality: "Rho", recommendedQuantity: 25000 }],
    quantity: 35227,
    allMatched: true,
  });
  assert.deepEqual(z.perComune.map((c) => [c.name, c.territory]), [["Cormano", "HINTERLAND_DENSE"], ["Rho", "COMO_LECCO"]]);
});

test("comune fuori indice ISTAT: nessuna densita' inventata, nome invariato", () => {
  assert.equal(municipalityIstatDensity({ name: "ComuneInesistente" }), null);
  const c = { name: "ComuneInesistente" };
  assert.equal(withIstatDensity(c), c);
  assert.deepEqual(withIstatDensity({ name: "rho (mi)" }), { name: "Rho", densita: withIstatDensity({ name: "Rho" }).densita });
});

test("esempio homepage (Cormano) invariato; il codice usa la densita' ISTAT", () => {
  const expected = calculateQuotePricing({ quantity: 5000, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: [{ territory: "HINTERLAND_DENSE", quantity: 5000 }] }).total;
  assert.equal(calculateHomepagePriceExample({ comune: "Cormano", quantity: 5000 }).total, expected);
  const src = fs.readFileSync(new URL("../src/lib/pricing/homepagePricing.js", import.meta.url), "utf8");
  assert.match(src, /selectedComuni: \[withIstatDensity\(\{ name: comune \}\)\]/);
});
