// Coerenza prezzi Door to Door per TUTTI i comuni lombardi (2026-11-17).
// Stesso comune, stessa quantita' => stesso prezzo in:
//  - Step 4 del configuratore (fascia dall'indice ISTAT e righe Step 2 con densita');
//  - Preventivo Rapido (buildQuickQuoteDistributionZones);
//  - pagine citta' (cityFacts);
//  - pagina Prezzi (tabella per fascia ed esempi per citta').
// Se un percorso torna a prezzare con il solo nome (fascia di riserva) o una
// pagina scrive un importo diverso dal motore, questo test fallisce.
import test from "node:test";
import assert from "node:assert/strict";
import { municipalityDensityLombardia } from "../src/lib/step2/municipalityDensityLombardia.generated.js";
import { classifyMunicipalityForPrice } from "../src/lib/step2/municipalityPricingTier.js";
import { calculateDistributionZonePrice, calculateMultiZoneDistributionPrice, GRID_QUANTITIES } from "../src/lib/pricing/distributionPricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";
import { buildQuickQuoteDistributionZones } from "../src/lib/quickQuote/quickQuoteDistributionZones.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";
import { ALL_CITY_SLUGS, cityFacts, formatEuro } from "../src/lib/seo/cityPagesData.js";
import { pricesPageContent } from "../src/lib/seo/pricesPageContent.js";

const QUANTITIES = [1000, 5000, 10000, 30000];

const quickQuotePrice = (name, quantity) => {
  const z = buildQuickQuoteDistributionZones({ comuni: [{ name }], breakdown: [], quantity, allMatched: true });
  return calculateQuotePricing({ quantity, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: z.priceable ? z.zones : null }).baseCost;
};
// Step 4, comune intero: riga dello Step 2 con la densita' del comune.
const step4Price = (name, densita, quantity) => {
  const zones = resolveConfiguratorDistributionZones({ selectedComuni: [{ name, densita }] }, quantity).zones;
  return calculateMultiZoneDistributionPrice(zones).distributionSubtotal;
};

// Nomi presenti una sola volta nell'indice: il Preventivo Rapido cerca per nome.
const nameCount = new Map();
for (const [, name] of municipalityDensityLombardia) nameCount.set(name.toLowerCase(), (nameCount.get(name.toLowerCase()) || 0) + 1);

test("tutti i comuni lombardi: Step 4 = Preventivo Rapido = listino della fascia ISTAT", () => {
  assert.ok(municipalityDensityLombardia.length >= 1500, "indice ISTAT Lombardia completo");
  const mismatches = [];
  for (const [code, name, density] of municipalityDensityLombardia) {
    const tier = classifyMunicipalityForPrice({ code }).tier;
    assert.ok(tier, `${name}: fascia ISTAT mancante`);
    for (const qty of QUANTITIES) {
      const expected = calculateDistributionZonePrice(tier, qty);
      const s4 = step4Price(name, density, qty);
      const qq = nameCount.get(name.toLowerCase()) === 1 ? quickQuotePrice(name, qty) : expected;
      if (s4 !== expected || qq !== expected) mismatches.push(`${name} (${code}) ${qty} pz: listino ${expected}, Step 4 ${s4}, Preventivo Rapido ${qq}`);
    }
  }
  assert.deepEqual(mismatches.slice(0, 20), [], `${mismatches.length} differenze`);
});

test("pagine citta': prezzi 5.000 e 10.000 = Step 4 = Preventivo Rapido", () => {
  for (const slug of ALL_CITY_SLUGS) {
    const f = cityFacts(slug);
    if (!f) continue;
    const istat = classifyMunicipalityForPrice({ name: f.name }).tier;
    assert.equal(f.tier, istat, `${slug}: fascia pagina ${f.tier} vs Step 4 ${istat}`);
    for (const [qty, pagePrice] of [[5000, f.price5000], [10000, f.price10000]]) {
      assert.equal(quickQuotePrice(f.name, qty), pagePrice, `${slug} ${qty} pz: Preventivo Rapido vs pagina`);
      assert.equal(calculateDistributionZonePrice(istat, qty), pagePrice, `${slug} ${qty} pz: Step 4 vs pagina`);
    }
  }
});

test("pagina Prezzi: tabella per fascia ed esempi per citta' dal motore", () => {
  for (const row of pricesPageContent.grid) {
    pricesPageContent.tierColumns.forEach(({ tier }, i) => {
      assert.equal(row.prices[i], formatEuro(calculateDistributionZonePrice(tier, row.qty)), `griglia ${row.qty} ${tier}`);
    });
  }
  assert.deepEqual(pricesPageContent.grid.map((r) => r.qty), GRID_QUANTITIES);
  for (const ex of pricesPageContent.cityExamples) {
    assert.equal(ex.price5000, formatEuro(quickQuotePrice(ex.name, 5000)), `${ex.slug}: esempio 5.000 vs Preventivo Rapido`);
    assert.equal(ex.price10000, formatEuro(quickQuotePrice(ex.name, 10000)), `${ex.slug}: esempio 10.000 vs Preventivo Rapido`);
  }
});
