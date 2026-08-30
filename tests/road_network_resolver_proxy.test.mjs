// Verifica che src/lib/geo/resolveRoadNetwork.js NON chiami piu' Overpass
// direttamente dal browser ma passi per il proxy same-project
// /functions/v1/road-network, mantenendo invariato il contratto di output
// { ways, totalLengthM } consumato da selectRoadsFromOrigin / ZoneCoverageMap
// / CoverageAdjustmentPanel.

import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

const { resolveRoadNetwork } = await import('../src/lib/geo/resolveRoadNetwork.js');

// sessionStorage assente in node: resolveRoadNetwork lo gestisce gia' con
// try/catch, ma stubbarlo tiene i test isolati da eventuali warning.
if (!globalThis.sessionStorage) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

// Confine minimo valido (ring [lng,lat], >= 3 vertici).
const BOUNDARY = {
  type: 'Polygon',
  coordinates: [[
    [9.10, 45.55], [9.12, 45.55], [9.12, 45.57], [9.10, 45.57], [9.10, 45.55],
  ]],
};

const OVERPASS_HOSTS = [/overpass\.kumi\.systems/, /overpass-api\.de/, /overpass\.private\.coffee/, /interpreter/];

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return calls;
}

const wayEl = (id) => ({
  type: 'way',
  id,
  tags: { highway: 'residential', name: `Via ${id}` },
  geometry: [{ lat: 45.55, lon: 9.10 }, { lat: 45.551, lon: 9.101 }],
});

test('resolveRoadNetwork chiama SOLO /functions/v1/road-network, mai Overpass diretto', async () => {
  const calls = installFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ elements: [wayEl(20), wayEl(10)] }),
  }));

  const res = await resolveRoadNetwork('ProxyTestComuneA', BOUNDARY);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/functions\/v1\/road-network$/);
  assert.ok(!OVERPASS_HOSTS.slice(0, 3).some((re) => re.test(calls[0].url)), 'non deve contattare host Overpass');

  // Header anon key (come gli altri client src/api/*), body strutturato.
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'anon-test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.municipality, 'ProxyTestComuneA');
  assert.equal(typeof body.poly, 'string');
  assert.match(body.poly, /^[0-9 .\-]+$/, 'il client invia solo vertici, mai QL');

  // Contratto invariato + ordinamento deterministico per OSM way id.
  assert.ok(Array.isArray(res.ways));
  assert.deepEqual(res.ways.map((w) => w.id), [10, 20]);
  assert.ok(res.totalLengthM > 0);
});

test('proxy 502 -> resolveRoadNetwork risolve a null (nessuna traccia finta)', async () => {
  installFetch(async () => ({ ok: false, status: 502, json: async () => ({ error: 'ROAD_NETWORK_UNAVAILABLE' }) }));
  const res = await resolveRoadNetwork('ProxyTestComuneB', BOUNDARY);
  assert.equal(res, null);
});

test('errore di rete sul proxy -> null, e il fallimento non viene messo in cache', async () => {
  let mode = 'fail';
  installFetch(async () => {
    if (mode === 'fail') throw new Error('NETWORK_DOWN');
    return { ok: true, status: 200, json: async () => ({ elements: [wayEl(1)] }) };
  });

  const first = await resolveRoadNetwork('ProxyTestComuneC', BOUNDARY);
  assert.equal(first, null);

  mode = 'ok';
  const second = await resolveRoadNetwork('ProxyTestComuneC', BOUNDARY);
  assert.ok(second && second.ways.length === 1, 'un fallimento non deve avvelenare i tentativi successivi');
});

test('secondo accesso allo stesso comune usa la cache (nessun secondo fetch)', async () => {
  const calls = installFetch(async () => ({
    ok: true, status: 200, json: async () => ({ elements: [wayEl(5)] }),
  }));
  await resolveRoadNetwork('ProxyTestComuneD', BOUNDARY);
  await resolveRoadNetwork('ProxyTestComuneD', BOUNDARY);
  assert.equal(calls.length, 1, 'cache in-memory: una sola richiesta al proxy');
});
