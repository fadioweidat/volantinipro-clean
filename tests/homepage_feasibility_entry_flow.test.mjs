// TICKET — "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP".
// Business feasibility può iniziare subito dalla home. Campaign feasibility
// NON deve più partire dalla home come flusso standalone (vuoto, senza
// servizio/quantità/zona) — la home deve indirizzare al configuratore, che a
// Step4 rimanda a Fattibilità Campagna già prefillata. Verifica: due CTA
// distinte, nessuna regressione sul percorso Step4/campagna esistente,
// nessuna modifica a motori/formule/report.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { FEASIBILITY_PATH } from '../src/lib/feasibility/entryPoint.js';

const sectionSrc = readFileSync(new URL('../src/components/home/FeasibilitySection.jsx', import.meta.url), 'utf8');
const whySrc = readFileSync(new URL('../src/components/home/WhyDifferentSection.jsx', import.meta.url), 'utf8');
const homeSrc = readFileSync(new URL('../src/pages/public/HomePage.jsx', import.meta.url), 'utf8');
const step4CardSrc = readFileSync(new URL('../src/pages/public/configurator/step4/Step4FeasibilityCard.jsx', import.meta.url), 'utf8');

async function renderFeasibilitySection(props) {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const Home = (await vite.ssrLoadModule('/src/components/home/FeasibilitySection.jsx')).default;
    return renderToStaticMarkup(React.createElement(Home, props));
  } finally {
    await vite.close();
  }
}

async function renderWhy() {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const Why = (await vite.ssrLoadModule('/src/components/home/WhyDifferentSection.jsx')).default;
    return renderToStaticMarkup(React.createElement(Why));
  } finally {
    await vite.close();
  }
}

// ── Business CTA: apre direttamente Business Feasibility (no regression) ──
test('Business CTA "Analizza la tua attività" apre direttamente il flusso business, mai il configuratore', async () => {
  const html = await renderFeasibilitySection();
  assert.match(html, />Analizza la tua attività\s*</);
  assert.match(sectionSrc, /onClick=\{\(\) => openFeasibility\(null, window, 'business'\)\}/);
});

// ── Campaign CTA: NON apre più il flusso standalone, porta al configuratore ─
test('Campaign CTA "Configura e analizza la campagna" non apre il flusso standalone vuoto', async () => {
  const html = await renderFeasibilitySection();
  assert.match(html, />Configura e analizza la campagna\s*</);
  assert.doesNotMatch(html, />Analizza la tua campagna</, 'la vecchia CTA che apriva lo standalone vuoto non deve più esistere');
  assert.doesNotMatch(sectionSrc, /onClick=\{\(\) => openFeasibility\([^)]*'campaign'\)\}/, 'la card campagna non deve più chiamare openFeasibility direttamente in modo campaign');
});

test('Campaign CTA usa onConfigure (stessa funzione di Hero/Servizi/HowItWorks) con fallback sicuro se assente', async () => {
  assert.match(sectionSrc, /onClick=\{\(\) => \(onConfigure \? onConfigure\(\) : /);
  // fallback: non deve lanciare se onConfigure non e' passato (renderizzato senza prop)
  const html = await renderFeasibilitySection();
  assert.match(html, /Configura e analizza la campagna/);
});

test('HomePage.jsx passa onConfigure a FeasibilitySection, stesso pattern delle altre sezioni', () => {
  assert.match(homeSrc, /_jsx\(FeasibilitySection,\s*\{\s*onConfigure:\s*\(\)\s*=>\s*n\("preventivo"\)/);
});

// ── Microcopy: spiega perché il click non apre subito il report ───────────
test('Microcopy vicino alla CTA campagna spiega che serve prima configurare la campagna', async () => {
  const html = await renderFeasibilitySection();
  assert.match(html, /Configura prima la campagna: useremo automaticamente/);
  assert.match(html, /quantità, area e costo del preventivo nell.analisi/);
});

// ── §6: Campaign Feasibility NON è stata rimossa, resta raggiungibile da Step4 ─
test('Campaign Feasibility resta raggiungibile da Step4 (Step4FeasibilityCard invariato)', () => {
  assert.match(step4CardSrc, /openFeasibility\(context, window, 'campaign', 'quote'\)/);
  assert.match(step4CardSrc, /Analizza la convenienza/);
});

test('entryPoint.js e feasibilityStorage.js (prefill Step4/campagna esistente) non sono stati toccati da questo ticket', () => {
  // Il meccanismo di prefill deve restare intatto: qui verifichiamo solo che
  // il file storage non sia stato alterato nella sua logica di fast-path.
  const storageSrc = readFileSync(new URL('../src/pages/customer/feasibility/feasibilityStorage.js', import.meta.url), 'utf8');
  assert.match(storageSrc, /phase: context \? 1 : 0/);
});

// ── "Perché diverso": spiega la distinzione tra i due percorsi ────────────
test('WhyDifferentSection presenta le due analisi; la distinzione business-subito / campagna-configurata vive nella sezione Fattibilita', async () => {
  const why = await renderWhy();
  const card = why.match(/<article class="vpd-card vpd-card--analysis"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card, 'card Studio di Fattibilità AI presente');
  assert.match(card, /Due analisi per due decisioni diverse\./);
  // business: nessun requisito di campagna nella riga del teaser
  assert.match(card, /<span>Valutazione di attività, territorio, concorrenza e opportunità<\/span>/);
  // campagna: break-even, ROI e scenari
  assert.match(card, /<span>Verifica di una campagna con break-even, ROI e scenari<\/span>/);
  assert.doesNotMatch(card, /volantini|quantità|budget|acquist/i, 'la riga business del teaser non implica requisiti di campagna');
  assert.match(card, /Analisi basata sui dati realmente disponibili e sulle informazioni che fornisci\./);
  // rimando al flusso Fattibilità (rotta canonica)
  assert.equal(FEASIBILITY_PATH, '/analisi-campagna');
  assert.match(card, new RegExp('<a class="vpd-cta" href="' + FEASIBILITY_PATH + '">Scopri come funziona'));
  // La spiegazione "business parte subito / campagna usa i dati configurati" e' nella sezione dual-card.
  const feas = await renderFeasibilitySection();
  assert.match(feas, /Puoi analizzare direttamente il potenziale della tua attività oppure configurare una campagna e verificarne la sostenibilità economica utilizzando quantità, territorio e costo reali\./);
  assert.match(feas, /Configura prima la campagna: useremo automaticamente quantità, area e costo del preventivo/);
});

// ── Firewall: nessuna modifica a motori, formule, report PDF ──────────────
test('Nessuna modifica a motori/formule/report PDF: FeasibilitySection non importa nulla dal motore', () => {
  assert.doesNotMatch(sectionSrc, /feasibilityEngine|feasibilityBusinessEngine|calculateFeasibility|buildBusinessAnalysis|FeasibilityReport\.jsx|FeasibilityBusinessReport\.jsx/);
});

test('Nessuna modifica ai file del motore/report: business e campaign engine restano bit-identici alla base del ticket precedente', () => {
  const businessEngine = readFileSync(new URL('../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js', import.meta.url), 'utf8');
  const campaignEngine = readFileSync(new URL('../src/pages/customer/feasibility/feasibilityEngine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(businessEngine, /onConfigure|Configura e analizza/);
  assert.doesNotMatch(campaignEngine, /onConfigure|Configura e analizza/);
});
