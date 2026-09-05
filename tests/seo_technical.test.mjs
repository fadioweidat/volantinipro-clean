// TICKET — SEO TECNICO + GOOGLE + AI SEARCH VOLANTINIPRO — FASE 12.
// File statici (robots.txt/sitemap.xml/index.html) letti come sorgente e
// verificati con regex/parsing minimo; SeoMeta.jsx verificato sia per
// contenuto sorgente (regex) sia semanticamente (import diretto dei dati
// FAQ/servizi da cui deriva il JSON-LD, per garantire coerenza col testo
// realmente visibile in home).
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { faqs } from "../src/components/home/FAQSection.jsx";
import { services } from "../src/components/home/ServicesSection.jsx";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ── robots.txt ──────────────────────────────────────────────────────────
test("robots.txt: dominio di produzione (mai localhost), Allow generale, Disallow sulle route private, riferimento sitemap", () => {
  const src = read("public/robots.txt");
  assert.doesNotMatch(src, /localhost/i);
  assert.match(src, /User-agent:\s*\*/);
  assert.match(src, /Allow:\s*\//);
  for (const priv of ["/admin", "/dashboard", "/customer/", "/campagna/", "/supplier", "/login", "/auth/"]) {
    assert.match(src, new RegExp(`Disallow:\\s*${priv.replace(/\//g, "\\/")}`), `robots.txt deve bloccare ${priv}`);
  }
  assert.match(src, /Sitemap:\s*https:\/\/www\.volantinipro\.it\/sitemap\.xml/);
});

// ── sitemap.xml ─────────────────────────────────────────────────────────
test("sitemap.xml: dominio di produzione, solo URL pubbliche, nessuna route privata/gated/inesistente", () => {
  const src = read("public/sitemap.xml");
  assert.doesNotMatch(src, /localhost/i);
  assert.match(src, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...src.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 5, "la sitemap deve contenere le pagine pubbliche principali");
  for (const loc of locs) {
    assert.match(loc, /^https:\/\/www\.volantinipro\.it\//, `URL non assoluta/https/dominio corretto: ${loc}`);
    assert.doesNotMatch(loc, /\/(admin|dashboard|customer|campagna|supplier|login|auth)(\/|$)/, `URL privata/gated nella sitemap: ${loc}`);
  }
  assert.ok(locs.includes("https://www.volantinipro.it/"), "manca la homepage");
  assert.ok(locs.includes("https://www.volantinipro.it/preventivo"), "manca /preventivo (pagina pubblica reale)");
});

// ── index.html (payload statico, non dipendente da JS) ─────────────────
test("index.html: title/description/canonical/OG/Twitter/JSON-LD statici presenti, coerenti con la homepage", () => {
  const src = read("index.html");
  assert.match(src, /<html lang="it">/);
  assert.match(src, /<title>Distribuzione Volantini con GPS e Report \| VolantiniPro<\/title>/);
  assert.match(src, /<meta name="description" content="Distribuzione volantini Door to Door, Hand to Hand e Business con analisi territoriale, tracking GPS, prove fotografiche e preventivo online\." \/>/);
  assert.match(src, /<link rel="canonical" href="https:\/\/www\.volantinipro\.it\/" \/>/);
  assert.match(src, /<meta property="og:title" content="Distribuzione Volantini con GPS e Report \| VolantiniPro" \/>/);
  assert.match(src, /<meta property="og:description"/);
  assert.match(src, /<meta property="og:url" content="https:\/\/www\.volantinipro\.it\/" \/>/);
  assert.match(src, /<meta name="twitter:card" content="summary" \/>/);
  assert.match(src, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  const jsonLdBlocks = [...src.matchAll(/<script type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.ok(jsonLdBlocks.some((b) => b["@type"] === "Organization" && b.name === "VolantiniPro" && b.url === "https://www.volantinipro.it/" && b.email === "info@volantinipro.it"), "manca JSON-LD Organization statico coerente");
  assert.ok(jsonLdBlocks.some((b) => b["@type"] === "WebSite" && b.url === "https://www.volantinipro.it/"), "manca JSON-LD WebSite statico");
  for (const block of jsonLdBlocks) assert.equal(block["@context"], "https://schema.org");
  // Nessun indirizzo fisico inventato (FASE 5: "NON inventare indirizzo fisico").
  assert.doesNotMatch(src, /"address"\s*:/);
  assert.doesNotMatch(src, /LocalBusiness/);
});

// TICKET — GOOGLE SEARCH CONSOLE READINESS: bug reale trovato in audit live
// (homepage produzione mostrava Organization/WebSite DUPLICATI: uno statico
// da index.html, uno iniettato da SeoMeta.jsx via useEffect, perché non
// condividevano lo stesso marker data-seo-jsonld e setJsonLd() non poteva
// trovare/riusare quello statico). Fix: stesso attributo su entrambi i lati
// -> SeoMeta.jsx aggiorna in place l'elemento statico invece di duplicarlo.
test("index.html: gli script JSON-LD statici (organization/website) portano lo stesso data-seo-jsonld usato da SeoMeta.jsx, per evitare duplicati a runtime", () => {
  const src = read("index.html");
  assert.match(src, /<script type="application\/ld\+json" data-seo-jsonld="organization">/);
  assert.match(src, /<script type="application\/ld\+json" data-seo-jsonld="website">/);
  const seoMetaSrc = read("src/layouts/public/SeoMeta.jsx");
  assert.match(seoMetaSrc, /setJsonLd\("organization"/);
  assert.match(seoMetaSrc, /setJsonLd\("website"/);
  assert.match(seoMetaSrc, /querySelector\(`script\[data-seo-jsonld="\$\{id\}"\]`\)/);
});

test("manifest.webmanifest: valido, referenzia solo icone realmente presenti in public/", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.name, "VolantiniPro");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    const iconPath = icon.src.replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(root, "public", iconPath)), `icona referenziata ma assente: ${icon.src}`);
  }
});

// ── SeoMeta.jsx ─────────────────────────────────────────────────────────
test("SeoMeta.jsx: canonical assoluto, robots noindex sulle pagine private, title/description per ogni pagina pubblica rilevante", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /setLink\("canonical", canonicalUrl\)/);
  assert.match(src, /window\.location\.origin/);
  assert.match(src, /noindex, nofollow/);
  assert.match(src, /index, follow/);
  for (const pageId of ["home", "quick", "consultant", "preventivo", "login", "dashboard", "privacy", "terms", "cookie"]) {
    assert.match(src, new RegExp(`${pageId}:\\s*\\[`), `manca metaByPage per "${pageId}"`);
  }
});

test("SeoMeta.jsx: isPrivatePage copre admin/customer/campaign/dashboard/supplier/login (mai indicizzati)", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /page\.startsWith\("admin"\)/);
  assert.match(src, /page\.startsWith\("customer"\)/);
  assert.match(src, /page\.startsWith\("campaign"\)/);
  assert.match(src, /page === "dashboard"/);
  assert.match(src, /page === "supplier-dashboard"/);
  assert.match(src, /page === "login"/);
});

test("SeoMeta.jsx: nessun dato di contatto hardcoded, riusa contactConfig.js", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /import \{ SUPPORT_EMAIL, SUPPORT_WHATSAPP \} from "\.\.\/\.\.\/lib\/contactConfig\.js"/);
  assert.doesNotMatch(src, /"info@volantinipro\.it"/);
  assert.doesNotMatch(src, /3517673737/);
});

// ── FAQPage JSON-LD: stessa fonte delle FAQ realmente visibili in home ──
test("FAQSection.jsx esporta le FAQ, SeoMeta.jsx le usa per FAQPage (nessuna copia duplicata/disallineata)", () => {
  assert.equal(faqs.length, 6);
  for (const f of faqs) {
    assert.ok(f.q && f.q.length > 0);
    assert.ok(f.a && f.a.length > 0);
  }
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /import \{ faqs \} from "\.\.\/\.\.\/components\/home\/FAQSection\.jsx"/);
  assert.match(src, /"@type": "FAQPage"/);
  assert.match(src, /mainEntity: faqs\.map/);
  assert.match(src, /if \(page === "home"\)/);
});

test("FAQPage/Service JSON-LD generati SOLO in home, mai su altre pagine", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /setJsonLd\("faqpage", null\)/);
  assert.match(src, /setJsonLd\("services", null\)/);
});

// ── Service JSON-LD: stessa fonte dei servizi realmente visibili in home ─
test("ServicesSection.jsx esporta i servizi, SeoMeta.jsx li usa per il JSON-LD Service (nessun dato inventato)", () => {
  assert.equal(services.length, 3);
  const titles = services.map((s) => s.title);
  assert.deepEqual(titles, ["Door to Door", "Hand to Hand", "Business Distribution"]);
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /import \{ services \} from "\.\.\/\.\.\/components\/home\/ServicesSection\.jsx"/);
  assert.match(src, /"@type": "Service"/);
});

// ── BreadcrumbList: solo pagine interne, mai su home/pagine private ────
test("SeoMeta.jsx: BreadcrumbList solo sulle pagine interne di contenuto", () => {
  const src = read("src/layouts/public/SeoMeta.jsx");
  assert.match(src, /BREADCRUMB_PAGES = new Set\(\["quick", "consultant", "preventivo", "privacy", "terms", "cookie"/);
  assert.match(src, /"@type": "BreadcrumbList"/);
  assert.doesNotMatch(src, /BREADCRUMB_PAGES\.add\("home"\)/);
});

// ── Nessuna route admin/private nella sitemap o citata come indicizzabile ─
test("Nessuna route admin/dashboard/customer/supplier compare in sitemap.xml o robots.txt come Allow esplicito", () => {
  const sitemap = read("public/sitemap.xml");
  const robots = read("public/robots.txt");
  for (const priv of ["/admin", "/dashboard", "/customer", "/supplier"]) {
    assert.doesNotMatch(sitemap, new RegExp(priv.replace("/", "\\/")));
    assert.doesNotMatch(robots, new RegExp(`Allow:\\s*${priv.replace("/", "\\/")}`));
  }
});
