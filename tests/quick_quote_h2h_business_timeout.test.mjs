// Verifica deterministica (fake timers + fetch mockato) della logica di
// timeout/caricamento progressivo H2H/Business del Preventivo Rapido,
// introdotta in src/pages/public/QuickQuotePage.jsx e
// src/lib/quickQuote/territorialCampaignCalculator.js.
//
// NOTA METODOLOGICA: QuickQuotePage.jsx non espone la propria logica di
// orchestrazione (i 3 slot useServiceAnalysis + il timer di timeout
// per-comune + il lock "stima accettata") come modulo separato, e questo
// progetto non ha jsdom/event-simulation per pilotare via click/typing la
// UI reale di ricerca comuni. Per testare in modo deterministico e
// riproducibile SENZA duplicare la logica applicativa in modo divergente,
// questo file monta un harness React minimale che chiama le stesse funzioni
// REALI e non modificate (useServiceAnalysis, computeH2HTerritorialSummary,
// computeBusinessTerritorialEstimate, getBusinessDefaultCopies,
// computeTerritorialCampaign) e riproduce fedelmente — stessa struttura,
// stessi nomi, stesso valore di timeout — l'unica parte che in
// QuickQuotePage.jsx vive solo inline: i due useEffect di
// invalidazione/timeout e la derivazione di poiMunicipalityResults/
// recommendedQty. Se quella parte inline cambia in QuickQuotePage.jsx senza
// aggiornare l'harness sotto, questo file smette di rappresentare fedelmente
// il comportamento reale — è un limite esplicito, dichiarato qui.
//
// Il valore del timeout è verificato per non divergere dal sorgente reale
// tramite un controllo testuale diretto del file (vedi ASSERT_TIMEOUT_SYNC).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

process.env.VITE_SUPABASE_URL = 'https://mqkelrsvksrzrpmbstvd.supabase.co';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { useServiceAnalysis } from '../src/hooks/useServiceAnalysis.js';
import {
  computeH2HTerritorialSummary,
  computeBusinessTerritorialEstimate,
  computeTerritorialCampaign,
} from '../src/lib/quickQuote/territorialCampaignCalculator.js';
import { getBusinessDefaultCopies } from '../src/lib/business/business-config.js';

const POI_PER_COMUNE_TIMEOUT_MS = 25000;

// ---------------------------------------------------------------
// Sincronia col sorgente reale: se qualcuno cambia il timeout in
// QuickQuotePage.jsx senza aggiornare questo file, il test fallisce qui
// invece di verificare silenziosamente un valore ormai sbagliato.
// ---------------------------------------------------------------
test('POI_PER_COMUNE_TIMEOUT_MS del test corrisponde al valore reale in QuickQuotePage.jsx', () => {
  const source = readFileSync(new URL('../src/pages/public/QuickQuotePage.jsx', import.meta.url), 'utf8');
  const match = source.match(/const POI_PER_COMUNE_TIMEOUT_MS = (\d+);/);
  assert.ok(match, 'costante POI_PER_COMUNE_TIMEOUT_MS non trovata in QuickQuotePage.jsx');
  assert.equal(Number(match[1]), POI_PER_COMUNE_TIMEOUT_MS);
});

// ---------------------------------------------------------------
// Fake DOM minimale (stesso pattern gia' usato in
// tests/step2_territorial_pipeline.test.mjs) per montare componenti React
// con react-dom/client fuori da un browser.
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// Fetch mock: risponde solo a analysis-poi-search, in base al parametro
// municipality nell'URL. Ogni comune ha un piano indipendente (delay,
// payload, oppure "non risolve mai in questo test").
// ---------------------------------------------------------------
function makeFetchMock(plan) {
  const calls = [];
  const fn = async (url) => {
    const urlStr = String(url);
    calls.push(urlStr);
    const name = Object.keys(plan).find((n) => urlStr.includes(`municipality=${encodeURIComponent(n)}`));
    if (!name) {
      return { ok: true, status: 200, json: async () => ({ values: {}, metadata: {}, sources: [], error: 'POI_DATA_NOT_AVAILABLE' }) };
    }
    const cfg = plan[name];
    if (cfg.neverResolves) {
      await new Promise(() => {});
    }
    if (cfg.delayMs != null) {
      await new Promise((resolve) => setTimeout(resolve, cfg.delayMs));
    }
    if (cfg.errorStatus) {
      return { ok: false, status: cfg.errorStatus, json: async () => ({ error: 'MOCK_ERROR' }) };
    }
    return { ok: true, status: 200, json: async () => ({ values: cfg.values || {}, metadata: {}, sources: ['mock'] }) };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------
// Harness — riproduce fedelmente (vedi nota in testa al file) la parte
// inline di QuickQuotePage.jsx per H2H/B2B: 3 slot fissi useServiceAnalysis,
// timer di timeout per-comune, invalidazione su cambio comuni/servizio,
// stato "accettato" per Business.
// ---------------------------------------------------------------
let latest = null;

function Harness({ service, comuni }) {
  const poiSlot0 = useServiceAnalysis(comuni[0]?.lat, comuni[0]?.lng, 3, service, service !== 'd2d' && comuni[0] ? comuni[0].name : null, null, 'comune', null, 'municipality', null);
  const poiSlot1 = useServiceAnalysis(comuni[1]?.lat, comuni[1]?.lng, 3, service, service !== 'd2d' && comuni[1] ? comuni[1].name : null, null, 'comune', null, 'municipality', null);
  const poiSlot2 = useServiceAnalysis(comuni[2]?.lat, comuni[2]?.lng, 3, service, service !== 'd2d' && comuni[2] ? comuni[2].name : null, null, 'comune', null, 'municipality', null);
  const poiSlots = [poiSlot0, poiSlot1, poiSlot2];
  const poiSlotsLoading = [poiSlot0.loading, poiSlot1.loading, poiSlot2.loading];

  const [poiTimedOut, setPoiTimedOut] = React.useState([false, false, false]);
  const [acceptedBusinessEstimate, setAcceptedBusinessEstimate] = React.useState(null);
  const poiTimeoutTimersRef = React.useRef([null, null, null]);

  React.useEffect(() => {
    setPoiTimedOut([false, false, false]);
    setAcceptedBusinessEstimate(null);
    poiTimeoutTimersRef.current.forEach((t) => t && clearTimeout(t));
    poiTimeoutTimersRef.current = [null, null, null];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, comuni]);

  React.useEffect(() => {
    if (service === 'd2d') return undefined;
    poiSlotsLoading.forEach((loading, i) => {
      if (loading && !poiTimeoutTimersRef.current[i]) {
        poiTimeoutTimersRef.current[i] = setTimeout(() => {
          setPoiTimedOut((prev) => { if (prev[i]) return prev; const next = [...prev]; next[i] = true; return next; });
        }, POI_PER_COMUNE_TIMEOUT_MS);
      }
      if (!loading && poiTimeoutTimersRef.current[i]) {
        clearTimeout(poiTimeoutTimersRef.current[i]);
        poiTimeoutTimersRef.current[i] = null;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, poiSlotsLoading[0], poiSlotsLoading[1], poiSlotsLoading[2]]);

  const poiMunicipalityResults = React.useMemo(() => {
    if (service === 'd2d') return [];
    return comuni.map((c, i) => {
      const slot = poiSlots[i];
      if (poiTimedOut[i]) return { municipality: c.name, status: 'timeout', values: null };
      if (slot?.loading) return { municipality: c.name, status: 'pending', values: null };
      const hasValues = Boolean(slot?.data?.values) && Object.keys(slot.data.values).length > 0;
      const matched = hasValues && !slot?.error;
      return { municipality: c.name, status: matched ? 'matched' : 'unavailable', values: matched ? slot.data.values : null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, comuni, poiTimedOut, poiSlot0.data, poiSlot1.data, poiSlot2.data, poiSlot0.error, poiSlot1.error, poiSlot2.error, poiSlotsLoading[0], poiSlotsLoading[1], poiSlotsLoading[2]]);

  const h2hSummary = service === 'h2h' && comuni.length > 0 ? computeH2HTerritorialSummary({ municipalityResults: poiMunicipalityResults }) : null;
  const businessDefaultCopies = getBusinessDefaultCopies({});
  const businessEstimate = service === 'b2b' && comuni.length > 0
    ? computeBusinessTerritorialEstimate({ municipalityResults: poiMunicipalityResults, defaultCopies: businessDefaultCopies })
    : null;
  const recommendedQty = service === 'b2b' ? (acceptedBusinessEstimate ?? businessEstimate?.estimatedMaterials ?? null) : null;

  latest = {
    poiMunicipalityResults,
    h2hSummary,
    businessEstimate,
    recommendedQty,
    acceptedBusinessEstimate,
    acceptCurrentEstimate: () => setAcceptedBusinessEstimate(businessEstimate?.estimatedMaterials ?? null),
  };
  return null;
}

const comuneA = { name: 'ComuneA', lat: 45.1, lng: 9.1 };
const comuneB = { name: 'ComuneB', lat: 45.2, lng: 9.2 };
const comuneC = { name: 'ComuneC', lat: 45.3, lng: 9.3 };

// Avanza il tempo virtuale a piccoli passi, con un flush della coda
// micro/macrotask tra un passo e l'altro: necessario perche' ogni fetch
// mockata pianifica il proprio setTimeout(delayMs) SOLO dopo che il debounce
// di useServiceAnalysis (450ms) e' scattato — un singolo salto grande non
// garantisce che l'engine di fake timer incateni correttamente timer
// pianificati "durante" l'avanzamento stesso.
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

// =================================================================
// 1. TEST TIMEOUT DETERMINISTICO (H2H) — A veloce, B veloce, C timeout
// =================================================================
test('H2H: A(100ms)+B(300ms) aggregati subito, C va in timeout a 25000ms, mai trattato come zero', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    ComuneA: { delayMs: 100, values: { poi_count: 40, transit_points: 10, schools_events_count: 20, hotspot_count: 3 } },
    ComuneB: { delayMs: 300, values: { poi_count: 60, transit_points: 15, schools_events_count: 30, hotspot_count: 4 } },
    ComuneC: { delayMs: 30000, values: { poi_count: 999, transit_points: 999, schools_events_count: 999, hotspot_count: 999 } },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'h2h', comuni: [comuneA, comuneB, comuneC] }));
  await tick(t, 0);

  // Debounce (450ms) + fetch A (100ms): A completo, B e C ancora in corso.
  await tick(t, 600);
  assert.equal(latest.poiMunicipalityResults[0].status, 'matched', 'A deve essere completato dopo 600ms');
  assert.equal(latest.poiMunicipalityResults[1].status, 'pending', 'B deve essere ancora in corso');
  assert.equal(latest.poiMunicipalityResults[2].status, 'pending', 'C deve essere ancora in corso');

  // Debounce + fetch B (300ms): anche B completo.
  await tick(t, 300);
  assert.equal(latest.poiMunicipalityResults[1].status, 'matched', 'B deve essere completato');
  assert.equal(latest.poiMunicipalityResults[2].status, 'pending', 'C deve essere ancora in corso (non ancora in timeout)');

  // KPI aggregati devono gia' riflettere SOLO A+B, senza aspettare C.
  assert.equal(latest.h2hSummary.poiCount, 100, 'poi = 40+60, mai in attesa di C');
  assert.equal(latest.h2hSummary.transitPoints, 25);
  assert.equal(latest.h2hSummary.schoolsEventsCount, 50);
  assert.equal(latest.h2hSummary.hotspotCount, 7);
  assert.equal(latest.h2hSummary.completedCount, 2);
  assert.equal(latest.h2hSummary.totalCount, 3);
  assert.equal(latest.h2hSummary.automaticQuantity, false, 'H2H non deve mai proporre una quantita automatica');

  // Avanza fino a superare i 25000ms dall'inizio del loading di C.
  await tick(t, 25000);
  assert.equal(latest.poiMunicipalityResults[2].status, 'timeout', 'C deve risultare in timeout dopo 25000ms');
  assert.equal(latest.h2hSummary.timedOutMunicipalities.length, 1);
  assert.equal(latest.h2hSummary.timedOutMunicipalities[0], 'ComuneC');
  // C non deve MAI essere stato contato come zero: i KPI restano quelli di A+B.
  assert.equal(latest.h2hSummary.poiCount, 100);
  assert.equal(latest.h2hSummary.completedCount, 2);
  assert.equal(latest.h2hSummary.totalCount, 3);

  t.mock.timers.reset();
});

// =================================================================
// 2. TEST BUSINESS PARZIALE
// =================================================================
test('Business: A(50 attivita)+B(70 attivita) completati, C timeout -> stima 120, mai presentata come totale completo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    ComuneA: { delayMs: 100, values: { target_activities_count: 50 } },
    ComuneB: { delayMs: 300, values: { target_activities_count: 70 } },
    ComuneC: { neverResolves: true },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'b2b', comuni: [comuneA, comuneB, comuneC] }));
  await tick(t, 0);
  await tick(t, 600);
  await tick(t, 300);

  assert.equal(latest.businessEstimate.targetActivitiesCount, 120, '50+70, mai contando C come zero');
  const expectedCopies = getBusinessDefaultCopies({});
  assert.equal(latest.businessEstimate.estimatedMaterials, 120 * expectedCopies);
  assert.equal(latest.businessEstimate.completedCount, 2);
  assert.equal(latest.businessEstimate.totalCount, 3);
  assert.equal(latest.businessEstimate.allMatched, false, 'NON deve risultare come totale completo dei 3 comuni');

  // Frase richiesta dal ticket ("Stima basata su 2 dei 3 comuni selezionati.")
  // e' composta nella UI da completedCount/totalCount — verifichiamo qui i
  // due numeri che la alimentano, gia' controllati sopra.
  assert.equal(latest.businessEstimate.completedCount < latest.businessEstimate.totalCount, true);

  t.mock.timers.reset();
});

// =================================================================
// 3. TEST H2H PARZIALE (valori del ticket)
// =================================================================
test('H2H parziale: aggregazione esatta A+B, C timeout, nessuna quantita automatica', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    ComuneA: { delayMs: 50, values: { poi_count: 40, transit_points: 10, schools_events_count: 20, hotspot_count: 3 } },
    ComuneB: { delayMs: 50, values: { poi_count: 60, transit_points: 15, schools_events_count: 30, hotspot_count: 4 } },
    ComuneC: { neverResolves: true },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'h2h', comuni: [comuneA, comuneB, comuneC] }));
  await tick(t, 0);
  await tick(t, 600);

  assert.equal(latest.h2hSummary.poiCount, 100);
  assert.equal(latest.h2hSummary.transitPoints, 25);
  assert.equal(latest.h2hSummary.schoolsEventsCount, 50);
  assert.equal(latest.h2hSummary.hotspotCount, 7);
  assert.equal(latest.h2hSummary.automaticQuantity, false);
  assert.equal(latest.recommendedQty, null, 'H2H non produce mai una quantita automatica (recommendedQty resta null nella pagina reale)');

  t.mock.timers.reset();
});

// =================================================================
// 4. TEST RISPOSTA TARDIVA (dopo il timeout)
// =================================================================
test('Risposta tardiva dopo il timeout viene ignorata: stato resta timeout, KPI invariati', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    ComuneA: { delayMs: 50, values: { poi_count: 40, transit_points: 10, schools_events_count: 20, hotspot_count: 3 } },
    // C risponde con successo, ma a 26000ms: DOPO il timeout client-side (25000ms).
    ComuneC: { delayMs: 26000, values: { poi_count: 500, transit_points: 500, schools_events_count: 500, hotspot_count: 500 } },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'h2h', comuni: [comuneA, comuneC] }));
  await tick(t, 0);
  await tick(t, 600);
  assert.equal(latest.poiMunicipalityResults[0].status, 'matched');
  assert.equal(latest.poiMunicipalityResults[1].status, 'pending');

  // Supera i 25000ms: C va in timeout.
  await tick(t, 25000);
  assert.equal(latest.poiMunicipalityResults[1].status, 'timeout');
  const kpiAtTimeout = { ...latest.h2hSummary };

  // Ora arriva la risposta tardiva di C (a 26000ms totali, gia' passata).
  await tick(t, 1000);
  assert.equal(latest.poiMunicipalityResults[1].status, 'timeout', 'lo stato deve restare "timeout", mai tornare a "matched"');
  assert.equal(latest.h2hSummary.poiCount, kpiAtTimeout.poiCount, 'i KPI non devono cambiare dopo una risposta tardiva');
  assert.equal(latest.h2hSummary.poiCount, 40, 'deve restare il solo valore di A, mai i 500 di C arrivati in ritardo');
  assert.equal(latest.h2hSummary.completedCount, 1);

  t.mock.timers.reset();
});

// =================================================================
// 5. TEST RIMOZIONE DURANTE FETCH
// =================================================================
test('Rimuovere un comune durante il fetch: la risposta successiva viene ignorata, nessun ricalcolo spurio', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    ComuneA: { delayMs: 50, values: { poi_count: 40, transit_points: 10, schools_events_count: 20, hotspot_count: 3 } },
    ComuneB: { delayMs: 50, values: { poi_count: 60, transit_points: 15, schools_events_count: 30, hotspot_count: 4 } },
    ComuneC: { delayMs: 500, values: { poi_count: 999, transit_points: 999, schools_events_count: 999, hotspot_count: 999 } },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'h2h', comuni: [comuneA, comuneB, comuneC] }));
  await tick(t, 0);
  await tick(t, 200); // A e B risolti, C ancora in volo (delay 500ms + debounce)

  // Rimuovo C (l'utente toglie il comune) prima che la sua fetch risolva.
  root.render(React.createElement(Harness, { service: 'h2h', comuni: [comuneA, comuneB] }));
  await tick(t, 0);
  assert.equal(latest.poiMunicipalityResults.length, 2, 'C non deve piu comparire nei risultati');
  assert.equal(latest.h2hSummary.totalCount, 2);

  // Lascio "completare" la vecchia fetch di C (se ancora pendente in background).
  await tick(t, 600);
  assert.equal(latest.poiMunicipalityResults.length, 2, 'C deve restare assente anche dopo che la sua fetch si e risolta');
  assert.equal(latest.h2hSummary.totalCount, 2, 'nessun ricalcolo spurio che reintroduca C');
  assert.equal(latest.h2hSummary.poiCount, 100, 'somma invariata: solo A+B');

  t.mock.timers.reset();
});

// =================================================================
// 6. TEST CAMBIO SERVIZIO (eseguito realmente, non dedotto)
// =================================================================
test('Cambio H2H -> Business prima che H2H risponda: nessun KPI H2H filtra nel Business', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    // Sotto H2H, ComuneA restituisce KPI di passaggio; sotto Business (stessa
    // chiamata, stesso comune, ma service diverso -> nuova request key)
    // restituisce attivita' target. Il mock non distingue per service nella
    // URL (l'edge function reale sì, tramite &service=), ma qui basta che la
    // fetch H2H NON sia ancora risolta quando si passa a Business.
    ComuneA: { delayMs: 5000, values: { poi_count: 40, transit_points: 10, schools_events_count: 20, hotspot_count: 3, target_activities_count: 999 } },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'h2h', comuni: [comuneA] }));
  await tick(t, 0);
  await tick(t, 200); // debounce scattato, fetch H2H per A in volo (5000ms), non ancora risolta

  assert.equal(latest.poiMunicipalityResults[0].status, 'pending');

  // Cambio servizio PRIMA che la fetch H2H risponda.
  root.render(React.createElement(Harness, { service: 'b2b', comuni: [comuneA] }));
  await tick(t, 0);
  assert.equal(latest.businessEstimate.completedCount, 0, 'Business deve partire pulito, nessun dato H2H residuo');
  assert.equal(latest.businessEstimate.targetActivitiesCount, null, 'nessun 999 (target_activities_count) filtrato dalla risposta H2H ancora in volo');
  assert.equal(latest.recommendedQty, null, 'nessuna quantita/prezzo stale finche B2B non ha un proprio dato');

  // Lascio risolvere la vecchia fetch H2H in background.
  await tick(t, 5200);
  assert.equal(latest.h2hSummary, null, 'siamo su Business: nessun oggetto h2hSummary deve essere popolato');
  // Il valore 999 (target_activities_count) non deve MAI comparire nel
  // businessEstimate: la vecchia richiesta H2H, anche se risolve tardi, non
  // deve alimentare lo stato di un servizio diverso da quello per cui e'
  // stata fatta.
  assert.notEqual(latest.businessEstimate?.targetActivitiesCount, 999);

  t.mock.timers.reset();
});

// =================================================================
// 7. TEST "USA X COPIE" — scelta esplicita non sovrascritta silenziosamente
// =================================================================
test('Business "Usa X copie": la scelta esplicita non cambia automaticamente quando arriva un nuovo comune', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const container = installFakeDom();
  globalThis.fetch = makeFetchMock({
    ComuneA: { delayMs: 50, values: { target_activities_count: 50 } },
    ComuneB: { delayMs: 5000, values: { target_activities_count: 70 } },
  });

  const root = createRoot(container);
  root.render(React.createElement(Harness, { service: 'b2b', comuni: [comuneA, comuneB] }));
  await tick(t, 0);
  await tick(t, 600); // debounce (450ms) + fetch A (50ms): solo A risolto, B ancora in volo (5000ms)

  assert.equal(latest.businessEstimate.targetActivitiesCount, 50);
  assert.equal(latest.businessEstimate.estimatedMaterials, 50 * getBusinessDefaultCopies({}));

  // Il cliente clicca "Usa 50 copie" — un setState invocato fuori da un
  // evento DOM reale deve passare per act() per riflettersi in modo
  // affidabile nel render successivo.
  act(() => { latest.acceptCurrentEstimate(); });
  await tick(t, 0);
  assert.equal(latest.acceptedBusinessEstimate, 50, 'la stima accettata deve essere quella corrente (50)');
  assert.equal(latest.recommendedQty, 50, 'recommendedQty (= effectiveQuantity/prezzo nella pagina reale) deve restare 50');

  // B completa DOPO l'accettazione, con un nuovo totale (120).
  await tick(t, 5200);
  assert.equal(latest.businessEstimate.targetActivitiesCount, 120, 'la stima live si aggiorna (50+70)');
  assert.equal(latest.businessEstimate.estimatedMaterials, 120 * getBusinessDefaultCopies({}), 'la NUOVA stima e disponibile...');
  assert.equal(latest.recommendedQty, 50, '...ma la quantita EFFETTIVA (gia accettata) NON deve cambiare da sola');
  assert.notEqual(latest.recommendedQty, latest.businessEstimate.estimatedMaterials, 'conferma che la UI dovrebbe proporre, non applicare, il nuovo valore');

  t.mock.timers.reset();
});

// =================================================================
// 8. REGRESSION D2D
// =================================================================
test('D2D: computeTerritorialCampaign invariato, indipendente da stati H2H/B2B', () => {
  const rows = [
    { municipality: 'Varedo', households: 6176, population: 13914, matched: true },
    { municipality: 'Cormano', households: 9297, population: 20744, matched: true },
  ];
  const result = computeTerritorialCampaign({ municipalityRows: rows, requestedQuantity: null, service: 'd2d' });
  assert.equal(result.supported, true);
  assert.equal(result.allMatched, true);
  // Stessa formula reale gia' verificata su dati produzione in ticket precedenti
  // (getZoneFullCoverageFlyers: families passa diretta, nessun moltiplicatore).
  assert.equal(result.recommendedQuantity, 6176 + 9297);
  assert.equal(result.status, 'auto');
  assert.equal(result.breakdown.length, 2);
  assert.equal(result.breakdown[0].recommendedQuantity, 6176);
  assert.equal(result.breakdown[1].recommendedQuantity, 9297);

  // Determinismo/purezza: chiamate ripetute con lo stesso input restituiscono
  // esattamente lo stesso risultato (nessuno stato nascosto/condiviso con
  // H2H/B2B, la funzione non ha nemmeno un parametro per quegli stati).
  const result2 = computeTerritorialCampaign({ municipalityRows: rows, requestedQuantity: null, service: 'd2d' });
  assert.deepEqual(result, result2);

  // Non-D2D deve restare esattamente come prima: nessuna quantita automatica.
  const nonD2d = computeTerritorialCampaign({ municipalityRows: rows, requestedQuantity: null, service: 'h2h' });
  assert.equal(nonD2d.supported, false);
  assert.equal(nonD2d.reason, 'SERVICE_NOT_SUPPORTED');
});
