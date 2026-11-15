// Tabella v2 title/description pagine città (approvata 2026-11-15): controllo
// riga per riga, con il prezzo ricalcolato qui dal motore (non dal modulo testi).
import assert from "node:assert/strict";
import test from "node:test";
import { getRouteMetadata } from "../src/lib/seo/routePolicy.js";
import { CITY_SLUGS, cityFacts, cityPath, formatEuro, formatInt } from "../src/lib/seo/cityPagesData.js";
import { calculateDistributionZonePrice, classifyTerritory } from "../src/lib/pricing/distributionPricing.js";

const ISTAT = "ISTAT, famiglie al 31/12/2024";
const SLUGS = ["milano", ...CITY_SLUGS];
const pathOf = (slug) => (slug === "milano" ? "/distribuzione-volantini-milano" : cityPath(slug));
// Comuni il cui nome rende il title > 60 anche senza brand (regola 1: il comune non si accorcia).
const LONG_NAME_TITLES = new Set(["cernusco-sul-naviglio", "san-donato-milanese", "san-giuliano-milanese"]);

test("24 pagine città: una riga per comune", () => {
  assert.equal(SLUGS.length, 24);
});

for (const slug of SLUGS) {
  test(`meta v2 ${slug}: title, lunghezze, comune, prezzo dal motore, ISTAT, parole vietate`, () => {
    const f = cityFacts(slug);
    const { title, description } = getRouteMetadata(pathOf(slug));
    const base = `Volantinaggio e distribuzione volantini ${f.at}`;
    const branded = `${base} | VolantiniPro`;
    // Regola 1
    assert.equal(title, branded.length <= 60 ? branded : base);
    if (LONG_NAME_TITLES.has(slug)) assert.ok(title.length > 60 && title === base);
    else assert.ok(title.length <= 60, `${slug} title ${title.length}`);
    assert.ok(title.includes(f.name));
    // Description
    assert.ok(description.length <= 155, `${slug} description ${description.length}`);
    assert.ok(description.includes(f.name));
    assert.ok(description.includes(`(${ISTAT})`));
    assert.ok(description.includes(formatInt(f.households)));
    const { tier } = classifyTerritory({ name: f.name, densityPerKm2: f.densityPerKm2 });
    const wholeCity = Math.round(f.households * 1.1);
    if (wholeCity < 5000) {
      // Regola 2 (Assago): prezzo del comune intero dal motore.
      assert.equal(slug, "assago");
      assert.ok(description.includes(`${formatInt(wholeCity)} volantini a ${formatEuro(calculateDistributionZonePrice(tier, wholeCity))}`));
    } else {
      assert.ok(description.includes("5.000 volantini"));
      assert.ok(description.includes(formatEuro(calculateDistributionZonePrice(tier, 5000))), `${slug} prezzo 5.000`);
    }
    assert.doesNotMatch(`${title} ${description}`, /garantit|certificat|esatt/i);
    if (/\b(GPS|foto)/i.test(description)) assert.match(description, /opzional/i);
  });
}

test("assago: 4.452 volantini a €308,08 (motore, fascia del comune)", () => {
  assert.match(getRouteMetadata(cityPath("assago")).description, /4\.452 volantini a €308,08 \+ IVA/);
});

test("description tutte diverse anche senza comune, prezzo e cifre", () => {
  const skeletons = SLUGS.map((slug) => {
    const f = cityFacts(slug);
    return getRouteMetadata(pathOf(slug)).description.split(f.name).join("#").replace(/€\d[\d.,]*/g, "€").replace(/\d[\d.,]*/g, "9");
  });
  assert.equal(new Set(skeletons).size, SLUGS.length);
});

test("Hand to Hand: title senza brand e GPS opzionale", () => {
  const { title, description } = getRouteMetadata("/servizi/hand-to-hand");
  assert.equal(title, "Volantinaggio Hand to Hand e distribuzione a mano");
  assert.ok(title.length <= 60);
  assert.match(description, /Tracking GPS opzionale\./);
  assert.ok(description.length <= 155);
});

test("link interni: homepage e Milano verso Sesto San Giovanni e Cinisello Balsamo", async () => {
  const fs = await import("node:fs");
  const { NEARBY_CITY_LINKS } = await import("../src/components/common/NearbyCityLinks.jsx");
  assert.deepEqual(NEARBY_CITY_LINKS.map((l) => [l.href, l.label]), [
    ["/distribuzione-volantini-sesto-san-giovanni", "distribuzione volantini a Sesto San Giovanni"],
    ["/distribuzione-volantini-cinisello-balsamo", "distribuzione volantini a Cinisello Balsamo"],
  ]);
  for (const file of ["src/pages/public/HomePage.jsx", "src/pages/public/MilanoLandingPage.jsx"]) {
    assert.match(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /NearbyCityLinks/, file);
  }
});
