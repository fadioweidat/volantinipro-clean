// 2026-10-25 (approved): "Prezzi distribuzione volantini" page + 7 city pages + Milano with ISTAT
// numbers. Every price comes from the real engine, every figure from ISTAT (same values as
// public.geo_municipalities in production, checked read-only on 2026-10-25). No reviews, no
// clients, no result promises; Hand to Hand price not published until the rate is confirmed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TERRITORY_TIERS, calculateDistributionZonePrice, classifyTerritory } from "../src/lib/pricing/distributionPricing.js";
import { getStartingPricePerThousand } from "../src/lib/pricing/homepagePricing.js";
import { CITY_PAGES, cityFacts, cityPriceQuantities, cityReachSentence } from "../src/lib/seo/cityPagesData.js";
import { pricesPageContent } from "../src/lib/seo/pricesPageContent.js";
import { SEO_ROUTES, getRouteMetadata } from "../src/lib/seo/routePolicy.js";
import { CITY_SLUGS, SERVED_ZONE_GROUPS, cityPath, seoLandingPageForPath } from "../src/lib/seo/seoLandingRoutes.js";
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

test("2026-10-30: 16 hinterland pages, ISTAT figures, each zone group lists every city once", () => {
  const data = {
    "cologno-monzese": [21600, 46994],
    "paderno-dugnano": [21245, 47594],
    "bresso": [12413, 26513],
    "cormano": [9297, 20744],
    "bollate": [16498, 36365],
    "segrate": [16921, 37078],
    "pioltello": [15627, 37184],
    "cernusco-sul-naviglio": [15216, 34786],
    "san-donato-milanese": [14830, 32161],
    "san-giuliano-milanese": [17303, 39910],
    "rozzano": [18549, 41559],
    "corsico": [16334, 34694],
    "assago": [4047, 9323],
    "rho": [23897, 50879],
    "pero": [5581, 11816],
    "settimo-milanese": [8847, 19922],
  };
  for (const [slug, [households, population]] of Object.entries(data)) {
    const f = cityFacts(slug);
    assert.equal(f.households, households, slug);
    assert.equal(f.population, population, slug);
    assert.ok(CITY_SLUGS.includes(slug), slug);
    assert.ok(CITY_PAGES[`city-${slug}`].nearby.length >= 3, slug);
    assert.doesNotMatch(JSON.stringify(CITY_PAGES[`city-${slug}`]), /undefined|NaN/, slug);
  }
  assert.equal(CITY_SLUGS.length, 23);
  const grouped = SERVED_ZONE_GROUPS.flatMap((g) => g.cities.map((c) => c.slug));
  assert.deepEqual([...grouped].sort(), ["milano", ...CITY_SLUGS].sort());
  assert.deepEqual(SERVED_ZONE_GROUPS.map((g) => g.title), ["Milano", "Hinterland Nord", "Hinterland Est", "Hinterland Sud", "Hinterland Ovest", "Altre città lombarde"]);
  assert.deepEqual(SERVED_ZONE_GROUPS[5].cities.map((c) => c.name), ["Monza", "Bergamo", "Brescia", "Como", "Varese"]);
  assert.equal(CITY_PAGES["city-assago"].h1, "Distribuzione volantini ad Assago");
  assert.equal(new Set(Object.values(CITY_PAGES).map((c) => c.faqs[2].q)).size, 23);
});

test("small towns: never more families or copies than the whole municipality", () => {
  assert.equal(cityReachSentence(cityFacts("assago")), "Di solito si sceglie una zona: con 2.500 volantini raggiungi circa 2.273 famiglie.");
  assert.equal(cityReachSentence(cityFacts("pero")), "Di solito si sceglie una zona: con 2.500 volantini raggiungi circa 2.273 famiglie, con 5.000 circa 4.545.");
  assert.equal(cityReachSentence(cityFacts("monza")), "Di solito si sceglie una zona: con 5.000 volantini raggiungi circa 4.545 famiglie, con 10.000 circa 9.091.");
  assert.deepEqual(cityPriceQuantities(cityFacts("assago")), { quantities: [2500], wholeCity: 4452 });
  assert.deepEqual(cityPriceQuantities(cityFacts("monza")), { quantities: [2500, 5000, 10000, 20000], wholeCity: null });
});

test("city pages: unique text per city, real numbers, no invented claims", () => {
  const angles = new Set();
  for (const slug of CITY_SLUGS) {
    const c = CITY_PAGES[`city-${slug}`];
    assert.equal(c.h1, `Distribuzione volantini ${c.facts.at}`);
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
  // 2026-10-29: Hand to Hand a tariffa oraria (€25/ora per operatore, minimo 3 ore).
  assert.deepEqual(pricesPageContent.otherServices.map((s) => s.price), ["€25 l'ora per operatore, minimo 3 ore per uscita (IVA esclusa)", "Su progetto"]);
  assert.deepEqual(pricesPageContent.handToHand.examples.map((e) => e.price), ["€75", "€200", "€600"]);
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
  assert.match(footer, /SERVED_ZONE_GROUPS\.map\(\(group\)/);
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

test("footer grid has room for 3 link columns (Prodotto, Azienda, Legale) in both CSS sources, zones in their own row", () => {
  assert.match(read("src/layouts/public/Bootstrap.jsx"), /\.footer-grid\{display:grid;grid-template-columns:1\.35fr repeat\(3,1fr\);gap:40px\}/);
  assert.match(read("src/styles/app.css"), /\.footer-grid \{\n  display: grid;\n  grid-template-columns: 1\.35fr repeat\(3, 1fr\);/);
});
