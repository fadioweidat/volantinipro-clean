// TICKET — SEO SERVICE PAGES VOLANTINIPRO: 3 pagine pubbliche reali
// (/servizi/door-to-door, /servizi/hand-to-hand, /servizi/business).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { resolveAppRoute } from "../src/app/routeResolution.js";
import { SERVICE_PAGE_CONTENT, doorToDoorContent, handToHandContent, businessContent } from "../src/lib/seo/servicePagesContent.js";
import { services } from "../src/components/home/ServicesSection.jsx";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const ROUTES = [
  ["/servizi/door-to-door", "service-door-to-door"],
  ["/servizi/hand-to-hand", "service-hand-to-hand"],
  ["/servizi/business", "service-business"],
];

// ── Route resolution (forward: URL -> page id) ─────────────────────────────
test("resolveAppRoute: le 3 URL /servizi/* risolvono al page id corretto (route 200 raggiungibile)", () => {
  for (const [url, pageId] of ROUTES) {
    assert.equal(resolveAppRoute(url), pageId, `${url} deve risolvere a "${pageId}"`);
  }
});

test("resolveAppRoute: URL sconosciute sotto /servizi/ non collidono (restano not-found)", () => {
  assert.equal(resolveAppRoute("/servizi/inesistente"), "not-found");
});

// ── AppRouter.jsx: mapping inverso (page id -> URL) e wiring Navbar ────────
test("AppRouter.jsx: paths[] mappa i 3 page id alle URL /servizi/* corrette", () => {
  const src = read("src/app/AppRouter.jsx");
  assert.match(src, /"service-door-to-door":\s*"\/servizi\/door-to-door"/);
  assert.match(src, /"service-hand-to-hand":\s*"\/servizi\/hand-to-hand"/);
  assert.match(src, /"service-business":\s*"\/servizi\/business"/);
});

test("AppRouter.jsx: Navbar/SeoMeta si montano automaticamente per le pagine servizio (page !== 'home')", () => {
  const src = read("src/app/AppRouter.jsx");
  assert.match(src, /<SeoMeta page=\{page\} \/>/);
  assert.match(src, /!isConfiguratorPage && page !== "home" && <Navbar/);
});

// ── PublicRoutes.jsx: le 3 pagine sono wired e lazy-loaded ─────────────────
test("PublicRoutes.jsx: le 3 pagine servizio sono renderizzate lazy e ricevono onNav", () => {
  const src = read("src/app/PublicRoutes.jsx");
  assert.match(src, /const ServiceDoorToDoorPage = lazy\(/);
  assert.match(src, /const ServiceHandToHandPage = lazy\(/);
  assert.match(src, /const ServiceBusinessPage = lazy\(/);
  assert.match(src, /if \(page === "service-door-to-door"\) return <ServiceDoorToDoorPage onNav=\{goTo\} \/>;/);
  assert.match(src, /if \(page === "service-hand-to-hand"\) return <ServiceHandToHandPage onNav=\{goTo\} \/>;/);
  assert.match(src, /if \(page === "service-business"\) return <ServiceBusinessPage onNav=\{goTo\} \/>;/);
});

// ── sitemap.xml / robots.txt ────────────────────────────────────────────
test("sitemap.xml: le 3 pagine servizio sono presenti con URL assolute di produzione", () => {
  const src = read("public/sitemap.xml");
  for (const [url] of ROUTES) {
    assert.match(src, new RegExp(`<loc>https://www\\.volantinipro\\.it${url.replace(/\//g, "\\/")}</loc>`));
  }
});

test("robots.txt: /servizi non è bloccato (nessun Disallow che lo copra)", () => {
  const src = read("public/robots.txt");
  assert.doesNotMatch(src, /Disallow:\s*\/servizi/);
});

// ── SeoMeta.jsx: metadata unico per pagina, JSON-LD, nessun noindex accidentale ─
test("SeoMeta.jsx: title/description unici per le 3 pagine servizio, diversi tra loro e dalla home", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /"service-door-to-door":\s*\[/);
  assert.match(src, /"service-hand-to-hand":\s*\[/);
  assert.match(src, /"service-business":\s*\[/);
  const titles = new Set([
    "Distribuzione Volantini con GPS e Report | VolantiniPro",
    "Distribuzione Volantini Door to Door | VolantiniPro",
    "Distribuzione Volantini Hand to Hand | VolantiniPro",
    "Distribuzione Volantini Business | VolantiniPro",
  ]);
  assert.equal(titles.size, 4, "i 4 title (home + 3 servizi) devono essere tutti diversi tra loro");
});

test("SeoMeta.jsx: le 3 pagine servizio sono in BREADCRUMB_PAGES e ricevono FAQPage/Service dedicati da SERVICE_PAGE_CONTENT", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /BREADCRUMB_PAGES = new Set\(\[.*\.\.\.SERVICE_PAGE_IDS/);
  assert.match(src, /import \{ SERVICE_PAGE_CONTENT \} from "\.\.\/\.\.\/lib\/seo\/servicePagesContent\.js"/);
  assert.match(src, /const servicePageContent = CONTENT_PAGES\[page\]/);
  assert.match(src, /"@type": "Service",\s*\n\s*name: servicePageContent\.h1/);
});

test("SeoMeta.jsx: isPrivatePage non intercetta le pagine servizio (nessun noindex accidentale)", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  // Le pagine servizio iniziano con "service-", non con admin/customer/campaign/login/dashboard.
  for (const [, pageId] of ROUTES) {
    assert.ok(!pageId.startsWith("admin") && !pageId.startsWith("customer") && !pageId.startsWith("campaign") && pageId !== "login" && pageId !== "dashboard" && pageId !== "supplier-dashboard", `${pageId} non deve corrispondere a isPrivatePage()`);
  }
  assert.doesNotMatch(src, /page\.startsWith\("service"\)/, "nessuna regola deve marcare le pagine servizio come private");
});

// ── Contenuto: H1 unici, FAQ fattuali, nessun dato inventato ───────────────
test("servicePagesContent.js: H1 unici per le 3 pagine, coerenti coi servizi realmente offerti (ServicesSection.jsx)", () => {
  const h1s = [doorToDoorContent.h1, handToHandContent.h1, businessContent.h1];
  assert.equal(new Set(h1s).size, 3, "gli H1 devono essere tutti diversi");
  const realTitles = services.map((s) => s.title);
  assert.deepEqual(realTitles, ["Door to Door", "Hand to Hand", "Business Distribution"]);
  assert.match(doorToDoorContent.h1, /Door to Door/);
  assert.match(handToHandContent.h1, /Hand to Hand/);
  assert.match(businessContent.h1, /Aziende|Business/);
});

test("servicePagesContent.js: ogni pagina ha 3 FAQ fattuali (cos'è / verifica / differenza), nessun tempo o copertura numerica inventata", () => {
  for (const content of [doorToDoorContent, handToHandContent, businessContent]) {
    assert.equal(content.faqs.length, 3);
    for (const faq of content.faqs) {
      assert.ok(faq.q.length > 0 && faq.a.length > 0);
    }
    const allText = JSON.stringify(content);
    // Nessuna percentuale/ora specifica inventata (es. "98%", "entro 3 ore").
    assert.doesNotMatch(allText, /\d+%/);
    assert.doesNotMatch(allText, /entro \d+ (ore|giorni)/i);
  }
});

test("servicePagesContent.js: 'come viene calcolato il preventivo' non ricalcola nulla, rimanda al configuratore esistente", () => {
  for (const content of [doorToDoorContent, handToHandContent, businessContent]) {
    const pricingSection = content.sections.find((s) => s.h2.toLowerCase().includes("preventivo"));
    assert.ok(pricingSection, `manca la sezione preventivo per ${content.pageKey}`);
    assert.match(pricingSection.paragraphs.join(" "), /stesso motore di calcolo/);
  }
});

// ── Internal linking: ogni pagina servizio linka le altre 2 + preventivo + contatti + come funziona ──
test("ServicePages.jsx: internal linking completo (altre 2 pagine servizio, preventivo, consulente, come funziona, contatti, home)", () => {
  const src = read("src/pages/public/ServicePages.jsx");
  assert.match(src, /onNav\("preventivo"\)/);
  assert.match(src, /onNav\("consultant"\)/);
  assert.match(src, /SERVICE_LINKS\.filter\(\(s\) => s\.key !== content\.pageKey\)/);
  assert.match(src, /getElementById\("come-funziona"\)/);
  assert.match(src, /getElementById\("contatti"\)/);
  assert.match(src, /onNav\("home"\)/);
});

test("HomePage.jsx -> ServicesSection.jsx: la homepage linka le 3 pagine servizio (onServiceLink)", () => {
  const homeSrc = read("src/pages/public/HomePage.jsx");
  const servicesSrc = read("src/components/home/ServicesSection.jsx");
  assert.match(homeSrc, /onServiceLink: \(pageKey\) => n\(pageKey\)/);
  assert.match(servicesSrc, /onClick=\{\(\) => onServiceLink\?\.\(service\.pageKey\)\}/);
  for (const [, pageId] of ROUTES) {
    assert.match(servicesSrc, new RegExp(`pageKey:\\s*"${pageId}"`));
  }
});

// ── Design: stile riusato (constants.js C/F, NavButton, Button), nessuna landing diversa ──
test("ServicePages.jsx: riusa il design system esistente (constants.js, NavButton, Button), nessun colore/font nuovo inventato", () => {
  const src = read("src/pages/public/ServicePages.jsx");
  assert.match(src, /import \{ C, F \} from "\.\.\/\.\.\/lib\/constants\.js"/);
  assert.match(src, /import \{ NavButton \} from "\.\.\/\.\.\/components\/NavButton\.jsx"/);
  assert.match(src, /import Button from "\.\.\/\.\.\/components\/ui\/Button\.jsx"/);
});
