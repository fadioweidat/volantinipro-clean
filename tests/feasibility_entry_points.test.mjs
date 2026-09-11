import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { feasibilityContext, openFeasibility, FEASIBILITY_SERVICE } from '../src/lib/feasibility/entryPoint.js';
import { resolveAppRoute } from '../src/app/routeResolution.js';

test('route is public and resolves without configuration or auth', () => {
  assert.equal(resolveAppRoute('/analisi-campagna'), 'feasibility');
  assert.equal(FEASIBILITY_SERVICE.price, null);
});

test('handoff copies only safe context and navigation cannot mutate quote/payment', () => {
  const draft = { quantity: 10000, total: 321.50, service: 'd2d', municipalities: ['Varedo'], areas: ['Varedo'], payment_status: 'pending', email: 'private@example.com' };
  const before = structuredClone(draft);
  const calls = [];
  const previous = globalThis.PopStateEvent;
  globalThis.PopStateEvent = class { constructor(type, options) { this.type = type; this.state = options.state; } };
  try {
    const browser = { history: { pushState(state, title, path) { this.state = state; calls.push(path); } }, dispatchEvent(event) { calls.push(event.type); }, scrollTo() {} };
    openFeasibility(draft, browser);
    assert.deepEqual(calls, ['/analisi-campagna', 'popstate']);
    assert.equal(browser.history.state.feasibility.total, 321.50);
    assert.equal('payment_status' in browser.history.state.feasibility, false);
    assert.equal('email' in browser.history.state.feasibility, false);
    browser.history.state.feasibility.areas.push('Other');
    assert.deepEqual(draft, before);
  } finally { globalThis.PopStateEvent = previous; }
  assert.equal(feasibilityContext({ total: NaN }).total, null);
});

test('home, optional Step4 card and placeholder render accessible entry points', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const load = async path => (await vite.ssrLoadModule(path)).default;
    const Home = await load('/src/components/home/FeasibilitySection.jsx');
    const Card = await load('/src/pages/public/configurator/step4/Step4FeasibilityCard.jsx');
    const Page = await load('/src/pages/public/FeasibilityPage.jsx');
    const home = renderToStaticMarkup(React.createElement(Home));
    const card = renderToStaticMarkup(React.createElement(Card, { context: { total: 321.50 } }));
    const page = renderToStaticMarkup(React.createElement(Page, { onNav() {} }));
    assert.match(home, /Due analisi diverse, in base a ciò che vuoi decidere\./);
    assert.match(home, /Analizza la tua attività/);
    // Ticket "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP": la card campagna non
    // apre più il flusso standalone dalla home — CTA verso il configuratore.
    assert.match(home, /Configura e analizza la campagna/);
    assert.doesNotMatch(home, /Analizza la tua campagna/);
    assert.match(card, /Analizza la convenienza/);
    assert.match(card, /type="button"/);
    assert.match(card, /non modifica il tuo preventivo/);
    assert.match(page, /Torna al preventivo/);
    assert.match(page, /Dashboard/);
    for (const html of [home, card, page]) assert.doesNotMatch(html, /19[,.]90|€|guadagno garantito|clienti garantiti/);
  } finally { await vite.close(); }
});

test('integration brackets new card between pricing and unchanged confirmation', () => {
  const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const step4 = read('src/pages/public/configurator/Step4.jsx');
  assert.ok(step4.indexOf('<Step4FeasibilityCard') > step4.indexOf('<Step4PricingSummaryPanel'));
  assert.ok(step4.indexOf('<Step4FeasibilityCard') < step4.indexOf('<Step4CampaignActionsPanel'));
  assert.match(step4, /handleConfirmCampaign=\{handleConfirmCampaign\}/);
  const home = read('src/pages/public/HomePage.jsx');
  assert.ok(home.indexOf('_jsx(FeasibilitySection,') > home.indexOf('_jsx(HowItWorksSection,'));
  assert.ok(home.indexOf('_jsx(FeasibilitySection,') < home.indexOf('_jsx(ServicesSection,'));
});
