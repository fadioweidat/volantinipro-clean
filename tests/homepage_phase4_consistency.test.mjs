import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Smart Pairing board shows the month after today and its real calendar shape", async () => {
  const { buildSmartPairingExampleMonth } = await import("../src/components/home/SmartPairingSection.jsx");
  const nov = buildSmartPairingExampleMonth(new Date(2026, 9, 17)); // 17 ottobre 2026
  assert.equal(nov.label, "Novembre 2026");
  assert.equal(nov.days.length, 30);
  assert.equal(nov.startOffset, 6); // 1 novembre 2026 = domenica
  assert.equal(nov.windowLabel, "8–10 novembre");
  const jan = buildSmartPairingExampleMonth(new Date(2026, 11, 20)); // dicembre -> gennaio dell'anno dopo
  assert.equal(jan.label, "Gennaio 2027");
  assert.equal(jan.days.length, 31);
  const feb = buildSmartPairingExampleMonth(new Date(2027, 0, 31));
  assert.equal(feb.days.length, 28);
});

test("Smart Pairing demo values are visibly labelled Esempio and no fixed month remains", () => {
  const src = read("src/components/home/SmartPairingSection.jsx");
  assert.doesNotMatch(src, /Settembre 2026|8–10 settembre|START_OFFSET/);
  assert.ok((src.match(/>Esempio</g) || []).length >= 2, "badge on both the stats and the calendar");
  assert.match(src, /background: C_ORANGE, color: "#fff"/);
  // The pairing logic does not exclude same-sector campaigns: the claim must not be shown.
  assert.doesNotMatch(src, /concorrenti/i);
});

test("hero and calculator say where families are counted", () => {
  const hero = read("src/components/home/VolantiniProHeroMap.jsx");
  assert.match(hero, /Famiglie entro \$\{HERO_SCENARIO\.radiusKm\} km/);
  assert.match(hero, /<span>Famiglie entro \{HERO_SCENARIO\.radiusKm\} km<\/span>/);
  assert.doesNotMatch(hero, /Famiglie nel raggio/);
  assert.doesNotMatch(hero, />Famiglie nel raggio</);
  assert.match(read("src/components/home/HomeQuoteCalculator.jsx"), /Famiglie nel Comune di \$\{comune\.name\}/);
});

test("FAQ promises working hours", () => {
  assert.match(read("src/components/home/FAQSection.jsx"), /rispondiamo \{BUSINESS_RESPONSE_TIME\}\./);
});

test("homepage uses sans for every text and heading (no serif, no handwritten font)", () => {
  const dir = new URL("../src/components/home/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => /\.(jsx|css)$/.test(f))) {
    const src = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(src, /DM Serif Display|Brush Script|Segoe Script|\bcursive\b/, file);
  }
  assert.match(read("src/components/home/homepage-visual-review.css"), /\.home-shell-dark :is\(h1,h2,h3,h4,\.serif-title,\.dm-serif\) \{ font-family:'DM Sans'/);
});

test("WhatsApp CTA uses a monochrome glyph, not the green emoji", () => {
  const src = read("src/components/home/ContattiSection.jsx");
  assert.doesNotMatch(src, /🟢/);
  assert.match(src, /fill="currentColor"/);
  assert.match(src, /icon=\{<WhatsAppIcon/);
});

test("hero chips are the three priced services, each linking to its service page; no check bar", () => {
  const hero = read("src/components/home/VolantiniProHeroMap.jsx");
  assert.match(hero, /SERVICE_CHIPS=\[\['Door to Door','\/servizi\/door-to-door'\],\['Hand to Hand','\/servizi\/hand-to-hand'\],\['Business','\/servizi\/business'\]\]/);
  assert.doesNotMatch(hero, /'Negozi'|'Scuole'|'Eventi'/);
  assert.doesNotMatch(hero, /className="vph-trust"/);
  // service pages stay routed
  const routes = read("src/app/routeResolution.js");
  for (const path of ["/servizi/door-to-door", "/servizi/hand-to-hand", "/servizi/business"]) assert.ok(routes.includes(`'${path}'`), path);
});

test("white-text CTAs use #CE4B15 (>= 4.5:1), hover darker, homepage-scoped", () => {
  const css = read("src/components/home/homepage-visual-review.css");
  assert.match(css, /\.home-shell-dark\.saas-home-refinement :is\(\.vb, \.vph-button:not\(\.vph-button-secondary\), \.vpq-cta, \.vpp-cta\) \{ background:#CE4B15!important;/);
  assert.match(css, /:hover \{ background:#B84313!important; filter:none!important; \}/);
  assert.match(read("src/components/home/EnterpriseSection.jsx"), /background: "#CE4B15", color: "#fff"/);
  assert.match(read("src/components/home/ContattiSection.jsx"), /background: primary \? "#CE4B15"/);
  const L = (h) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = [0, 2, 4].map((i) => f(parseInt(h.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  assert.ok(1.05 / (L("CE4B15") + 0.05) >= 4.5);
  assert.ok(1.05 / (L("B84313") + 0.05) >= 4.5);
});

test("hero map options: closed by default below 768px behind an icon toggle; desktop always visible; OSM attribution kept", () => {
  const map = read("src/components/home/HomepageTerritoryMap.jsx");
  const css = read("src/components/home/homepage-hero.css");
  assert.match(map, /useState\(\(\)=>!\(typeof window!=='undefined'&&window\.matchMedia\?\.\('\(max-width: 767px\)'\)\.matches\)\)/);
  assert.match(map, /className="vph-map-toggle" aria-controls="vph-map-controls" aria-expanded=\{panelOpen\}/);
  assert.match(map, /id="vph-map-controls" className=\{`vph-map-controls\$\{panelOpen\?'':' is-collapsed'\}`\}/);
  assert.match(map, /attributionControl:true/);
  assert.match(map, /attribution:'&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a>'/);
  assert.match(css, /\.vph-map-toggle \{ display:none; \}/);
  assert.match(css, /@media \(max-width:767px\) \{[\s\S]*\.vph-map-controls\.is-collapsed \{ display:none; \}/);
  assert.match(css, /\.vph-map-frame \.vph-map-toggle \{ display:grid;[^}]*width:44px; height:44px;/);
  // the collapsed state never applies on desktop
  assert.doesNotMatch(css.replace(/@media \(max-width:767px\) \{[\s\S]*$/, ""), /is-collapsed/);
});
