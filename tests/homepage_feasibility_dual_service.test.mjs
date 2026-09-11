// TICKET — "HOMEPAGE: PRESENT 'STUDIO DI FATTIBILITÀ AI' AS 2 DISTINCT SERVICES".
// La homepage deve mostrare le due modalità (business/campaign) come servizi
// distinti e di pari peso visivo, con CTA che aprono il flusso Feasibility AI
// esistente direttamente nel modo corretto — senza toccare motore di calcolo,
// formule, Smart Pairing, POI, routing dello Step. Verifica solo presentazione
// + il piccolo aggancio di stato (history.state.feasibilityMode) che permette
// alle CTA di saltare la schermata di scelta.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { openFeasibility } from '../src/lib/feasibility/entryPoint.js';
import { readFeasibility } from '../src/pages/customer/feasibility/feasibilityStorage.js';

const sectionSrc = readFileSync(new URL('../src/components/home/FeasibilitySection.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/feasibility/feasibility.css', import.meta.url), 'utf8');

// FeasibilitySection.jsx importa un .css: caricarlo direttamente sotto
// node:test (tsx) fallisce (nessun loader CSS). Si usa il transform SSR di
// Vite, stesso pattern di tests/feasibility_entry_points.test.mjs.
async function renderFeasibilitySection() {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const Home = (await vite.ssrLoadModule('/src/components/home/FeasibilitySection.jsx')).default;
    return renderToStaticMarkup(React.createElement(Home));
  } finally {
    await vite.close();
  }
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
  assert.match(html, /Studio di Fattibilità AI/);
  assert.match(html, /Due analisi diverse, in base a ciò che vuoi decidere\./);
  // Ticket "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP" §4: la copy di supporto
  // deve rendere esplicita la distinzione (analisi diretta vs campagna
  // configurata con dati reali), non solo elencare i due argomenti.
  assert.match(html, /Puoi analizzare direttamente il potenziale della tua attività oppure configurare una campagna e verificarne la sostenibilità economica utilizzando quantità, territorio e costo reali\./);
});

test('FeasibilitySection: Card A (business) ha titolo, sottotitolo, descrizione, bullet e CTA esatti', async () => {
  const html = await renderFeasibilitySection();
  assert.match(html, /Fattibilità della mia attività/);
  assert.match(html, /Scopri se una zona è adatta alla tua attività\./);
  assert.match(html, /Analizziamo territorio, pubblico potenziale, concorrenza, attività vicine, opportunità e rischi\./);
  for (const bullet of ['Bacino potenziale', 'Concorrenza nella zona', 'POI e contesto territoriale', 'Punti di forza e criticità', 'Valutazione finale']) {
    assert.match(html, new RegExp(bullet));
  }
  assert.match(html, />Analizza la tua attività</);
});

test('FeasibilitySection: Card B (campaign) ha titolo, sottotitolo, descrizione, bullet e CTA esatti', async () => {
  const html = await renderFeasibilitySection();
  assert.match(html, /Fattibilità della campagna pubblicitaria/);
  assert.match(html, /Scopri se il tuo investimento può essere sostenibile\./);
  assert.match(html, /Confrontiamo costo, margine, clienti necessari, punto di pareggio e scenari possibili\./);
  for (const bullet of ['Break-even', 'Clienti necessari per rientrare', 'Scenario prudente / realistico / crescita', 'Margine e sostenibilità', 'Rischi e raccomandazioni']) {
    assert.match(html, new RegExp(bullet.replace(/[/]/g, '\\/')));
  }
  // Ticket "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP": la card campagna non
  // apre più il flusso standalone (vuoto senza servizio/quantità/zona) dalla
  // home — porta al configuratore, che poi rimanda a Fattibilità Campagna
  // già prefillata (Step4 "Analizza la convenienza").
  assert.match(html, />Configura e analizza la campagna</);
  assert.doesNotMatch(html, />Analizza la tua campagna</);
  assert.match(html, /Configura prima la campagna: useremo automaticamente/);
});

// ── 4. CTA wiring: business apre direttamente il flusso, campagna passa dal configuratore ─
test('FeasibilitySection: la CTA business chiama openFeasibility(null, window, "business"); quella campaign usa onConfigure (mai openFeasibility standalone)', () => {
  assert.match(sectionSrc, /onClick=\{\(\) => openFeasibility\(null, window, 'business'\)\}/);
  assert.doesNotMatch(sectionSrc, /onClick=\{\(\) => openFeasibility\(null, window, 'campaign'\)\}/, 'la card campagna non deve più aprire il flusso standalone direttamente');
  assert.match(sectionSrc, /onConfigure/);
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
test('CSS: le due card usano una grid a 2 colonne uguali su desktop, 1 colonna su mobile', () => {
  assert.match(css, /\.vp-feasibility-dual-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  const mobileBlock = css.match(/@media \(max-width:\s*800px\)\s*\{[\s\S]*?\n@media/)?.[0] || css.slice(css.indexOf('@media (max-width: 800px)'));
  assert.match(mobileBlock, /\.vp-feasibility-dual-grid\s*\{\s*grid-template-columns:\s*1fr;/);
  // nessuna card ha stili distintivi che la rendano dominante: entrambe usano
  // la stessa classe .vp-feasibility-dual-card, nessuna regola per-card diversa
  const businessCardCount = (sectionSrc.match(/className="vp-feasibility-dual-card"/g) || []).length;
  assert.equal(businessCardCount, 2, 'entrambe le card devono condividere la stessa classe/stile, nessuna e piu prominente');
});

// ── 7. Sezione "Perché diverso": niente duplicazione della sezione campagna ─
test('WhyDifferentSection: la card di rimando non duplica i bullet di dettaglio della sezione dual-card', () => {
  const whySrc = readFileSync(new URL('../src/components/home/WhyDifferentSection.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(whySrc, /Break-even e ROI/);
  assert.doesNotMatch(whySrc, /Scenari prudente, realistico e crescita/);
  assert.match(whySrc, /Studio di Fattibilità AI/);
  assert.match(whySrc, /#feasibility-home-title/);
});

// ── 8. Nessuna regressione sul motore/formule/rotte esistenti ──────────────
test('FeasibilitySection non importa nulla dal motore di calcolo o dalla logica business/campaign interna', () => {
  assert.doesNotMatch(sectionSrc, /feasibilityEngine|feasibilityBusinessEngine|calculateFeasibility|buildBusinessAnalysis/);
});
