import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("A & B: TrustBar contains 'Analisi convenienza e ROI' and all 5 previous trust items", () => {
  const src = read("src/components/home/TrustBar.jsx");
  assert.match(src, /"Analisi convenienza e ROI"/);
  assert.match(src, /"Report GPS verificabili"/);
  assert.match(src, /"Analisi ISTAT demografica"/);
  assert.match(src, /"Cartografia GIS professionale"/);
  assert.match(src, /"Preventivi e PDF certificati"/);
  assert.match(src, /"Monitoraggio operativo sul campo"/);
});

test("E, F, G, H, I, J: WhyDifferentSection contains 5 cards, updated subtitle, AI + ANALISI badge, bullets and CTA", () => {
  const src = read("src/components/home/WhyDifferentSection.jsx");
  
  // Section Title
  assert.match(src, /Perché VolantiniPro è diverso/);

  // Section Subtitle
  assert.match(src, /Prima analizziamo dove distribuire e se l'investimento può avere senso\. Poi pianifichiamo la copertura, monitoriamo il lavoro e documentiamo il risultato\./);

  // 4 existing cards
  assert.match(src, /"Dati territoriali ISTAT"/);
  assert.match(src, /"Analisi territoriale"/);
  assert.match(src, /"Tracking GPS"/);
  assert.match(src, /"Report e prove"/);

  // 5th Feasibility card — teaser for the dual-service section below, not a
  // duplicate of the campaign-only metrics (those now live only in the full
  // dual-card section, ticket "HOMEPAGE FEASIBILITY DUAL-SERVICE").
  assert.match(src, /"Studio di Fattibilità AI"/);
  assert.match(src, /"AI \+ ANALISI"/);
  assert.match(src, /valuta se una zona è adatta alla tua attività, oppure se una campagna pubblicitaria è economicamente sostenibile\./);
  assert.match(src, /"Fattibilità della tua attività"/);
  assert.match(src, /"Fattibilità della campagna pubblicitaria"/);
  assert.match(src, /"#feasibility-home-title"/);
  assert.match(src, /Scopri le due analisi/);
  assert.doesNotMatch(src, /"Break-even e ROI"/, 'metriche di dettaglio non devono duplicarsi qui: vivono solo nella sezione dual-card');

  // Grid layout for 5 cards: 3 cards span 4, 2 cards span 6
  assert.match(src, /nth-child\(1\)\s*\{\s*grid-column:\s*span\s*4;/);
  assert.match(src, /nth-child\(2\)\s*\{\s*grid-column:\s*span\s*4;/);
  assert.match(src, /nth-child\(3\)\s*\{\s*grid-column:\s*span\s*4;/);
  assert.match(src, /nth-child\(4\)\s*\{\s*grid-column:\s*span\s*6;/);
  assert.match(src, /nth-child\(5\)\s*\{\s*grid-column:\s*span\s*6;/);
});

test("K: Copy safety check - no forbidden promise words in WhyDifferentSection", () => {
  const src = read("src/components/home/WhyDifferentSection.jsx");
  assert.doesNotMatch(src, /ROI garantito/i);
  assert.doesNotMatch(src, /clienti garantiti/i);
  assert.doesNotMatch(src, /campagna sicuramente conveniente/i);
  assert.doesNotMatch(src, /risultati assicurati/i);
});

test("C & D: Hero copy and Map components remain untouched and safe", () => {
  const heroSrc = read("src/components/home/VolantiniProHeroMap.jsx");
  assert.match(heroSrc, /VOLANTINAGGIO &middot; CONTROLLO GPS/);
  assert.match(heroSrc, /Distribuisci volantini e/);
  assert.match(heroSrc, /Configura la tua campagna/);
});
