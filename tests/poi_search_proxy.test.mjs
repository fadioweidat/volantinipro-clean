// Verifica del nucleo del proxy server-side Overpass "ricerca POI"
// (supabase/functions/_shared/poiSearchProxy.ts): validazione input, QL
// server-controlled, fallback multi-provider con timeout, cache TTL,
// distinzione "empty result != error". Gemello di tests/road_network_proxy.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  POI_TAGS,
  POI_SERVICE_TYPES,
  POI_RESULT_CAP_D2D,
  POI_RESULT_CAP_DEFAULT,
  POI_OVERPASS_ENDPOINTS,
  POI_OVERPASS_QL_TIMEOUT_S,
  buildPoiQuery,
  getServiceTargetTags,
  makePoiCacheKey,
  resolvePoiEndpoints,
  resultCap,
  validatePoiInput,
} from '../supabase/functions/_shared/poiSearchProxy.ts';
import {
  createTtlCache,
  fetchRoadsWithFallback,
} from '../supabase/functions/_shared/roadNetworkProxy.ts';

// client POI_TAGS (colori/priorita') — per il cross-check anti-drift.
import { POI_TAGS as CLIENT_POI_TAGS } from '../src/lib/services/poi-api.js';

const VALID = { centerLat: 45.551, centerLng: 9.163, radiusKm: 3, serviceType: 'd2d', targetSelection: [] };

// ── validazione input ────────────────────────────────────────────────────
test('validatePoiInput accetta un input pulito e normalizza targetSelection', () => {
  const r = validatePoiInput({ ...VALID, targetSelection: ['scuole', 'fitness', '  bad target  ', 123] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.input.targetSelection, ['scuole', 'fitness']);
  assert.equal(r.input.serviceType, 'd2d');
});

test('validatePoiInput rifiuta coordinate/raggio/servizio fuori contratto', () => {
  assert.equal(validatePoiInput(null).ok, false);
  assert.equal(validatePoiInput({ ...VALID, centerLat: 999 }).ok, false);
  assert.equal(validatePoiInput({ ...VALID, centerLng: 'x' }).ok, false);
  assert.equal(validatePoiInput({ ...VALID, radiusKm: 0 }).ok, false);
  assert.equal(validatePoiInput({ ...VALID, radiusKm: 999 }).ok, false);
  assert.equal(validatePoiInput({ ...VALID, serviceType: 'ppc' }).ok, false);
  assert.equal(validatePoiInput({ ...VALID, targetSelection: 'scuole' }).ok, false);
  assert.equal(validatePoiInput({ ...VALID, targetSelection: Array(31).fill('a') }).ok, false);
});

test('validatePoiInput non lascia passare tentativi di iniezione nei target', () => {
  const r = validatePoiInput({ ...VALID, targetSelection: ['scuole', 'a"]{b', 'x);out', 'drop table'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.input.targetSelection, ['scuole'], 'solo chiavi [a-z_] passano');
});

// ── query builder server-side ────────────────────────────────────────────
test('buildPoiQuery: QL costruita SOLO da valori validati, nessun input testuale', () => {
  const tags = getServiceTargetTags('d2d', ['scuole']);
  const q = buildPoiQuery({ centerLat: 45.551, centerLng: 9.163, radiusKm: 3, tags, cap: resultCap('d2d') });
  assert.equal(POI_OVERPASS_QL_TIMEOUT_S, 12, 'QL timeout ridotto a 12s (audit 502)');
  assert.match(q, /^\[out:json\]\[timeout:12\];/);
  assert.match(q, /\(around:3000,45\.551,9\.163\)/);
  assert.match(q, /node\["amenity"="school"\]/);
  assert.match(q, /way\["amenity"="school"\]/);
  assert.match(q, /out center 80;$/);
  // solo i tag dell'allowlist server: nessun frammento estraneo iniettato
  assert.doesNotMatch(q, /drop\s+table|;\s*out\s*;|--|\/\*/i);
});

test('resultCap: d2d 80, h2h/b2b 150', () => {
  assert.equal(resultCap('d2d'), POI_RESULT_CAP_D2D);
  assert.equal(resultCap('h2h'), POI_RESULT_CAP_DEFAULT);
  assert.equal(resultCap('b2b'), POI_RESULT_CAP_DEFAULT);
});

test('getServiceTargetTags: nessun target -> intero set; target ignoto -> intero set; target noto -> filtrato', () => {
  assert.equal(getServiceTargetTags('d2d', []).length, POI_TAGS.d2d.length);
  assert.equal(getServiceTargetTags('d2d', ['all']).length, POI_TAGS.d2d.length);
  assert.equal(getServiceTargetTags('d2d', ['non_esiste']).length, POI_TAGS.d2d.length);
  const scuole = getServiceTargetTags('d2d', ['scuole']);
  assert.ok(scuole.length > 0 && scuole.length < POI_TAGS.d2d.length);
  assert.ok(scuole.every((t) => t.cat === 'Scuola'));
});

// ── anti-drift: le coppie key:val server === client, per ogni servizio ────
test('POI_TAGS server e client hanno lo stesso set di coppie key:val per ogni servizio', () => {
  for (const svc of POI_SERVICE_TYPES) {
    const s = new Set(POI_TAGS[svc].map((t) => `${t.key}:${t.val}`));
    const c = new Set((CLIENT_POI_TAGS[svc] || []).map((t) => `${t.key}:${t.val}`));
    assert.deepEqual([...s].sort(), [...c].sort(), `drift tag key:val per servizio ${svc}`);
  }
});

// ── ordine provider POI (override locale, road-network invariato) ────────
test('resolvePoiEndpoints: ordine overpass-api.de -> private.coffee -> kumi.systems', () => {
  const eps = resolvePoiEndpoints(null);
  assert.deepEqual(eps, POI_OVERPASS_ENDPOINTS);
  assert.match(eps[0], /overpass-api\.de/);
  assert.match(eps[1], /overpass\.private\.coffee/);
  assert.match(eps[2], /overpass\.kumi\.systems/);
});

test('resolvePoiEndpoints: OVERPASS_ENDPOINT env passa per primo, poi l\'ordine POI', () => {
  const eps = resolvePoiEndpoints('https://my-overpass.internal/api/interpreter');
  assert.match(eps[0], /my-overpass\.internal/);
  assert.match(eps[1], /overpass-api\.de/);
  assert.equal(eps.length, 4);
});

// ── fallback multi-provider (riuso fetchRoadsWithFallback con la QL POI) ──
const POI_QUERY = buildPoiQuery({ centerLat: 45.55, centerLng: 9.16, radiusKm: 3, tags: getServiceTargetTags('d2d', ['scuole']), cap: 80 });

function endpointMock(plan) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const key = Object.keys(plan).find((k) => String(url).includes(k));
    const cfg = key ? plan[key] : { status: 500 };
    if (cfg.throws) throw Object.assign(new Error(cfg.name || 'NET'), { name: cfg.name || 'Error' });
    return { ok: cfg.status ? cfg.status < 400 : true, status: cfg.status || 200, json: async () => ({ elements: cfg.elements || [] }) };
  };
  fn.calls = calls;
  return fn;
}

test('fallback: primario (overpass-api.de) 200 -> nessun altro provider contattato', async () => {
  const mock = endpointMock({
    'overpass-api.de': { status: 200, elements: [{ type: 'node', id: 1 }] },
    'overpass.private.coffee': { status: 200, elements: [{ type: 'node', id: 2 }] },
  });
  const res = await fetchRoadsWithFallback({
    fetchImpl: mock, endpoints: resolvePoiEndpoints(null), query: POI_QUERY, timeoutMs: 5000,
  });
  assert.deepEqual(res.elements, [{ type: 'node', id: 1 }]);
  assert.equal(res.endpointIndex, 0);
  assert.equal(mock.calls.length, 1);
  assert.match(mock.calls[0], /overpass-api\.de/);
});

test('fallback: primario 429 -> passa a private.coffee (2 chiamate), kumi non toccato', async () => {
  const mock = endpointMock({
    'overpass-api.de': { status: 429 },
    'overpass.private.coffee': { status: 200, elements: [{ type: 'node', id: 3 }] },
  });
  const res = await fetchRoadsWithFallback({
    fetchImpl: mock, endpoints: resolvePoiEndpoints(null), query: POI_QUERY, timeoutMs: 5000,
  });
  assert.deepEqual(res.elements, [{ type: 'node', id: 3 }]);
  assert.equal(mock.calls.length, 2);
  assert.match(mock.calls[0], /overpass-api\.de/);
  assert.match(mock.calls[1], /overpass\.private\.coffee/);
});

test('fallback: primario 504 -> anche 2° 504 -> 3° (kumi) 200', async () => {
  const mock = endpointMock({
    'overpass-api.de': { status: 504 },
    'overpass.private.coffee': { status: 504 },
    'overpass.kumi.systems': { status: 200, elements: [{ id: 7 }] },
  });
  const res = await fetchRoadsWithFallback({
    fetchImpl: mock, endpoints: resolvePoiEndpoints(null), query: POI_QUERY, timeoutMs: 5000,
  });
  assert.deepEqual(res.elements, [{ id: 7 }]);
  assert.equal(mock.calls.length, 3);
});

test('fallback: tutti e 3 i provider falliti -> lancia (nessun risultato finto)', async () => {
  const mock = endpointMock({
    'overpass-api.de': { status: 504 },
    'overpass.private.coffee': { status: 502 },
    'overpass.kumi.systems': { throws: true, name: 'TypeError' },
  });
  await assert.rejects(
    () => fetchRoadsWithFallback({ fetchImpl: mock, endpoints: resolvePoiEndpoints(null), query: POI_QUERY, timeoutMs: 5000 }),
    /UNAVAILABLE/,
  );
  assert.equal(mock.calls.length, 3, 'tentati tutti e 3 i provider prima di arrendersi');
});

test('empty result NON e\' un errore: elements [] risolve regolarmente', async () => {
  const mock = endpointMock({ 'overpass-api.de': { status: 200, elements: [] } });
  const res = await fetchRoadsWithFallback({
    fetchImpl: mock, endpoints: resolvePoiEndpoints(null), query: POI_QUERY, timeoutMs: 5000,
  });
  assert.deepEqual(res.elements, []);
  assert.equal(mock.calls.length, 1);
});

test('timeout provider: AbortController fa passare al provider successivo', async () => {
  const slow = async (url, init) => new Promise((_r, rej) => {
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const calls = [];
  const fn = async (url, init) => {
    calls.push(String(url));
    if (calls.length === 1) return slow(url, init);
    return { ok: true, status: 200, json: async () => ({ elements: [{ id: 9 }] }) };
  };
  const res = await fetchRoadsWithFallback({ fetchImpl: fn, endpoints: resolvePoiEndpoints(null), query: POI_QUERY, timeoutMs: 40 });
  assert.deepEqual(res.elements, [{ id: 9 }]);
  assert.equal(calls.length, 2);
});

// ── cache TTL server-side ────────────────────────────────────────────────
test('createTtlCache: hit entro TTL, miss oltre TTL; chiave stabile per coord arrotondate', () => {
  const c = createTtlCache(50);
  const k1 = makePoiCacheKey({ centerLat: 45.5511, centerLng: 9.1632, radiusKm: 3, serviceType: 'd2d', targetSelection: ['b', 'a'] });
  const k2 = makePoiCacheKey({ centerLat: 45.5514, centerLng: 9.1634, radiusKm: 3, serviceType: 'd2d', targetSelection: ['a', 'b'] });
  assert.equal(k1, k2, 'micro-scarti coord + ordine target non cambiano la chiave');
  c.set(k1, [1, 2, 3]);
  assert.deepEqual(c.get(k1), [1, 2, 3]);
});
