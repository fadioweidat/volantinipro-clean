// Fallback multi-endpoint Overpass per la ricerca POI — ORA LATO SERVER.
//
// Prima del ticket "FIX DEFINITIVO POI OVERPASS VIA PROXY" questo file
// verificava il loop di fallback dentro src/lib/services/poi-api.js
// (browser -> Overpass diretto). Quel loop e' stato rimosso: il browser
// chiama SOLO /functions/v1/poi-search e il fallback multi-provider vive nel
// proxy (supabase/functions/poi-search + _shared/*).
//
// Qui si ricompone la stessa pipeline del guscio Deno (validate -> buildQuery
// -> fetchRoadsWithFallback) con un mock DIFFERENZIATO per endpoint, per
// dimostrare: primario ok / primario 504 -> fallback / tutti falliti -> errore
// / reject di rete sul primario -> fallback.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPoiQuery,
  getServiceTargetTags,
  resolvePoiEndpoints,
  resultCap,
  validatePoiInput,
} from '../supabase/functions/_shared/poiSearchProxy.ts';
import {
  fetchRoadsWithFallback,
} from '../supabase/functions/_shared/roadNetworkProxy.ts';

const schoolElement = (id, name) => ({ type: 'node', id, lat: 45.6, lon: 9.1, tags: { amenity: 'school', name } });

// Ricompone il cuore di poi-search/index.ts per l'input dato.
async function runPoiProxy(rawInput, fetchImpl, { envEndpoint = null, timeoutMs = 5000 } = {}) {
  const v = validatePoiInput(rawInput);
  if (!v.ok) throw new Error(`INVALID_INPUT:${v.error}`);
  const tags = getServiceTargetTags(v.input.serviceType, v.input.targetSelection);
  const query = buildPoiQuery({
    centerLat: v.input.centerLat,
    centerLng: v.input.centerLng,
    radiusKm: v.input.radiusKm,
    tags,
    cap: resultCap(v.input.serviceType),
  });
  const res = await fetchRoadsWithFallback({
    fetchImpl,
    endpoints: resolvePoiEndpoints(envEndpoint),
    query,
    timeoutMs,
  });
  return res.elements;
}

// plan: Map<urlSubstring, { status?, elements?, rejects? }>
function trackedFetchMock(plan) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const key = [...plan.keys()].find((k) => String(url).includes(k));
    const cfg = key ? plan.get(key) : null;
    if (!cfg) throw new Error(`UNEXPECTED_URL:${url}`);
    if (cfg.rejects) throw new Error(cfg.rejectMessage || 'NETWORK_ERROR');
    return {
      ok: (cfg.status ?? 200) < 400,
      status: cfg.status ?? 200,
      json: async () => ({ elements: cfg.elements || [] }),
    };
  };
  fn.calls = calls;
  return fn;
}

const INPUT = { centerLat: 45.6, centerLng: 9.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] };

test('TEST A: primario overpass-api.de 200 -> risultati, nessun fallback contattato', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 200, elements: [schoolElement(1, 'Scuola De')] }],
    ['overpass.private.coffee', { status: 200, elements: [schoolElement(2, 'Scuola Coffee')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].tags.name, 'Scuola De');
  assert.equal(mock.calls.length, 1);
  assert.match(mock.calls[0], /overpass-api\.de/);
});

test('TEST B: primario 429 -> fallback lungo la catena fino a un provider valido', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 429 }],
    ['lz4.overpass-api.de', { status: 502 }],
    ['z.overpass-api.de', { status: 502 }],
    ['overpass.kumi.systems', { status: 504 }],
    ['overpass.private.coffee', { status: 200, elements: [schoolElement(3, 'Scuola Fallback')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].tags.name, 'Scuola Fallback');
  assert.equal(mock.calls.length, 5);
  assert.match(mock.calls[0], /overpass-api\.de/);
  assert.match(mock.calls[mock.calls.length - 1], /overpass\.private\.coffee/);
});

test('TEST B bis: catena di 504 -> 4° provider kumi.systems 200', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 504 }],
    ['lz4.overpass-api.de', { status: 504 }],
    ['z.overpass-api.de', { status: 504 }],
    ['overpass.kumi.systems', { status: 200, elements: [schoolElement(7, 'Scuola Kumi ultima')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements[0].tags.name, 'Scuola Kumi ultima');
  assert.equal(mock.calls.length, 4);
  assert.match(mock.calls[0], /overpass-api\.de/);
  assert.match(mock.calls[3], /overpass\.kumi\.systems/);
});

test('TEST C: tutti i provider in errore -> propaga un errore (error-state)', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 504 }],
    ['lz4.overpass-api.de', { status: 502 }],
    ['z.overpass-api.de', { status: 502 }],
    ['overpass.kumi.systems', { status: 502 }],
    ['overpass.private.coffee', { status: 500 }],
  ]);
  const mock = trackedFetchMock(plan);
  await assert.rejects(() => runPoiProxy(INPUT, mock), /UNAVAILABLE|OVERPASS_HTTP/);
  assert.equal(mock.calls.length, 5, 'tentati tutti i provider prima di arrendersi');
});

test('TEST C bis: reject di rete sul primario -> comunque fallback lungo la catena', async () => {
  const plan = new Map([
    ['overpass-api.de', { rejects: true, rejectMessage: 'NETWORK_DOWN' }],
    ['lz4.overpass-api.de', { status: 502 }],
    ['z.overpass-api.de', { status: 502 }],
    ['overpass.kumi.systems', { status: 504 }],
    ['overpass.private.coffee', { status: 200, elements: [schoolElement(4, 'Scuola Dopo Rete Giu')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements.length, 1);
  assert.equal(mock.calls.length, 5);
});

test('TEST D: OVERPASS_ENDPOINT override -> provato per primo, prima di overpass-api.de', async () => {
  const plan = new Map([
    ['my-overpass.internal', { status: 200, elements: [schoolElement(5, 'Scuola Override')] }],
    ['overpass-api.de', { status: 200, elements: [schoolElement(6, 'Scuola De')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock, { envEndpoint: 'https://my-overpass.internal/api/interpreter' });
  assert.equal(elements[0].tags.name, 'Scuola Override');
  assert.equal(mock.calls.length, 1);
});

// ── Fix "Overpass fallback chain" (audit Milano / Via Oroboni, 2026-09):
// un singolo 4xx non-retriabile da UN mirror non deve piu' abortire l'intera
// catena — solo se TUTTI i provider tentati rifiutano con un 4xx la richiesta
// va classificata come bad_request permanente. Scenari A-D del ticket.

// NOTA substring-matching: 'overpass-api.de' e' un suffisso letterale anche
// di 'lz4.overpass-api.de' e 'z.overpass-api.de', quindi nella Map le chiavi
// piu' specifiche vanno elencate PRIMA della chiave generica, altrimenti
// trackedFetchMock (find = primo match) applica per errore la config del
// provider 1 anche ai provider successivi.
test('FIX-A: provider1 429, provider2 400, provider3 200 -> SUCCESS, provider3 raggiunto', async () => {
  const plan = new Map([
    ['lz4.overpass-api.de', { status: 400 }],
    ['z.overpass-api.de', { status: 200, elements: [schoolElement(10, 'Scuola Terzo Provider')] }],
    ['overpass-api.de', { status: 429 }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements[0].tags.name, 'Scuola Terzo Provider');
  assert.equal(mock.calls.length, 3, 'provider3 deve essere raggiunto nonostante il 400 sul provider2');
});

test('FIX-B: provider1 400, provider2 403, provider3 200 -> SUCCESS', async () => {
  const plan = new Map([
    ['lz4.overpass-api.de', { status: 403 }],
    ['z.overpass-api.de', { status: 200, elements: [schoolElement(11, 'Scuola Dopo Due 4xx')] }],
    ['overpass-api.de', { status: 400 }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements[0].tags.name, 'Scuola Dopo Due 4xx');
  assert.equal(mock.calls.length, 3);
});

test('FIX-C: tutti i provider 400/4xx -> classificazione finale bad_request (fatal)', async () => {
  const plan = new Map([
    ['lz4.overpass-api.de', { status: 403 }],
    ['z.overpass-api.de', { status: 422 }],
    ['overpass.kumi.systems', { status: 400 }],
    ['overpass.private.coffee', { status: 400 }],
    ['overpass-api.de', { status: 400 }],
  ]);
  const mock = trackedFetchMock(plan);
  await assert.rejects(
    () => runPoiProxy(INPUT, mock),
    (err) => {
      assert.match(err.message, /OVERPASS_HTTP_4\d\d/);
      assert.equal(err.fatal, true);
      return true;
    },
  );
  assert.equal(mock.calls.length, 5, 'tutti i provider tentati prima della classificazione fatale');
});

test('FIX-D: mix 400 + timeout(rejects) + 5xx -> NON classificato come bad_request permanente', async () => {
  const plan = new Map([
    ['lz4.overpass-api.de', { rejects: true, rejectMessage: 'TIMEOUT_LIKE' }],
    ['z.overpass-api.de', { status: 502 }],
    ['overpass.kumi.systems', { status: 400 }],
    ['overpass.private.coffee', { status: 502 }],
    ['overpass-api.de', { status: 400 }],
  ]);
  const mock = trackedFetchMock(plan);
  await assert.rejects(
    () => runPoiProxy(INPUT, mock),
    (err) => {
      assert.equal(err.fatal, undefined, 'un mix con timeout/5xx non deve mai risultare fatal/bad_request');
      return true;
    },
  );
  assert.equal(mock.calls.length, 5);
});
