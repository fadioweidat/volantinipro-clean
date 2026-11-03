// poi-search — distribuzione del budget tra i provider (2026-11-03).
// Log Vercel del 3 novembre: overpass.openstreetmap.fr interrotto a 8.5s,
// overpass-api.de "at capacity", lz4 appeso fino alla deadline: 16s e zero POI.
// Verifiche, senza rete reale:
//  1. il primo provider ha un timeout dedicato (PRIMARY) entro lo stesso
//     budget totale: una risposta lenta ma valida arriva al cliente;
//  2. un mirror di overpass-api.de saturo (429/5xx/timeout) fa saltare gli
//     altri mirror dello stesso gruppo nella stessa passata;
//  3. 403, 429, 504, timeout e "zero risultati reali" restano distinti;
//  4. road-network (nessuna opzione nuova) si comporta come prima.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPoiSearchHandler } from '../api/poi-search.ts';
import { fetchRoadsWithFallback } from '../supabase/functions/_shared/roadNetworkProxy.ts';
import { POI_OVERPASS_ENDPOINTS, poiProviderGroup } from '../supabase/functions/_shared/poiSearchProxy.ts';

const HOSTS = POI_OVERPASS_ENDPOINTS.map((u) => new URL(u).host);
const [FR, DE, LZ4, Z, MAILRU] = HOSTS;
const el = (id) => ({ type: 'node', id, lat: 45.53, lon: 9.17, tags: { shop: 'supermarket', name: `S${id}` } });
const OROBONI = { centerLat: 45.5287, centerLng: 9.1709, radiusKm: 2, serviceType: 'd2d', targetSelection: [] };

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = String(v); return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.end = (body) => { res.body = body; return res; };
  res.json = () => JSON.parse(res.body);
  return res;
}
async function call(handler, body) {
  const res = makeRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, body }, res);
  return res.json();
}

// plan: host -> { status?, elements?, delayMs?, hang? }
function providers(plan) {
  const calls = [];
  const fn = (url, init) => {
    const host = new URL(String(url)).host;
    calls.push(host);
    const cfg = plan[host] || { status: 504 };
    return new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      init?.signal?.addEventListener('abort', abort);
      if (cfg.hang) return;
      setTimeout(() => {
        const status = cfg.status ?? 200;
        resolve({ ok: status < 400, status, json: async () => ({ elements: cfg.elements || [] }), text: async () => cfg.text || '' });
      }, cfg.delayMs || 0);
    });
  };
  fn.calls = calls;
  return fn;
}
const handlerWith = (fetchImpl, env = {}) => createPoiSearchHandler({
  fetchImpl,
  env: { POI_SEARCH_RETRY_BACKOFF_MS: '0', ...env },
  log: () => {},
});

test('gruppi provider: lz4/z/overpass-api.de nello stesso gruppo, fr e mail.ru separati', () => {
  assert.equal(poiProviderGroup(POI_OVERPASS_ENDPOINTS[1]), 'overpass-api.de');
  assert.equal(poiProviderGroup(POI_OVERPASS_ENDPOINTS[2]), 'overpass-api.de');
  assert.equal(poiProviderGroup(POI_OVERPASS_ENDPOINTS[3]), 'overpass-api.de');
  assert.equal(poiProviderGroup(POI_OVERPASS_ENDPOINTS[0]), 'overpass.openstreetmap.fr');
  assert.equal(poiProviderGroup(POI_OVERPASS_ENDPOINTS[4]), 'maps.mail.ru');
});

test('primo provider lento ma valido: arriva oltre il timeout generico, entro quello dedicato', async () => {
  const fetchImpl = providers({ [FR]: { delayMs: 1400, elements: [el(1), el(2)] } });
  const body = await call(handlerWith(fetchImpl, {
    POI_SEARCH_TIMEOUT_MS: '1000', POI_SEARCH_PRIMARY_TIMEOUT_MS: '2500', POI_SEARCH_TOTAL_BUDGET_MS: '3000',
  }), OROBONI);
  assert.equal(body.source, 'live');
  assert.deepEqual(body.elements.map((e) => e.id), [1, 2]);
  assert.deepEqual(fetchImpl.calls, [FR], 'nessun altro provider contattato');
});

test('stesso caso con il solo timeout generico (comportamento precedente): fr interrotto, nessun POI', async () => {
  const fetchImpl = providers({ [FR]: { delayMs: 1400, elements: [el(1)] } });
  const body = await call(handlerWith(fetchImpl, {
    POI_SEARCH_TIMEOUT_MS: '1000', POI_SEARCH_PRIMARY_TIMEOUT_MS: '1000', POI_SEARCH_TOTAL_BUDGET_MS: '3000',
  }), OROBONI);
  assert.equal(body.temporaryUnavailable, true);
  assert.deepEqual(body.elements, []);
});

test('scenario log 3 novembre: fr appeso, overpass-api.de saturo -> lz4 e z saltati, mail.ru provato', async () => {
  const fetchImpl = providers({
    [FR]: { hang: true },
    [DE]: { status: 502, text: 'This Overpass API server is currently at capacity' },
    [LZ4]: { hang: true },
    [Z]: { hang: true },
    [MAILRU]: { elements: [el(3)] },
  });
  const body = await call(handlerWith(fetchImpl, {
    POI_SEARCH_TIMEOUT_MS: '1000', POI_SEARCH_PRIMARY_TIMEOUT_MS: '1500', POI_SEARCH_TOTAL_BUDGET_MS: '3000',
  }), OROBONI);
  assert.equal(body.source, 'live');
  assert.deepEqual(body.elements.map((e) => e.id), [3]);
  assert.deepEqual(fetchImpl.calls, [FR, DE, MAILRU], 'lz4 e z non vengono attesi');
});

test('403 dal primo provider: passa al successivo senza saltare il suo gruppo', async () => {
  const fetchImpl = providers({ [FR]: { status: 403, text: 'only available to white-listed usages' }, [DE]: { elements: [el(4)] } });
  const body = await call(handlerWith(fetchImpl), OROBONI);
  assert.equal(body.source, 'live');
  assert.deepEqual(fetchImpl.calls, [FR, DE]);
});

test('429 su overpass-api.de: i mirror dello stesso servizio non vengono martellati', async () => {
  const fetchImpl = providers({ [FR]: { status: 504 }, [DE]: { status: 429 }, [MAILRU]: { elements: [el(5)] } });
  const body = await call(handlerWith(fetchImpl), OROBONI);
  assert.deepEqual(body.elements.map((e) => e.id), [5]);
  assert.deepEqual(fetchImpl.calls, [FR, DE, MAILRU]);
});

test('tutti 504: indisponibile dichiarato (temporaryUnavailable), mai zero confermato', async () => {
  const fetchImpl = providers(Object.fromEntries(HOSTS.map((h) => [h, { status: 504 }])));
  const body = await call(handlerWith(fetchImpl), OROBONI);
  assert.equal(body.temporaryUnavailable, true);
  assert.equal(body.source, 'none');
  assert.deepEqual(body.elements, []);
  assert.equal('fetchedAt' in body, false, 'nessuna data: non esiste un dato');
});

test('timeout totale: entro il budget, risposta indisponibile', async () => {
  const fetchImpl = providers(Object.fromEntries(HOSTS.map((h) => [h, { hang: true }])));
  const t0 = Date.now();
  const body = await call(handlerWith(fetchImpl, {
    POI_SEARCH_TIMEOUT_MS: '1000', POI_SEARCH_PRIMARY_TIMEOUT_MS: '1200', POI_SEARCH_TOTAL_BUDGET_MS: '2000',
  }), OROBONI);
  assert.ok(Date.now() - t0 < 2600, `budget rispettato (${Date.now() - t0}ms)`);
  assert.equal(body.temporaryUnavailable, true);
  assert.equal(body.reason, 'upstream_timeout');
});

test('zero attivita\' reali dal provider: 200 live con elements [], non indisponibile', async () => {
  const fetchImpl = providers({ [FR]: { elements: [] } });
  const body = await call(handlerWith(fetchImpl), OROBONI);
  assert.equal(body.source, 'live');
  assert.deepEqual(body.elements, []);
  assert.equal(body.temporaryUnavailable, undefined);
});

test('road-network invariato: senza le nuove opzioni prova tutti i mirror anche se saturi', async () => {
  const fetchImpl = providers(Object.fromEntries(HOSTS.map((h) => [h, { status: 502 }])));
  const err = await fetchRoadsWithFallback({ fetchImpl, endpoints: POI_OVERPASS_ENDPOINTS, query: 'Q', timeoutMs: 500 }).then(() => null, (e) => e);
  assert.ok(err);
  assert.equal(err.attempts, HOSTS.length);
  assert.deepEqual(fetchImpl.calls, HOSTS);
});
