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

test('TEST B: primario 429 -> fallback automatico a private.coffee (200); kumi non toccato', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 429 }],
    ['overpass.private.coffee', { status: 200, elements: [schoolElement(3, 'Scuola Fallback')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].tags.name, 'Scuola Fallback');
  assert.equal(mock.calls.length, 2);
  assert.match(mock.calls[0], /overpass-api\.de/);
  assert.match(mock.calls[1], /overpass\.private\.coffee/);
});

test('TEST B bis: primario 504 + 2° 504 -> 3° kumi.systems 200 (ultimo della catena)', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 504 }],
    ['overpass.private.coffee', { status: 504 }],
    ['overpass.kumi.systems', { status: 200, elements: [schoolElement(7, 'Scuola Kumi ultima')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements[0].tags.name, 'Scuola Kumi ultima');
  assert.equal(mock.calls.length, 3);
  assert.match(mock.calls[0], /overpass-api\.de/);
  assert.match(mock.calls[2], /overpass\.kumi\.systems/);
});

test('TEST C: tutti i provider in errore -> propaga un errore (error-state)', async () => {
  const plan = new Map([
    ['overpass-api.de', { status: 504 }],
    ['overpass.private.coffee', { status: 502 }],
    ['overpass.kumi.systems', { status: 500 }],
  ]);
  const mock = trackedFetchMock(plan);
  await assert.rejects(() => runPoiProxy(INPUT, mock), /UNAVAILABLE|OVERPASS_HTTP/);
  assert.equal(mock.calls.length, 3, 'tentati tutti e 3 i provider prima di arrendersi');
});

test('TEST C bis: reject di rete sul primario -> comunque fallback al successivo', async () => {
  const plan = new Map([
    ['overpass-api.de', { rejects: true, rejectMessage: 'NETWORK_DOWN' }],
    ['overpass.private.coffee', { status: 200, elements: [schoolElement(4, 'Scuola Dopo Rete Giu')] }],
  ]);
  const mock = trackedFetchMock(plan);
  const elements = await runPoiProxy(INPUT, mock);
  assert.equal(elements.length, 1);
  assert.equal(mock.calls.length, 2);
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
