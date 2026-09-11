// TICKET — "MAKE STEP2 HAND-TO-HAND POI RESILIENT".
// Hand to Hand deve continuare a mostrare marker reali quando i mirror
// pubblici Overpass sono temporaneamente instabili, servendo l'ultimo
// risultato buono in cache invece di svuotare la mappa. Verifica:
//  1. La cache server (poi-search/index.ts) e' chiave per lat/lng+raggio+
//     servizio+target — H2H con target diversi non collide mai.
//  2. Il contratto di risposta espone `source` ("live"/"cache"/"none") e non
//     azzera mai `elements` se esiste uno stale valido (temporaryUnavailable
//     resta false in quel caso).
//  3. Il client (poiSearch.js) serve gli `elements` di un degrado con stale
//     anche per il servizio h2h (gia' provato generico in
//     poi_search_budget.test.mjs; qui si fissa esplicitamente h2h).
//  4. Step2PoiAssignmentPanel (pannello attivita' H2H) mostra il messaggio
//     "temporaneamente non disponibili" + Riprova SOLO quando la richiesta e'
//     davvero fallita (poiRequestFailed), non per uno zero risultati reale.
//  5. L'icona marker ha sempre un fallback generico: nessun POI viene perso
//     solo perche' la categoria non ha un'icona mappata.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { makePoiCacheKey, validatePoiInput } from '../supabase/functions/_shared/poiSearchProxy.ts';
import { Step2PoiAssignmentPanel } from '../src/pages/public/configurator/step2/Step2PoiAssignmentPanel.jsx';

const edge = readFileSync(new URL('../supabase/functions/poi-search/index.ts', import.meta.url), 'utf8');
const step2map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');

process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

// ── 1. Cache key granularity (lat/lng, radius, service, target) ───────────
test('makePoiCacheKey: H2H con target diversi (palestra/scuola/farmacia/supermercato) non collide mai', () => {
  const base = { centerLat: 45.529, centerLng: 9.17, radiusKm: 3, serviceType: 'h2h' };
  const targets = [['fitness'], ['scuole'], ['sanitario'], ['retail']];
  const keys = targets.map((targetSelection) => makePoiCacheKey(validatePoiInput({ ...base, targetSelection }).input));
  assert.equal(new Set(keys).size, keys.length, 'ogni categoria deve avere una chiave di cache distinta');
});

test('makePoiCacheKey: stesso target, servizio diverso (h2h vs d2d) non collide', () => {
  const input = { centerLat: 45.529, centerLng: 9.17, radiusKm: 3, targetSelection: ['fitness'] };
  const h2h = makePoiCacheKey(validatePoiInput({ ...input, serviceType: 'h2h' }).input);
  const d2d = makePoiCacheKey(validatePoiInput({ ...input, serviceType: 'd2d' }).input);
  assert.notEqual(h2h, d2d);
});

test('makePoiCacheKey: stesso punto/raggio/servizio, target diverso -> chiave diversa (niente marker stantii al cambio attivita)', () => {
  const base = { centerLat: 45.529, centerLng: 9.17, radiusKm: 3, serviceType: 'h2h' };
  const palestra = makePoiCacheKey(validatePoiInput({ ...base, targetSelection: ['fitness'] }).input);
  const scuola = makePoiCacheKey(validatePoiInput({ ...base, targetSelection: ['scuole'] }).input);
  assert.notEqual(palestra, scuola, 'cambiare attivita deve invalidare/bypassare la cache della categoria precedente');
});

// ── 2. Contratto server: source live/cache/none, mai [] se esiste stale ───
test('poi-search/index.ts: cache fresca e fetch live etichettano source, il degrado con stale non azzera elements', () => {
  assert.match(edge, /return json\(\{ elements: cached, cached: true, source: "cache" \}\);/);
  assert.match(edge, /return json\(\{ elements: result\.elements, cached: false, source: "live" \}\);/);
  assert.match(edge, /source: elements\.length > 0 \? "cache" : "none",/);
  // §5 ticket: mai [] se un buon risultato in cache esiste — il ramo di
  // degrado finale e quello di cache negativa servono SEMPRE `stale ?? []`,
  // mai un array vuoto forzato quando `stale` e' popolato.
  assert.match(edge, /const stale = poiStaleCache\.get\(cacheKey\);/);
  assert.match(edge, /return degradedResponse\(reason, stale \?\? \[\]\);/);
  assert.match(edge, /return degradedResponse\(negative\.reason, staleForNeg \?\? \[\]\);/);
  // temporaryUnavailable e' false quando ci sono elements (cioe' quando la
  // cache stale ha servito dati reali) — MAI vero con elements popolati.
  assert.match(edge, /temporaryUnavailable: elements\.length === 0,/);
  assert.match(edge, /stale: elements\.length > 0,/);
});

test('poi-search/index.ts: cache stale sopravvive molto piu a lungo del fresco (TTL) per assorbire instabilita dei mirror', () => {
  assert.match(edge, /const CACHE_TTL_MS = envInt\("POI_SEARCH_CACHE_TTL_MS", 3600000/);
  assert.match(edge, /const STALE_TTL_MS = envInt\("POI_SEARCH_STALE_TTL_MS", 86400000/);
  const cacheDefault = Number(edge.match(/POI_SEARCH_CACHE_TTL_MS", (\d+)/)[1]);
  const staleDefault = Number(edge.match(/POI_SEARCH_STALE_TTL_MS", (\d+)/)[1]);
  assert.ok(staleDefault > cacheDefault, 'la cache stale deve durare piu della fresca, altrimenti degrada troppo presto');
});

// ── 3. Client: stale servito esplicitamente per h2h ────────────────────────
function installFetch(handler) {
  globalThis.fetch = async (url, init) => handler(String(url), init);
}
const { fetchPoiSearchElements } = await import('../src/api/poiSearch.js');

test('client H2H: 200 degradato con stale (source=cache) -> gli elements vengono servuti, non un array vuoto', async () => {
  const gym = { type: 'node', id: 42, lat: 45.529, lon: 9.17, tags: { leisure: 'fitness_centre', name: 'McFIT Oroboni' } };
  installFetch(async () => ({ ok: true, status: 200, json: async () => ({ elements: [gym], degraded: true, stale: true, temporaryUnavailable: false, source: 'cache', reason: 'upstream_unavailable' }) }));
  const out = await fetchPoiSearchElements({ centerLat: 45.529, centerLng: 9.17, radiusKm: 3, serviceType: 'h2h', targetSelection: ['fitness'] });
  assert.deepEqual(out, [gym]);
});

test('client H2H: 200 { temporaryUnavailable: true, elements: [] } (nessuna cache disponibile) -> fallimento, non falso zero', async () => {
  installFetch(async () => ({ ok: true, status: 200, json: async () => ({ elements: [], degraded: true, temporaryUnavailable: true, source: 'none', reason: 'upstream_unavailable' }) }));
  await assert.rejects(
    () => fetchPoiSearchElements({ centerLat: 45.529, centerLng: 9.17, radiusKm: 3, serviceType: 'h2h', targetSelection: ['fitness'] }),
    /POI_SEARCH_UNAVAILABLE/,
  );
});

// ── 4. Pannello attivita' H2H: banner distinto SOLO su fallimento reale ────
const baseProps = {
  assignPoiToOperator: () => {},
  businessMaterialPlan: null,
  businessOperationalPlan: null,
  businessPoiCategoryCounts: {},
  businessPoiFilter: 'all',
  changeOperatorCountInStep2: () => {},
  city: 'Milano',
  clearPoiAssignments: () => {},
  distributionTargetSelection: ['fitness'],
  focusPoiRow: () => {},
  focusedPoiId: null,
  h2hPoiCategoryCounts: {},
  h2hPoiFilter: 'all',
  isBusinessStep2: false,
  isMobile: false,
  isMovementStep2: true,
  operatorCountForPoiAssignment: 1,
  operatorSchedules: [{ id: 'a', timeSlot: 'morning', serviceDurationHours: 4 }],
  poiAssignments: {},
  poiComuneResolver: () => 'Milano',
  poiListSearch: '',
  pois: [],
  rebalanceSelectedPois: () => {},
  selectAndBalanceAllPois: () => {},
  selectedOperationalPois: [],
  setBusinessPoiFilter: () => {},
  setH2hPoiFilter: () => {},
  setPoiListSearch: () => {},
  togglePoiAssignment: () => {},
  updateOperatorScheduleInStep2: () => {},
  updatePoiCopies: () => {},
  visiblePoisForAssignment: [],
};

test('H2H: nessun risultato per richiesta FALLITA -> banner "temporaneamente non disponibili" + Riprova', () => {
  const retry = () => {};
  const html = renderToStaticMarkup(React.createElement(Step2PoiAssignmentPanel, { ...baseProps, poiRequestFailed: true, retryPoi: retry }));
  assert.match(html, /temporaneamente non disponibili/);
  assert.match(html, />Riprova</);
  assert.doesNotMatch(html, /Nessun luogo compatibile trovato/, 'non deve mostrare il messaggio "zero risultati" quando e la richiesta che e fallita');
});

test('H2H: zero risultati REALI (richiesta riuscita, area senza match) -> messaggio "nessun luogo", NIENTE banner di errore', () => {
  const html = renderToStaticMarkup(React.createElement(Step2PoiAssignmentPanel, { ...baseProps, poiRequestFailed: false, retryPoi: () => {} }));
  assert.match(html, /Nessun luogo compatibile trovato/);
  assert.doesNotMatch(html, /temporaneamente non disponibili/);
});

test('H2H: con marker validi (richiesta riuscita) non mostra ne il banner di errore ne quello di "zero risultati"', () => {
  const gym = { id: 'g1', name: 'McFIT', category: 'Palestra', address: 'Via Oroboni 10', priority: 8 };
  const html = renderToStaticMarkup(React.createElement(Step2PoiAssignmentPanel, {
    ...baseProps, poiRequestFailed: false, retryPoi: () => {}, pois: [gym], visiblePoisForAssignment: [gym],
  }));
  assert.doesNotMatch(html, /temporaneamente non disponibili/);
  assert.doesNotMatch(html, /Nessun luogo compatibile trovato/);
  assert.match(html, /McFIT/);
});

// ── 5. Icona marker: fallback generico, nessun POI perso per categoria ignota ─
test('Step2Map.jsx: poiCategorySymbol ha sempre un fallback generico (nessun POI scartato per icona mancante)', () => {
  const idx = step2map.indexOf('function poiCategorySymbol(category)');
  assert.ok(idx > 0, 'poiCategorySymbol deve esistere');
  const block = step2map.slice(idx, idx + 2000).replace(/\r\n/g, '\n');
  const closingIdx = block.indexOf('\n}');
  const body = block.slice(0, closingIdx);
  assert.match(body, /return '📍';\s*$/, 'ultima istruzione deve essere un fallback incondizionato');
  // il fallback deve essere l'ULTIMA riga (nessun return successivo la ombreggia)
  const lastReturnIdx = body.lastIndexOf('return');
  assert.equal(body.slice(lastReturnIdx), "return '📍';", 'il fallback deve essere raggiungibile per qualunque categoria non mappata');
});
