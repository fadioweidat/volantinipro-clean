// TICKET — SEO LOCAL PAGE PILOTA MILANO: 1 pagina pubblica reale
// (/distribuzione-volantini-milano), NON una lista di città, NON una pagina
// doorway, NON una copia delle pagine servizio esistenti.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { resolveAppRoute } from "../src/app/routeResolution.js";
import { milanoLandingContent } from "../src/lib/seo/milanoLandingContent.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const URL_PATH = "/distribuzione-volantini-milano";
const PAGE_ID = "milano-landing";

// ── Route resolution (forward: URL -> page id) ─────────────────────────────
test("resolveAppRoute: /distribuzione-volantini-milano risolve al page id corretto (route reale raggiungibile)", () => {
  assert.equal(resolveAppRoute(URL_PATH), PAGE_ID);
});

test("resolveAppRoute: nessuna altra città pilota è stata creata", () => {
  assert.equal(resolveAppRoute("/distribuzione-volantini-roma"), "not-found");
  assert.equal(resolveAppRoute("/distribuzione-volantini-napoli"), "not-found");
});

// ── AppRouter.jsx: mapping inverso (page id -> URL) ────────────────────────
test("AppRouter.jsx: paths[] mappa 'milano-landing' alla URL /distribuzione-volantini-milano", () => {
  const src = read("src/app/AppRouter.jsx");
  assert.match(src, /"milano-landing":\s*"\/distribuzione-volantini-milano"/);
});

test("AppRouter.jsx: Navbar/SeoMeta si montano automaticamente per la pagina Milano (page !== 'home')", () => {
  const src = read("src/app/AppRouter.jsx");
  assert.match(src, /<SeoMeta page=\{page\} \/>/);
  assert.match(src, /!isConfiguratorPage && page !== "home" && <Navbar/);
});

// ── PublicRoutes.jsx: la pagina è wired e lazy-loaded ──────────────────────
test("PublicRoutes.jsx: MilanoLandingPage è renderizzata lazy e riceve onNav", () => {
  const src = read("src/app/PublicRoutes.jsx");
  assert.match(src, /const MilanoLandingPage = lazy\(/);
  assert.match(src, /if \(page === "milano-landing"\) return <MilanoLandingPage onNav=\{goTo\} \/>;/);
});

// ── sitemap.xml / robots.txt ────────────────────────────────────────────
test("sitemap.xml: la pagina Milano è presente con URL assoluta di produzione", () => {
  const src = read("public/sitemap.xml");
  assert.match(src, /<loc>https:\/\/www\.volantinipro\.it\/distribuzione-volantini-milano<\/loc>/);
});

test("robots.txt: /distribuzione-volantini-milano non è bloccato (nessun Disallow che lo copra)", () => {
  const src = read("public/robots.txt");
  assert.doesNotMatch(src, /Disallow:\s*\/distribuzione/);
});

// ── SeoMeta.jsx: metadata esatti dal ticket, robots index/follow, JSON-LD ──
test("SeoMeta.jsx: title/description esatti dal ticket per 'milano-landing'", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /"milano-landing":\s*\[/);
  assert.match(src, /Distribuzione Volantini Milano con GPS e Report \| VolantiniPro/);
  assert.match(src, /Servizio di distribuzione volantini a Milano con Door to Door, Hand to Hand e soluzioni Business\. Analisi territoriale, tracking GPS, prove fotografiche e preventivo online\./);
});

test("SeoMeta.jsx: 'milano-landing' è in BREADCRUMB_PAGES e riceve FAQPage/Service da CONTENT_PAGES (nessun LocalBusiness)", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /BREADCRUMB_PAGES = new Set\(\[.*"milano-landing"\]\)/);
  assert.match(src, /import \{ milanoLandingContent \} from "\.\.\/\.\.\/lib\/seo\/milanoLandingContent\.js"/);
  assert.match(src, /const CONTENT_PAGES = \{ \.\.\.SERVICE_PAGE_CONTENT, "milano-landing": milanoLandingContent \}/);
  assert.match(src, /const servicePageContent = CONTENT_PAGES\[page\]/);
  assert.match(src, /"@type": "Service",\s*\n\s*name: servicePageContent\.h1/);
  assert.doesNotMatch(src, /"@type":\s*"LocalBusiness"/);
});

test("SeoMeta.jsx: isPrivatePage non intercetta 'milano-landing' (index, follow — mai noindex)", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.ok(!PAGE_ID.startsWith("admin") && !PAGE_ID.startsWith("customer") && !PAGE_ID.startsWith("campaign") && PAGE_ID !== "login" && PAGE_ID !== "dashboard" && PAGE_ID !== "supplier-dashboard");
  assert.doesNotMatch(src, /page\.startsWith\("milano"\)/, "nessuna regola deve marcare la pagina Milano come privata");
});

// ── Contenuto: H1 esatto, nessun dato inventato ────────────────────────────
test("milanoLandingContent.js: H1 esatto dal ticket", () => {
  assert.equal(milanoLandingContent.h1, "Distribuzione volantini a Milano");
});

test("milanoLandingContent.js: 5 FAQ fattuali, nessuna copertura/percentuale/famiglia/prezzo inventati", () => {
  assert.equal(milanoLandingContent.faqs.length, 5);
  for (const faq of milanoLandingContent.faqs) {
    assert.ok(faq.q.length > 0 && faq.a.length > 0);
  }
  const allText = JSON.stringify(milanoLandingContent);
  assert.doesNotMatch(allText, /\d+%/);
  assert.doesNotMatch(allText, /entro \d+ (ore|giorni)/i);
  assert.doesNotMatch(allText, /\bfamiglie\b/i);
  assert.doesNotMatch(allText, /€\s*\d/);
  assert.doesNotMatch(allText, /\d+\s*(€|euro)/i);
  assert.doesNotMatch(allText, /copertura garantita/i);
  assert.doesNotMatch(allText, /disponibilità garantita/i);
});

test("milanoLandingContent.js: nessun indirizzo, recensione, rating, numero clienti, anni esperienza o certificazione inventati", () => {
  const allText = JSON.stringify(milanoLandingContent);
  assert.doesNotMatch(allText, /"address"/i);
  assert.doesNotMatch(allText, /recension/i);
  assert.doesNotMatch(allText, /rating/i);
  assert.doesNotMatch(allText, /anni di esperienza/i);
  assert.doesNotMatch(allText, /certificazion/i);
});

test("milanoLandingContent.js: sezione 'Zone di Milano' cita solo esempi geografici, mai una lista SEO di quartieri con copertura promessa", () => {
  const zoneSection = milanoLandingContent.sections.find((s) => s.h2 === "Zone di Milano");
  assert.ok(zoneSection);
  const text = zoneSection.paragraphs.join(" ");
  for (const zona of ["Milano Centro", "Affori", "Bovisa", "Dergano", "Niguarda", "Città Studi", "Porta Romana", "Navigli"]) {
    assert.match(text, new RegExp(zona));
  }
  assert.match(text, /verificata/i);
});

test("milanoLandingContent.js: sezione prezzo non ricalcola nulla, rimanda al configuratore esistente", () => {
  const pricingSection = milanoLandingContent.sections.find((s) => s.h2.toLowerCase().includes("quanto costa"));
  assert.ok(pricingSection);
  assert.match(pricingSection.paragraphs.join(" "), /stesso motore di calcolo/);
  assert.equal(pricingSection.priceCta, "Calcola il prezzo sulla tua zona");
});

test("milanoLandingContent.js: sezione 'Come distribuiamo a Milano' linka i 3 servizi reali", () => {
  const howSection = milanoLandingContent.sections.find((s) => s.h2 === "Come distribuiamo a Milano");
  assert.ok(howSection && Array.isArray(howSection.services) && howSection.services.length === 3);
  const pageKeys = howSection.services.map((s) => s.pageKey);
  assert.deepEqual(pageKeys, ["service-door-to-door", "service-hand-to-hand", "service-business"]);
});

// ── Internal linking bidirezionale ──────────────────────────────────────
test("MilanoLandingPage.jsx: linka preventivo, consulente, i 3 servizi, come funziona, contatti, home", () => {
  const src = read("src/pages/public/MilanoLandingPage.jsx");
  assert.match(src, /onNav\("preventivo"\)/);
  assert.match(src, /onNav\("consultant"\)/);
  assert.match(src, /SERVICE_LINKS = \[/);
  assert.match(src, /getElementById\("come-funziona"\)/);
  assert.match(src, /getElementById\("contatti"\)/);
  assert.match(src, /onNav\("home"\)/);
});

test("Footer.jsx: la homepage linka la pagina Milano (un solo link, non spammy)", () => {
  const src = read("src/components/home/Footer.jsx");
  const matches = [...src.matchAll(/milano-landing/g)];
  assert.equal(matches.length, 1, "il link verso la pagina Milano deve comparire una sola volta in Footer.jsx");
  assert.match(src, /\["Distribuzione volantini a Milano", "milano-landing"\]/);
});

test("ServicePages.jsx: ognuna delle 3 pagine servizio ha un solo link discreto verso la pagina Milano", () => {
  const src = read("src/pages/public/ServicePages.jsx");
  const matches = [...src.matchAll(/onNav\("milano-landing"\)/g)];
  assert.equal(matches.length, 1, "il link verso Milano deve comparire una sola volta nel template condiviso (renderizzato per tutte e 3 le pagine)");
});

// ── Design: stile riusato (constants.js C/F, NavButton, Button), nessun design separato ──
test("MilanoLandingPage.jsx: riusa il design system esistente (constants.js, NavButton, Button), nessun colore/font nuovo", () => {
  const src = read("src/pages/public/MilanoLandingPage.jsx");
  assert.match(src, /import \{ C, F \} from "\.\.\/\.\.\/lib\/constants\.js"/);
  assert.match(src, /import \{ NavButton \} from "\.\.\/\.\.\/components\/NavButton\.jsx"/);
  assert.match(src, /import Button from "\.\.\/\.\.\/components\/ui\/Button\.jsx"/);
});
