import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { initialInputs } from '../src/pages/customer/feasibility/feasibilitySchemas.js';

test('FeasibilitySummary renders all section explanations, empty field hints, and CTA explainer', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const load = async path => (await vite.ssrLoadModule(path)).default;
    const FeasibilitySummary = await load('/src/pages/customer/feasibility/FeasibilitySummary.jsx');
    const inputs = initialInputs();
    const html = renderToStaticMarkup(React.createElement(FeasibilitySummary, {
      inputs,
      unusualMargin: false,
      onChange() {},
      onUnusualMargin() {},
      onGenerate() {},
      onBack() {},
    }));

    // Section explanations
    assert.match(html, /Raccontaci in poche parole che attività hai e in quale zona lavori/);
    assert.match(html, /Inserisci investimento, quantità e area della distribuzione/);
    assert.match(html, /Questi dati servono per capire quanti nuovi clienti sono necessari/);
    assert.match(html, /Confrontiamo tre scenari: prudente, realistico e crescita/);

    // Empty field contextual guidance
    assert.match(html, /Inserisci la città o zona operativa/);
    assert.match(html, /Descrivi brevemente cosa fai/);
    assert.match(html, /Inserisci il budget previsto/);
    assert.match(html, /Inserisci il numero di volantini/);
    assert.match(html, /Se non lo conosci, inserisci una stima/);
    assert.match(html, /Indica quanto ti resta mediamente per cliente/);

    // CTA explainer
    assert.match(html, /Con questi dati confronteremo investimento, margine, punto di pareggio[\s\S]*e possibili risultati della campagna/);

    // Tooltips present
    assert.match(html, /Spiegazione per Margine/);
    assert.match(html, /Spiegazione per Conversione/);
    assert.match(html, /Spiegazione per Punto di pareggio/);
  } finally {
    await vite.close();
  }
});
