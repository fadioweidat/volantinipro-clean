import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

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

test("E, F, G, H, I, J: WhyDifferentSection contains 6 cards, updated subtitle, AI + ANALISI badge, teaser bullets and CTA (rendered)", async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  let html;
  try {
    const Why = (await vite.ssrLoadModule("/src/components/home/WhyDifferentSection.jsx")).default;
    html = renderToStaticMarkup(React.createElement(Why));
  } finally {
    await vite.close();
  }
  const css = read("src/components/home/why-different.css");

  // Section title and subtitle (copy corrente)
  assert.match(html, /<h2 id="why-different-title">Perché VolantiniPro è diverso<\/h2>/);
  assert.ok(
    html.includes('<p class="vpd-subtitle">Analizziamo il territorio, valutiamo la convenienza, pianifichiamo la distribuzione e monitoriamo il lavoro.<br class="vpd-desktop-break"/> Con l’Assistente AI VolantiniPro, clienti e operatori possono comprendere e gestire ogni fase in linguaggio naturale.</p>'),
    "sottotitolo corrente non trovato",
  );

  // 6 card, nell'ordine atteso, con titolo e badge
  const ids = [...html.matchAll(/<article class="vpd-card vpd-card--(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["istat", "gis", "analysis", "gps", "pdf", "assistant"]);
  const titles = [...html.matchAll(/<h3 id="difference-\w+">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Dati territoriali ISTAT", "Analisi territoriale", "Studio di Fattibilità AI", "Tracking GPS", "Report e prove", "Assistente VolantiniPro"]);
  const badges = [...html.matchAll(/<span class="vpd-badge">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(badges, ["ISTAT", "GIS", "AI + ANALISI", "GPS", "PDF", "AI ASSISTANT"]);

  // Card Fattibilità: teaser che rimanda alla sezione dual-card, senza duplicarne le metriche di dettaglio
  const card = html.match(/<article class="vpd-card vpd-card--analysis"[\s\S]*?<\/article>/)[0];
  assert.match(card, /Due analisi per due decisioni diverse\./);
  assert.match(card, /<span>Valutazione di attività, territorio, concorrenza e opportunità<\/span>/);
  assert.match(card, /<span>Verifica di una campagna con break-even, ROI e scenari<\/span>/);
  assert.match(card, /<a class="vpd-cta" href="\/analisi-campagna">Scopri come funziona/);
  assert.doesNotMatch(html, /Break-even e ROI/, "metriche di dettaglio non devono duplicarsi qui: vivono solo nella sezione dual-card");

  // Griglia per 6 card: 3 colonne desktop, 2 tablet, 1 mobile
  assert.match(css, /\.vpd-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*1100px\)\s*\{[^@]*?\.vpd-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[^@]*?\.vpd-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
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
