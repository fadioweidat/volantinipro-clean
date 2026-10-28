// 2026-10-25 (approved): "Prezzi distribuzione volantini" page + 7 city pages + Milano with ISTAT
// numbers. Every price comes from the real engine, every figure from ISTAT (same values as
// public.geo_municipalities in production, checked read-only on 2026-10-25). No reviews, no
// clients, no result promises; Hand to Hand price not published until the rate is confirmed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TERRITORY_TIERS, calculateDistributionZonePrice, classifyTerritory } from "../src/lib/pricing/distributionPricing.js";
import { getStartingPricePerThousand } from "../src/lib/pricing/homepagePricing.js";
import { CITY_PAGES, cityFacts } from "../src/lib/seo/cityPagesData.js";
import { pricesPageContent } from "../src/lib/seo/pricesPageContent.js";
import { SEO_ROUTES, getRouteMetadata } from "../src/lib/seo/routePolicy.js";
import { CITY_SLUGS, cityPath, seoLandingPageForPath } from "../src/lib/seo/seoLandingRoutes.js";
import { resolveAppRoute } from "../src/app/routeResolution.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ISTAT, Bilancio demografico al 31/12/2024 (famiglie, abitanti) and production geo_municipalities.
const ISTAT = {
  milano: [741887, 1365698], monza: [57702, 123032], bergamo: [59638, 120389], brescia: [97803, 199853],
  como: [40487, 83135], varese: [37318, 78992], "sesto-san-giovanni": [39580, 78792], "cinisello-balsamo": [34563, 74702],
};

test("city figures are the ISTAT ones and prices/tier come from the engine", () => {
  for (const [slug, [households, population]] of Object.entries(ISTAT)) {
    const f = cityFacts(slug);
    assert.equal(f.households, households, slug);
    assert.equal(f.population, population, slug);
    assert.equal(f.wholeCityFlyers, Math.round(households * 1.1), slug);
    assert.equal(f.tier, classifyTerritory({ name: f.name, densityPerKm2: f.densityPerKm2 }).tier, slug);
    assert.equal(f.price10000, calculateDistributionZonePrice(f.tier, 10000), slug);
  }
  assert.equal(cityFacts("milano").tier, TERRITORY_TIERS.MILANO_CORE);
  assert.equal(cityFacts("sesto-san-giovanni").tier, TERRITORY_TIERS.HINTERLAND_DENSE);
  assert.equal(cityFacts("varese").tier, TERRITORY_TIERS.COMO_LECCO);
});

test("city pages: unique text per city, real numbers, no invented claims", () => {
  const angles = new Set();
  for (const slug of CITY_SLUGS) {
    const c = CITY_PAGES[`city-${slug}`];
    assert.equal(c.h1, `Distribuzione volantini a ${c.facts.name}`);
    assert.ok(!angles.has(c.angle.h2), slug);
    angles.add(c.angle.h2);
    assert.equal(c.faqs.length, 3);
    const text = JSON.stringify(c);
    assert.doesNotMatch(text, /recension|clienti soddisfatti|garantit|stelle|anni di esperienza|€\s?22\b/i, slug);
  }
  // Paragraphs carry each city's own numbers.
  assert.match(CITY_PAGES["city-brescia"].angle.paragraphs[0], /90,7 km²/);
  assert.match(CITY_PAGES["city-varese"].angle.paragraphs[0], /680 famiglie per km²/);
  assert.match(CITY_PAGES["city-cinisello-balsamo"].angle.paragraphs[1], /€762,38/);
});

test("prices page: typical quantities in evidence, 'da €30' only for large volumes, no Hand to Hand rate", () => {
  assert.deepEqual(pricesPageContent.typical.map((r) => r.qty), [5000, 10000]);
  assert.deepEqual(pricesPageContent.typical[0].prices, ["€210", "€260", "€330", "€450"]);
  assert.deepEqual(pricesPageContent.typical[1].prices, ["€350", "€420", "€520", "€750"]);
  assert.equal(getStartingPricePerThousand("d2d"), 30);
  assert.match(pricesPageContent.largeVolumesNote, /^Da €30 ogni 1\.000 volantini solo per grandi quantità: è il prezzo di 50\.000 volantini nella fascia «Milano città»\./);
  assert.deepEqual(pricesPageContent.otherServices.map((s) => s.price), ["Prezzo calcolato sulla tua zona", "Su progetto"]);
  assert.doesNotMatch(JSON.stringify(pricesPageContent), /€22(?!\d)|22 ogni/);
});

test("homepage: 'da €30 ogni 1.000 per grandi quantità'", () => {
  assert.match(read("src/components/home/ServicesSection.jsx"), /`da \$\{formatQuoteCurrency\(price, 0\)\} ogni 1\.000 per grandi quantità`/);
});

test("routes: indexable, in the sitemap list, resolved by the app router", () => {
  const paths = ["/prezzi-distribuzione-volantini", ...CITY_SLUGS.map(cityPath)];
  for (const p of paths) {
    assert.ok(SEO_ROUTES.some(([route]) => route === p), p);
    const meta = getRouteMetadata(p);
    assert.equal(meta.robots, "index, follow");
    assert.ok(meta.title.length <= 65 && meta.description.length <= 160, p);
    assert.equal(resolveAppRoute(p), seoLandingPageForPath(p));
  }
  assert.equal(resolveAppRoute("/distribuzione-volantini-milano"), "milano-landing");
  const titles = SEO_ROUTES.map(([r]) => getRouteMetadata(r).title);
  assert.equal(new Set(titles).size, titles.length);
});

test("structured data: Service with areaServed and real minimum, no LocalBusiness; footer zones", () => {
  const seo = read("src/layouts/public/SeoMeta.jsx");
  assert.match(seo, /areaServed: cityPlace\(city\.facts\.name\), offers: minimumOffer\(city\.facts\.minimum\)/);
  assert.match(seo, /offers: minimumOffer\(getDoorToDoorCampaignMinimum\(\)\)/);
  assert.doesNotMatch(seo, /"@type":\s*"LocalBusiness"/);
  const footer = read("src/components/home/Footer.jsx");
  assert.match(footer, /title: "Zone servite",\n    links: SERVED_CITIES\.map\(\(c\) => \[c\.name, c\.pageKey\]\),/);
  assert.match(footer, /\["Prezzi distribuzione volantini", "prices"\],/);
  const milano = read("src/pages/public/MilanoLandingPage.jsx");
  assert.match(milano, /<CityNumbersSection slug="milano" onNav=\{onNav\} showPrices=\{false\} \/>/);
  assert.match(milano, /\{section\.cityPrices && <CityPriceTable slug="milano" onNav=\{onNav\} \/>\}/);
});

test("2026-10-28: footer without placeholder links, sans titles, no isolated Home button", () => {
  const footer = read("src/components/home/Footer.jsx");
  assert.doesNotMatch(footer, /Blog \(in prep\.\)|Press kit \(in prep\.\)|API & integrazioni/);
  const pages = read("src/pages/public/SeoLandingPages.jsx");
  assert.doesNotMatch(pages, /NavButton|F\.serif/);
  assert.match(pages, /const h1Style = \{ fontFamily: F\.sans, fontWeight: 800,/);
});

test("footer grid has room for 4 link columns (Prodotto, Zone servite, Azienda, Legale) in both CSS sources", () => {
  assert.match(read("src/layouts/public/Bootstrap.jsx"), /\.footer-grid\{display:grid;grid-template-columns:1\.35fr repeat\(4,1fr\);gap:40px\}/);
  assert.match(read("src/styles/app.css"), /\.footer-grid \{\n  display: grid;\n  grid-template-columns: 1\.35fr repeat\(4, 1fr\);/);
});
