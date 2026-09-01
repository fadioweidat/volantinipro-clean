// Verifica deterministica (fake timers + fetch mockato) della distinzione
// "zero POI reali" vs "errore proxy POI" (src/hooks/usePoi.js: poi.error,
// poi.retry), consumata da src/pages/public/configurator/Step2.jsx /
// src/components/Step2Map.jsx.
//
// Dopo il ticket "FIX DEFINITIVO POI OVERPASS VIA PROXY": usePoi -> fetchPois
// -> src/api/poiSearch.js -> POST /functions/v1/poi-search (mai Overpass
// diretto). Il mock di globalThis.fetch qui rappresenta quel proxy: 200 +
// elements = risultati, !ok / reject = POI_SEARCH_UNAVAILABLE.
//
// Monta l'hook REALE usePoi (non una reimplementazione) tramite un harness
// React minimale, con lo stesso pattern fake-DOM + fake-timer gia' usato in
// tests/quick_quote_h2h_business_timeout.test.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// poiSearch.js richiede l'endpoint base per costruire /functions/v1/poi-search.
process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

import { usePoi } from '../src/hooks/usePoi.js';

function installFakeDom() {
  class ElementBase {}
  class HTMLElementBase extends ElementBase {}
  class HTMLIFrameElementBase extends HTMLElementBase {}

  class FakeNode extends ElementBase {
    constructor(nodeType, nodeName) {
      super();
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.tagName = nodeName;
      this.childNodes = [];
      this.parentNode = null;
      this.style = {};
      this._attributes = new Map();
    }
    appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) { child.parentNode = null; this.childNodes.splice(idx, 1); }
      return child;
    }
    insertBefore(newNode, referenceNode) {
      newNode.parentNode = this;
      if (!referenceNode) this.childNodes.push(newNode);
      else {
        const idx = this.childNodes.indexOf(referenceNode);
        if (idx !== -1) this.childNodes.splice(idx, 0, newNode);
        else this.childNodes.push(newNode);
      }
      return newNode;
    }
    setAttribute(k, v) { this._attributes.set(k, v); }
    getAttribute(k) { return this._attributes.get(k); }
    removeAttribute(k) { this._attributes.delete(k); }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  }

  const doc = new FakeNode(9, '#document');
  doc.createElement = (tag) => { const n = new FakeNode(1, tag.toUpperCase()); n.ownerDocument = doc; return n; };
  doc.createTextNode = () => new FakeNode(3, '#text');
  doc.createComment = () => new FakeNode(8, '#comment');
  doc.createDocumentFragment = () => new FakeNode(11, '#document-fragment');

  globalThis.Element = ElementBase;
  globalThis.HTMLElement = HTMLElementBase;
  globalThis.HTMLIFrameElement = HTMLIFrameElementBase;

  const win = {
    ...globalThis,
    Element: ElementBase,
    HTMLElement: HTMLElementBase,
    HTMLIFrameElement: HTMLIFrameElementBase,
    document: doc,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  doc.defaultView = win;
  globalThis.window = win;
  globalThis.document = doc;

  return doc.createElement('div');
}

let latest = null;
function Harness({ lat, lng, radiusKm, serviceType, targetSelection }) {
  latest = usePoi(lat, lng, radiusKm, serviceType, targetSelection);
  return null;
}

function makeFetchMock(planRef) {
  const calls = [];
  const fn = (url) => {
    calls.push(String(url));
    const cfg = planRef.current;
    // Sempre via setTimeout (anche con delay 0): stesso pattern del mock in
    // tests/quick_quote_h2h_business_timeout.test.mjs, l'unico verificato
    // affidabile con t.mock.timers + il loop tick() qui sotto.
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (cfg.rejects) { reject(new Error(cfg.rejectMessage || 'NETWORK_ERROR')); return; }
        if (cfg.errorStatus) { resolve({ ok: false, status: cfg.errorStatus, json: async () => ({}) }); return; }
        resolve({ ok: true, status: 200, json: async () => ({ elements: cfg.elements || [] }) });
      }, cfg.delayMs ?? 0);
    });
  };
  fn.calls = calls;
  return fn;
}

async function tick(t, totalMs, step = 25) {
  let remaining = totalMs;
  while (remaining > 0) {
    const chunk = Math.min(step, remaining);
    t.mock.timers.tick(chunk);
    remaining -= chunk;
    await new Promise((r) => setImmediate(r));
  }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

function schoolElement(id, name, lat, lon) {
  return { type: 'node', id, lat, lon, tags: { amenity: 'school', name } };
}

// =================================================================
// TEST A — 200 + 39 scuole -> pois popolati, nessun errore
// =================================================================
test('TEST A: risposta 200 con risultati reali popola pois, error resta null', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  const plan = { current: { elements: Array.from({ length: 39 }, (_, i) => schoolElement(i, `Scuola ${i}`, 45.598 + i * 0.0001, 9.153)) } };
  globalThis.fetch = makeFetchMock(plan);

  const root = createRoot(container);
  root.render(React.createElement(Harness, { lat: 45.598, lng: 9.153, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] }));
  await tick(t, 1500);
  assert.equal(latest.loading, false);
  assert.equal(latest.error, null);
  assert.equal(latest.pois.length, 39);

  t.mock.timers.reset();
});

// =================================================================
// TEST B — 200 + [] -> zero risultati REALI, error resta null
// =================================================================
test('TEST B: risposta 200 con elements vuoti è zero reale, error resta null', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  const plan = { current: { elements: [] } };
  globalThis.fetch = makeFetchMock(plan);

  const root = createRoot(container);
  root.render(React.createElement(Harness, { lat: 46.1, lng: 10.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] }));
  await tick(t, 1500);

  assert.equal(latest.loading, false);
  assert.equal(latest.error, null, 'zero risultati reali NON è un errore');
  assert.deepEqual(latest.pois, []);

  t.mock.timers.reset();
});

// =================================================================
// TEST C — proxy non disponibile -> error valorizzato, MAI confuso con zero
// =================================================================
test('TEST C: fallimento del proxy POI valorizza error, non un empty silenzioso', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  const plan = { current: { rejects: true, rejectMessage: 'NETWORK_DOWN' } };
  globalThis.fetch = makeFetchMock(plan);

  const root = createRoot(container);
  root.render(React.createElement(Harness, { lat: 47.2, lng: 11.2, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] }));
  await tick(t, 3000);

  assert.equal(latest.loading, false);
  assert.notEqual(latest.error, null, 'un fallimento di rete deve valorizzare error');
  assert.deepEqual(latest.pois, [], 'pois vuoto in questo caso, ma NON deve essere interpretato come zero confermato (error è il discriminante)');

  t.mock.timers.reset();
});

// =================================================================
// TEST D — errore -> retry() -> successo -> pois aggiornati
// =================================================================
test('TEST D: dopo un errore, retry() ritenta la stessa query e aggiorna pois su successo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  const plan = { current: { rejects: true } };
  globalThis.fetch = makeFetchMock(plan);

  const root = createRoot(container);
  root.render(React.createElement(Harness, { lat: 48.3, lng: 12.3, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] }));
  await tick(t, 3000);
  assert.notEqual(latest.error, null, 'primo tentativo fallito');
  assert.equal(latest.pois.length, 0);

  // La sorgente torna disponibile, poi l'utente preme "Riprova".
  plan.current = { elements: [schoolElement(1, 'Scuola Retry', 48.3, 12.3)] };
  act(() => { latest.retry(); });
  await tick(t, 1500);

  assert.equal(latest.loading, false);
  assert.equal(latest.error, null, 'il retry riuscito deve azzerare error');
  assert.equal(latest.pois.length, 1, 'i marker devono aggiornarsi dopo il retry riuscito');

  t.mock.timers.reset();
});

// =================================================================
// TEST E — cambio settore dopo un errore: nessun messaggio stale
// =================================================================
test('TEST E: cambiare settore dopo un errore azzera error immediatamente (nessuno stato stale)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  const plan = { current: { rejects: true } };
  globalThis.fetch = makeFetchMock(plan);

  const root = createRoot(container);
  root.render(React.createElement(Harness, { lat: 49.4, lng: 13.4, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] }));
  await tick(t, 3000);
  assert.notEqual(latest.error, null, 'settore Scuole in errore');

  // L'utente cambia settore: la nuova query (nuova cache key) deve azzerare
  // error/pois PRIMA che il nuovo fetch completi, cosi' non resta visibile
  // per un istante il messaggio di errore del settore precedente.
  plan.current = { elements: [{ type: 'node', id: 1, lat: 49.4, lon: 13.4, tags: { leisure: 'fitness_centre', name: 'Palestra Nuova' } }] };
  root.render(React.createElement(Harness, { lat: 49.4, lng: 13.4, radiusKm: 3, serviceType: 'd2d', targetSelection: ['fitness'] }));
  await tick(t, 200);
  assert.equal(latest.error, null, 'error deve azzerarsi non appena cambia la selezione, senza aspettare il nuovo fetch');
  assert.equal(latest.loading, true);

  await tick(t, 3000);
  assert.equal(latest.error, null);
  assert.equal(latest.loading, false);
  assert.equal(latest.pois.length, 1);

  t.mock.timers.reset();
});
