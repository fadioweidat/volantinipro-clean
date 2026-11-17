// Hotfix 2026-11-17 (decisione Fadi, opzione b): Bresso, Corsico e Cusano
// Milanino hanno densita' ISTAT >= 6000 ab/km² ma restano fascia Hinterland.
// Pagine citta', Step 4 (indice ISTAT) e Preventivo Rapido devono dare lo
// stesso prezzo: 5.000 volantini = €260 (Milano citta' resta €210).
import test from "node:test";
import assert from "node:assert/strict";
import { classifyTerritory, calculateDistributionZonePrice } from "../src/lib/pricing/distributionPricing.js";
import { classifyMunicipalityForPrice } from "../src/lib/step2/municipalityPricingTier.js";
import { cityFacts } from "../src/lib/seo/cityPagesData.js";

for (const [slug, name, density] of [["bresso", "Bresso", 7838.55], ["corsico", "Corsico", 6728.28], [null, "Cusano Milanino", 6072.05]]) {
  test(`${name}: Hinterland ovunque (pagina, Step 4, Preventivo Rapido)`, () => {
    assert.equal(classifyTerritory({ name, densityPerKm2: density }).tier, "HINTERLAND_DENSE");
    assert.equal(classifyTerritory({ name }).tier, "HINTERLAND_DENSE");
    assert.equal(classifyMunicipalityForPrice({ name }).tier, "HINTERLAND_DENSE");
    if (slug) {
      const f = cityFacts(slug);
      assert.equal(f.tier, "HINTERLAND_DENSE");
      assert.equal(f.price5000, 260);
      assert.doesNotMatch(f.tierLabel, /come Milano/);
    }
  });
}

test("Milano citta' resta fascia Milano: 5.000 volantini €210", () => {
  assert.equal(cityFacts("milano").price5000, 210);
  assert.equal(calculateDistributionZonePrice("HINTERLAND_DENSE", 5000), 260);
});
