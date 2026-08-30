// Verifica del nucleo del proxy server-side Overpass "rete stradale"
// (supabase/functions/_shared/roadNetworkProxy.ts): validazione input,
// query server-controlled, fallback multi-provider con timeout.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRoadQuery,
  createTtlCache,
  DEFAULT_OVERPASS_ENDPOINTS,
  ELIGIBLE_HIGHWAY_CLASSES,
  fetchRoadsWithFallback,
  makeCacheKey,
  resolveEndpoints,
  sanitizeMunicipality,
  validatePoly,
} from '../supabase/functions/_shared/roadNetworkProxy.ts';

const CLEAN_POLY = '45.55 9.10 45.56 9.11 45.57 9.09 45.55 9.10';

// ── validatePoly ──────────────────────────────────────────────────────────
test('validatePoly accetta un poligono pulito e normalizza gli spazi', () => {
  const r = validatePoly('  45.55   9.10 45.56 9.11 45.57 9.09  ');
  assert.equal(r.ok, true);
  assert.equal(r.vertices, 3);
  assert.equal(r.poly, '45.55 9.10 45.56 9.11 45.57 9.09');
});

test('validatePoly rifiuta input non-stringa', () => {
  assert.equal(validatePoly(null).ok, false);
  assert.equal(validatePoly({ poly: CLEAN_POLY }).ok, false);
  assert.equal(validatePoly(42).ok, false);
});

test('validatePoly rifiuta tentativi di injection Overpass QL', () => {
  const injection = 'way["highway"](poly:"45 9");out;';
  const r = validatePoly(injection);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'POLY_INVALID_CHARS');
});

test('validatePoly rifiuta numero dispari di token', () => {
  assert.equal(validatePoly('45.55 9.10 45.56').error, 'POLY_ODD_TOKENS');
});

test('validatePoly rifiuta troppi pochi vertici', () => {
  assert.equal(validatePoly('45.55 9.10 45.56 9.11').error, 'POLY_TOO_FEW_VERTICES');
});

test('validatePoly rifiuta troppi vertici (> 200)', () => {
  const many = Array.from({ length: 201 }, () => '45.5 9.1').join(' ');
  assert.equal(validatePoly(many).error, 'POLY_TOO_MANY_VERTICES');
});

test('validatePoly rifiuta coordinate fuori range', () => {
  assert.equal(validatePoly('91 9.10 45.56 9.11 45.57 9.09').error, 'POLY_LAT_OUT_OF_RANGE');
  assert.equal(validatePoly('45.55 181 45.56 9.11 45.57 9.09').error, 'POLY_LNG_OUT_OF_RANGE');
});

test('validatePoly rifiuta stringhe assurdamente lunghe', () => {
  const huge = Array.from({ length: 5000 }, () => '45.5 9.1').join(' ');
  assert.equal(validatePoly(huge).error, 'POLY_TOO_LONG');
});

// ── sanitizeMunicipality ──────────────────────────────────────────────────
test('sanitizeMunicipality rimuove spazi/trattini e limita la lunghezza', () => {
  assert.equal(sanitizeMunicipality('  Cassina de\' Pecchi  ').length <= 120, true);
  assert.equal(sanitizeMunicipality('a'.repeat(500)).length, 120);
  assert.equal(sanitizeMunicipality(null), '');
});

// ── buildRoadQuery (server-controlled) ────────────────────────────────────
test('buildRoadQuery usa le classi canoniche e inserisce il poly, senza eco di QL client', () => {
  const q = buildRoadQuery(CLEAN_POLY);
  for (const cls of ELIGIBLE_HIGHWAY_CLASSES) assert.ok(q.includes(cls), `manca la classe ${cls}`);
  assert.ok(q.includes(`(poly:"${CLEAN_POLY}")`));
  assert.ok(q.startsWith('[out:json]'));
  assert.ok(q.trimEnd().endsWith('out geom;'));
});

// ── resolveEndpoints ─────────────────────────────────────────────────────
test('resolveEndpoints mette l\'env per primo e mantiene i default come fallback', () => {
  const eps = resolveEndpoints('https://overpass.example.org/api/interpreter');
  assert.equal(eps[0], 'https://overpass.example.org/api/interpreter');
  assert.deepEqual(eps.slice(1), DEFAULT_OVERPASS_ENDPOINTS);
});

test('resolveEndpoints ignora env vuoto/non-https e non duplica', () => {
  assert.deepEqual(resolveEndpoints(''), DEFAULT_OVERPASS_ENDPOINTS);
  assert.deepEqual(resolveEndpoints('http://insecure'), DEFAULT_OVERPASS_ENDPOINTS);
  assert.deepEqual(resolveEndpoints(DEFAULT_OVERPASS_ENDPOINTS[0]), DEFAULT_OVERPASS_ENDPOINTS);
});

// ── fetchRoadsWithFallback ───────────────────────────────────────────────
function mockFetch(plan) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push(String(url));
    const key = [...plan.keys()].find((k) => String(url).includes(k));
    const cfg = key ? plan.get(key) : null;
    if (!cfg) throw new Error(`UNEXPECTED_URL:${url}`);
    if (cfg.rejects) throw new Error(cfg.message || 'NETWORK_ERROR');
    if (cfg.hang) {
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    return {
      ok: cfg.ok !== false,
      status: cfg.status ?? (cfg.ok !== false ? 200 : 500),
      json: async () => ({ elements: cfg.elements || [] }),
    };
  };
  fn.calls = calls;
  return fn;
}

const EPS = ['https://p1.example/api', 'https://p2.example/api', 'https://p3.example/api'];

test('provider 1 success -> risultato immediato, un solo endpoint contattato', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { ok: true, elements: [{ type: 'way', id: 1 }] }],
  ]));
  const r = await fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 1000 });
  assert.equal(r.elements.length, 1);
  assert.equal(r.endpointIndex, 0);
  assert.equal(r.attempts, 1);
  assert.equal(fetchImpl.calls.length, 1);
});

test('provider 1 fail (504) + provider 2 success -> PASS, in ordine', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { ok: false, status: 504 }],
    ['p2.example', { ok: true, elements: [{ type: 'way', id: 7 }] }],
  ]));
  const r = await fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 1000 });
  assert.equal(r.elements[0].id, 7);
  assert.equal(r.endpointIndex, 1);
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[0], /p1\.example/);
  assert.match(fetchImpl.calls[1], /p2\.example/);
});

test('provider 1 rifiuto di rete -> passa comunque al provider 2', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { rejects: true, message: 'ECONNRESET' }],
    ['p2.example', { ok: true, elements: [{ type: 'way', id: 3 }] }],
  ]));
  const r = await fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 1000 });
  assert.equal(r.elements[0].id, 3);
  assert.equal(fetchImpl.calls.length, 2);
});

test('provider 1 429 -> retriabile, passa al provider 2', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { ok: false, status: 429 }],
    ['p2.example', { ok: true, elements: [] }],
  ]));
  const r = await fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 1000 });
  assert.equal(r.endpointIndex, 1);
});

test('tutti i provider falliscono -> errore controllato ROAD_NETWORK_UNAVAILABLE, tutti tentati', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { ok: false, status: 504 }],
    ['p2.example', { ok: false, status: 502 }],
    ['p3.example', { rejects: true }],
  ]));
  await assert.rejects(
    () => fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 1000 }),
    (err) => {
      assert.equal(err.message, 'ROAD_NETWORK_UNAVAILABLE');
      assert.equal(err.attempts, 3);
      return true;
    },
  );
  assert.equal(fetchImpl.calls.length, 3);
});

test('timeout per provider: una richiesta appesa viene abortita e si passa oltre', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { hang: true }],
    ['p2.example', { ok: true, elements: [{ type: 'way', id: 9 }] }],
  ]));
  const started = Date.now();
  const r = await fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 40 });
  assert.equal(r.elements[0].id, 9);
  assert.ok(Date.now() - started < 2000, 'non deve attendere indefinitamente');
});

test('4xx non-retriabile (400) -> errore fatale senza martellare gli altri provider', async () => {
  const fetchImpl = mockFetch(new Map([
    ['p1.example', { ok: false, status: 400 }],
    ['p2.example', { ok: true, elements: [] }],
  ]));
  await assert.rejects(() => fetchRoadsWithFallback({ fetchImpl, endpoints: EPS, query: 'Q', timeoutMs: 1000 }), /OVERPASS_HTTP_400/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('nessun endpoint configurato -> errore immediato', async () => {
  await assert.rejects(
    () => fetchRoadsWithFallback({ fetchImpl: mockFetch(new Map()), endpoints: [], query: 'Q', timeoutMs: 10 }),
    /ROAD_NETWORK_UNAVAILABLE/,
  );
});

// ── cache TTL ────────────────────────────────────────────────────────────
test('createTtlCache scade le voci dopo il TTL', async () => {
  const c = createTtlCache(20);
  c.set('k', [1, 2, 3]);
  assert.deepEqual(c.get('k'), [1, 2, 3]);
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(c.get('k'), null);
});

test('makeCacheKey e\' stabile per stesso comune+poly e diverso al variare del poly', () => {
  const a = makeCacheKey('Milano', CLEAN_POLY);
  const b = makeCacheKey('Milano', CLEAN_POLY);
  const d = makeCacheKey('Milano', '45.55 9.10 45.56 9.11 45.58 9.09');
  assert.equal(a, b);
  assert.notEqual(a, d);
});
