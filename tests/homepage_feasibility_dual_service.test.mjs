// TICKET — "HOMEPAGE: PRESENT 'STUDIO DI FATTIBILITÀ AI' AS 2 DISTINCT SERVICES".
// La homepage deve mostrare le due modalità (business/campaign) come servizi
// distinti e di pari peso visivo, con CTA che aprono il flusso Feasibility AI
// esistente direttamente nel modo corretto — senza toccare motore di calcolo,
// formule, Smart Pairing, POI, routing dello Step. Verifica solo presentazione
// + il piccolo aggancio di stato (history.state.feasibilityMode) che permette
// alle CTA di saltare la schermata di scelta.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { openFeasibility, FEASIBILITY_PATH } from '../src/lib/feasibility/entryPoint.js';
import { readFeasibility } from '../src/pages/customer/feasibility/feasibilityStorage.js';

const sectionSrc = readFileSync(new URL('../src/components/home/FeasibilitySection.jsx', import.meta.url), 'utf8');
const homeCss = readFileSync(new URL('../src/components/home/process-feasibility.css', import.meta.url), 'utf8');

// FeasibilitySection.jsx importa un .css: caricarlo direttamente sotto
// node:test (tsx) fallisce (nessun loader CSS). Si usa il transform SSR di
// Vite, stesso pattern di tests/feasibility_entry_points.test.mjs.
// Un solo server Vite condiviso per tutto il file (avviarne uno per test costa decine di secondi).
let homeModules = null;
let homeVite = null; // tenuto a parte: after() chiude il server anche se un ssrLoadModule fallisce
async function withHomeModules(fn) {
  if (!homeModules) {
    homeModules = (async () => {
      homeVite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
      const FeasibilitySection = (await homeVite.ssrLoadModule('/src/components/home/FeasibilitySection.jsx')).default;
      const WhyDifferentSection = (await homeVite.ssrLoadModule('/src/components/home/WhyDifferentSection.jsx')).default;
      return { FeasibilitySection, WhyDifferentSection };
    })();
  }
  const { FeasibilitySection, WhyDifferentSection } = await homeModules;
  return fn({ FeasibilitySection, WhyDifferentSection });
}
after(async () => { if (homeVite) await homeVite.close(); });

async function renderFeasibilitySection() {
  return withHomeModules(({ FeasibilitySection }) => renderToStaticMarkup(React.createElement(FeasibilitySection)));
}

// Testo visibile di un albero React (solo host element; salta i nodi aria-hidden
// e i function component). FeasibilitySection non usa hook: si puo' chiamare
// come funzione semplice per ispezionare props/onClick senza DOM.
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node.type !== 'string' || node.props?.['aria-hidden'] === 'true') return '';
  return textOf(node.props?.children);
}
function findAll(node, pred, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out; }
  if (pred(node)) out.push(node);
  findAll(node.props?.children, pred, out);
  return out;
}

// ── 1. entryPoint.js: openFeasibility(mode) e' additivo ────────────────────
test('openFeasibility: senza mode, il comportamento esistente resta identico (nessun feasibilityMode scritto)', () => {
  const previous = globalThis.PopStateEvent;
  globalThis.PopStateEvent = class { constructor(type, options) { this.type = type; this.state = options.state; } };
  try {
    const browser = { history: { pushState(state) { this.state = state; } }, dispatchEvent() {}, scrollTo() {} };
    openFeasibility({ total: 420 }, browser);
    assert.equal('feasibilityMode' in browser.history.state, false);
    assert.equal(browser.history.state.feasibility.total, 420);
  } finally { globalThis.PopStateEvent = previous; }
});

test('openFeasibility: mode="business"/"campaign" scrive history.state.feasibilityMode; valori non validi vengono ignorati', () => {
  const previous = globalThis.PopStateEvent;
  globalThis.PopStateEvent = class { constructor(type, options) { this.type = type; this.state = options.state; } };
  try {
    const b1 = { history: { pushState(state) { this.state = state; } }, dispatchEvent() {}, scrollTo() {} };
    openFeasibility(null, b1, 'business');
    assert.equal(b1.history.state.feasibilityMode, 'business');
    assert.equal(b1.history.state.feasibility, null);

    const b2 = { history: { pushState(state) { this.state = state; } }, dispatchEvent() {}, scrollTo() {} };
    openFeasibility(null, b2, 'campaign');
    assert.equal(b2.history.state.feasibilityMode, 'campaign');

    const b3 = { history: { pushState(state) { this.state = state; } }, dispatchEvent() {}, scrollTo() {} };
    openFeasibility(null, b3, 'not-a-real-mode');
    assert.equal('feasibilityMode' in b3.history.state, false);
  } finally { globalThis.PopStateEvent = previous; }
});

// ── 2. feasibilityStorage.js: la CTA salta la schermata di scelta ──────────
test('readFeasibility: history.state.feasibilityMode vince sempre, anche su una sessione salvata diversa', () => {
  const map = new Map();
  const browser = { history: { state: { feasibility: null, feasibilityMode: 'business' } }, sessionStorage: { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) } };
  assert.equal(readFeasibility(browser).mode, 'business');

  // sessione precedente salvata come 'campaign' -> la CTA business vince comunque
  map.set('vp_feasibility_session_v2', JSON.stringify({ version: 2, contextKey: 'null', inputs: {}, unusualMargin: false, phase: 0, mode: 'campaign', businessInputs: {}, savedAt: Date.now() }));
  assert.equal(readFeasibility(browser).mode, 'business');

  const browserCampaign = { history: { state: { feasibility: null, feasibilityMode: 'campaign' } }, sessionStorage: { getItem: () => null, setItem() {} } };
  assert.equal(readFeasibility(browserCampaign).mode, 'campaign');
});

test('readFeasibility: senza feasibilityMode nello state, il default resta "campaign" (nessuna regressione sugli entry point storici)', () => {
  const browser = { history: { state: { feasibility: null } }, sessionStorage: { getItem: () => null, setItem() {} } };
  assert.equal(readFeasibility(browser).mode, 'campaign');
  // Home CTA storico (Step4FeasibilityCard, home vecchia) non passa mai feasibilityMode
  const browserNoState = { sessionStorage: { getItem: () => null, setItem() {} } };
  assert.equal(readFeasibility(browserNoState).mode, 'campaign');
});

// ── 3. Contenuto homepage: due card di pari peso, copy esatta del ticket ──
test('FeasibilitySection: eyebrow, titolo e copy di supporto corrispondono esattamente al ticket', async () => {
  const html = await renderFeasibilitySection();
  assert.match(html, /<p class="vpp-eyebrow">STUDIO DI FATTIBILITÀ AI<\/p>/);
  assert.match(html, /<h2 id="feasibility-home-title">Due analisi diverse, in base a ciò che vuoi decidere\.<\/h2>/);
  // Ticket "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP" §4: la copy di supporto
  // deve rendere esplicita la distinzione (analisi diretta vs campagna
  // configurata con dati reali), non solo elencare i due argomenti.
  assert.match(html, /Puoi analizzare direttamente il potenziale della tua attività oppure configurare una campagna e verificarne la sostenibilità economica utilizzando quantità, territorio e costo reali\./);
});

test('FeasibilitySection: Card A (business) ha titolo, sottotitolo, descrizione, bullet e CTA esatti', async () => {
  const html = await renderFeasibilitySection();
  // Scoped alla sola card business: un bullet non puo' passare perche' presente nell'altra card.
  const business = html.slice(html.indexOf('feasibility-business-title'), html.indexOf('feasibility-campaign-title'));
  assert.ok(business.length > 0 && !business.includes('feasibility-campaign-title'), 'slice card business valido');
  assert.match(business, /<h3 id="feasibility-business-title">Fattibilità della mia attività<\/h3>/);
  assert.match(business, /Scopri se una zona è adatta alla tua attività\./);
  assert.match(business, /Analizziamo territorio, pubblico potenziale, concorrenza, attività vicine, opportunità e rischi\./);
  for (const bullet of ['Bacino potenziale', 'Concorrenza nella zona', 'POI e contesto territoriale', 'Punti di forza e criticità', 'Valutazione finale']) {
    assert.ok(business.includes('<li>' + bullet + '</li>'), 'bullet business mancante: ' + bullet);
  }
  // La CTA rende "testo + freccia aria-hidden": il testo e' seguito da uno spazio e dallo <span>.
  assert.match(business, />Analizza la tua attività\s*</);
  assert.match(business, /ANALISI TERRITORIALE/);
});

test('FeasibilitySection: Card B (campaign) ha titolo, sottotitolo, descrizione, bullet e CTA esatti', async () => {
  const html = await renderFeasibilitySection();
  const campaign = html.slice(html.indexOf('feasibility-campaign-title'));
  assert.ok(campaign.length > 0 && !campaign.includes('feasibility-business-title'), 'slice card campagna valido');
  assert.match(campaign, /<h3 id="feasibility-campaign-title">Fattibilità della campagna pubblicitaria<\/h3>/);
  assert.match(campaign, /Scopri se il tuo investimento può essere sostenibile\./);
  assert.match(campaign, /Confrontiamo costo, margine, clienti necessari, punto di pareggio e scenari possibili\./);
  for (const bullet of ['Break-even', 'Clienti necessari per rientrare', 'Scenario prudente / realistico / crescita', 'Margine e sostenibilità', 'Rischi e raccomandazioni']) {
    assert.ok(campaign.includes('<li>' + bullet + '</li>'), 'bullet campagna mancante: ' + bullet);
  }
  assert.match(campaign, /ANALISI ECONOMICA/);
  // Ticket "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP": la card campagna non
  // apre più il flusso standalone (vuoto senza servizio/quantità/zona) dalla
  // home — porta al configuratore, che poi rimanda a Fattibilità Campagna
  // già prefillata (Step4 "Analizza la convenienza").
  assert.match(campaign, />Configura e analizza la campagna\s*</);
  assert.doesNotMatch(html, />Analizza la tua campagna\s*</);
  assert.match(campaign, /Configura prima la campagna: useremo automaticamente quantità, area e costo del preventivo nell.analisi\./);
});

// ── 4. CTA wiring: business apre direttamente il flusso, campagna passa dal configuratore ─
test('FeasibilitySection: la CTA business chiama openFeasibility(null, window, "business"); quella campaign usa onConfigure (mai openFeasibility standalone)', () => {
  assert.match(sectionSrc, /onClick=\{\(\) => openFeasibility\(null, window, 'business'\)\}/);
  assert.doesNotMatch(sectionSrc, /onClick=\{\(\) => openFeasibility\(null, window, 'campaign'\)\}/, 'la card campagna non deve più aprire il flusso standalone direttamente');
  assert.match(sectionSrc, /onConfigure/);
});

test('FeasibilitySection (runtime): CTA business scrive history.state.feasibilityMode="business"; CTA campagna chiama onConfigure senza aprire il flusso standalone; fallback /preventivo', async () => {
  await withHomeModules(async ({ FeasibilitySection }) => {
    const pushes = [];
    let configured = 0;
    const previousWindow = globalThis.window;
    const previousPop = globalThis.PopStateEvent;
    globalThis.PopStateEvent = class { constructor(type, options) { this.type = type; this.state = options.state; } };
    const fakeWindow = { location: { href: '' }, history: { pushState(state) { pushes.push(state); } }, dispatchEvent() {}, scrollTo() {} };
    globalThis.window = fakeWindow;
    try {
      const byLabel = (tree, label) => findAll(tree, (n) => n.type === 'button').find((b) => textOf(b).trim() === label);
      const tree = FeasibilitySection({ onConfigure: () => { configured += 1; } });
      const businessBtn = byLabel(tree, 'Analizza la tua attività');
      const campaignBtn = byLabel(tree, 'Configura e analizza la campagna');
      assert.ok(businessBtn && campaignBtn, 'entrambe le CTA trovate');
      businessBtn.props.onClick();
      assert.equal(pushes.length, 1);
      assert.equal(pushes[0].feasibilityMode, 'business');
      campaignBtn.props.onClick();
      assert.equal(configured, 1);
      assert.equal(pushes.length, 1, 'la CTA campagna non deve aprire il flusso standalone');
      // Fallback senza onConfigure: porta al configuratore.
      byLabel(FeasibilitySection({}), 'Configura e analizza la campagna').props.onClick();
      assert.equal(fakeWindow.location.href, '/preventivo');
      assert.equal(pushes.length, 1);
    } finally {
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
      if (previousPop === undefined) delete globalThis.PopStateEvent; else globalThis.PopStateEvent = previousPop;
    }
  });
});

// ── 5. Posizionamento commerciale (§7): business non menziona requisiti di campagna ─
test('Card business non implica acquisto volantini/campagna/budget/quantita richiesti', async () => {
  const html = await renderFeasibilitySection();
  const businessCardStart = html.indexOf('feasibility-business-title');
  const campaignCardStart = html.indexOf('feasibility-campaign-title');
  const businessCardHtml = html.slice(businessCardStart, campaignCardStart);
  assert.doesNotMatch(businessCardHtml, /volantini|quantità|budget|acquist|campagna pubblicitaria richiesta/i);
});

// ── 6. Pari peso visivo, desktop side-by-side, mobile stacked (§4) ─────────
test('CSS + struttura: le due card usano una grid a 2 colonne uguali su desktop, 1 colonna su mobile, stessa classe e stessa struttura', async () => {
  // CSS reale della sezione: src/components/home/process-feasibility.css (.vpp-analysis-*).
  assert.match(homeCss, /\.vpp-analysis-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(homeCss, /@media\s*\(max-width:\s*850px\)\s*\{[^@]*?\.vpp-analysis-grid\s*\{\s*grid-template-columns:\s*1fr\b/);
  assert.match(homeCss, /\.vpp-analysis-card\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
  // Nessun override per-card che ne alteri dimensione/prominenza (solo accenti colore).
  let overrideRules = 0;
  for (const re of [/\.vpp-business\s*\{([^}]*)\}/g, /\.vpp-campaign\s*\{([^}]*)\}/g]) {
    for (const m of homeCss.matchAll(re)) {
      overrideRules += 1;
      assert.doesNotMatch(m[1], /(min-height|padding|width|height|font-size|grid-column|order|transform|scale)\s*:/, 'override dimensionale su ' + re);
    }
  }
  assert.ok(overrideRules >= 1, 'regole .vpp-business/.vpp-campaign presenti (controllo non vacuo)');
  await withHomeModules(({ FeasibilitySection }) => {
    const tree = FeasibilitySection({});
    const grid = findAll(tree, (n) => n.props?.className === 'vpp-analysis-grid');
    assert.equal(grid.length, 1);
    const cards = findAll(grid[0], (n) => n.type === 'article');
    assert.equal(cards.length, 2);
    for (const c of cards) assert.ok(c.props.className.split(' ').includes('vpp-analysis-card'), 'entrambe le card condividono vpp-analysis-card');
    assert.deepEqual(cards.map((c) => c.props.className.split(' ')[1]), ['vpp-business', 'vpp-campaign']);
    const shape = (c) => [].concat(c.props.children).filter(Boolean).map((ch) => ch.props?.className || ch.type);
    assert.deepEqual(shape(cards[0]), shape(cards[1]), 'stessa struttura interna per entrambe le card');
    for (const c of cards) assert.equal(findAll(c, (n) => n.type === 'li').length, 5);
  });
});

// ── 7. Sezione "Perché diverso": niente duplicazione della sezione campagna ─
test('WhyDifferentSection: la card di rimando non duplica i bullet di dettaglio della sezione dual-card e punta al flusso Fattibilità', async () => {
  await withHomeModules(({ FeasibilitySection, WhyDifferentSection }) => {
    const why = renderToStaticMarkup(React.createElement(WhyDifferentSection));
    const feas = renderToStaticMarkup(React.createElement(FeasibilitySection));
    const card = why.match(/<article class="vpd-card vpd-card--analysis"[\s\S]*?<\/article>/)?.[0];
    assert.ok(card, 'card Studio di Fattibilità AI presente');
    assert.match(card, /<h3 id="difference-analysis">Studio di Fattibilità AI<\/h3>/);
    assert.match(card, /AI \+ ANALISI/);
    assert.doesNotMatch(card, /Break-even e ROI|Scenari prudente, realistico e crescita/);
    const teaserBullets = [...card.matchAll(/<li>[\s\S]*?<span>([^<]+)<\/span><\/li>/g)].map((m) => m[1]);
    const detailBullets = [...feas.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
    assert.equal(teaserBullets.length, 2);
    assert.equal(detailBullets.length, 10);
    for (const b of teaserBullets) assert.ok(!detailBullets.includes(b), 'bullet duplicato: ' + b);
    // Rimando: link reale al flusso (rotta canonica); il target ancora esiste nella sezione dual.
    assert.equal(FEASIBILITY_PATH, '/analisi-campagna');
    assert.match(card, /<a class="vpd-cta" href="\/analisi-campagna">Scopri come funziona/);
    assert.match(feas, /id="feasibility-home-title"/);
  });
});

// ── 8. Nessuna regressione sul motore/formule/rotte esistenti ──────────────
test('FeasibilitySection non importa nulla dal motore di calcolo o dalla logica business/campaign interna', () => {
  assert.doesNotMatch(sectionSrc, /feasibilityEngine|feasibilityBusinessEngine|calculateFeasibility|buildBusinessAnalysis/);
});
