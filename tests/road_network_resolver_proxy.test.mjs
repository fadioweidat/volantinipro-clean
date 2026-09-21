// Verifica che src/lib/geo/resolveRoadNetwork.js NON chiami piu' Overpass
// direttamente dal browser ma passi per il proxy same-project
// /functions/v1/road-network, mantenendo invariato il contratto di output
// { ways, totalLengthM } consumato da selectRoadsFromOrigin / ZoneCoverageMap
// / CoverageAdjustmentPanel.

import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

const { resolveRoadNetwork, clearRoadNetworkCache, FAILURE_BACKOFF_MS } = await import('../src/lib/geo/resolveRoadNetwork.js');
const { selectRoadsFromOrigin } = await import('../src/lib/geo/originRadialSelection.js');

// sessionStorage assente in node: resolveRoadNetwork lo gestisce gia' con
// try/catch, ma stubbarlo tiene i test isolati da eventuali warning.
if (!globalThis.sessionStorage) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Confine minimo valido (ring [lng,lat], >= 3 vertici).
const BOUNDARY = {
  type: 'Polygon',
  coordinates: [[
    [9.10, 45.55], [9.12, 45.55], [9.12, 45.57], [9.10, 45.57], [9.10, 45.55],
  ]],
};

// Geometria simile a Cinisello Balsamo (poligono reale attorno a lat 45.558, lng 9.215)
const CINISELLO_BOUNDARY = {
  type: 'Polygon',
  coordinates: [[
    [9.205, 45.549], [9.225, 45.550], [9.225, 45.565], [9.205, 45.565], [9.205, 45.549],
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

const wayEl = (id, highway = 'residential', extraTags = {}) => ({
  type: 'way',
  id,
  tags: { highway, name: `Via ${id}`, ...extraTags },
  geometry: [{ lat: 45.55, lon: 9.10 }, { lat: 45.551, lon: 9.101 }],
});

test('resolveRoadNetwork chiama SOLO /functions/v1/road-network, mai Overpass diretto', async () => {
  clearRoadNetworkCache();
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
  clearRoadNetworkCache();
  installFetch(async () => ({ ok: false, status: 502, json: async () => ({ error: 'ROAD_NETWORK_UNAVAILABLE' }) }));
  const res = await resolveRoadNetwork('ProxyTestComuneB', BOUNDARY);
  assert.equal(res, null);
});

test('fallimento di rete -> backoff previene chiamate duplicate immediate (StrictMode), ma consente retry dopo backoff', async () => {
  clearRoadNetworkCache();
  let mode = 'fail';
  const calls = installFetch(async () => {
    if (mode === 'fail') throw new Error('NETWORK_DOWN');
    return { ok: true, status: 200, json: async () => ({ elements: [wayEl(1)] }) };
  });

  // 1. Prima chiamata: fallisce
  const first = await resolveRoadNetwork('ProxyTestComuneC', BOUNDARY, { backoffMs: 50 });
  assert.equal(first, null);
  assert.equal(calls.length, 1);

  // 2. Chiamata immediata successiva (simulazione React StrictMode doppio mount):
  // NON deve effettuare una seconda chiamata HTTP di rete!
  mode = 'ok';
  const second = await resolveRoadNetwork('ProxyTestComuneC', BOUNDARY, { backoffMs: 50 });
  assert.equal(second, null, 'chiamata immediata entro la finestra di backoff deve restituire null senza richiamare la rete');
  assert.equal(calls.length, 1, 'nessuna richiesta HTTP duplicata emessa entro il backoff');

  // 3. Chiamata successiva dopo che la finestra di backoff e\' trascorsa:
  await new Promise((r) => setTimeout(r, 60));
  const third = await resolveRoadNetwork('ProxyTestComuneC', BOUNDARY, { backoffMs: 50 });
  assert.ok(third && third.ways.length === 1, 'il retry dopo il backoff deve avere successo');
  assert.equal(calls.length, 2, 'seconda richiesta HTTP emessa solo dopo scadenza del backoff');
});

test('secondo accesso allo stesso comune usa la cache (nessun secondo fetch)', async () => {
  clearRoadNetworkCache();
  const calls = installFetch(async () => ({
    ok: true, status: 200, json: async () => ({ elements: [wayEl(5)] }),
  }));
  await resolveRoadNetwork('ProxyTestComuneD', BOUNDARY);
  await resolveRoadNetwork('ProxyTestComuneD', BOUNDARY);
  assert.equal(calls.length, 1, 'cache in-memory: una sola richiesta al proxy');
});

test('risultato Overpass vuoto (0 vie idonee) -> restituisce { ways: [], totalLengthM: 0 } e non null', async () => {
  clearRoadNetworkCache();
  const calls = installFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ elements: [] }),
  }));

  const res = await resolveRoadNetwork('EmptyComune', BOUNDARY);
  assert.equal(calls.length, 1);
  assert.ok(res !== null, 'un risultato vuoto valido non deve essere null');
  assert.deepEqual(res.ways, []);
  assert.equal(res.totalLengthM, 0);
});

test('geometria Cinisello Balsamo + filtraggio vie idonee vs escluse', async () => {
  clearRoadNetworkCache();
  const elements = [
    wayEl(101, 'residential'),
    wayEl(102, 'living_street'),
    wayEl(103, 'unclassified'),
    wayEl(104, 'service'), // consentito di default
    wayEl(105, 'service', { service: 'parking_aisle' }), // escluso
    wayEl(106, 'service', { service: 'driveway' }), // escluso
    wayEl(107, 'service', { service: 'drive-through' }), // escluso
    wayEl(108, 'motorway'), // escluso lato client se presente
    wayEl(109, 'footway'), // escluso lato client se presente
  ];

  installFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ elements }),
  }));

  const res = await resolveRoadNetwork('Cinisello Balsamo', CINISELLO_BOUNDARY);
  assert.ok(res !== null);
  assert.equal(res.ways.length, 4, 'solo le 4 vie idonee devono essere accettate');
  const ids = res.ways.map((w) => w.id);
  assert.deepEqual(ids, [101, 102, 103, 104]);
});

test('contratto UI: distinzione ROAD_NETWORK_UNAVAILABLE (502/null) vs ROAD_NETWORK_EMPTY (0 vie)', () => {
  function getUiErrorMessage(net) {
    if (net === null) {
      return 'Servizio rete stradale temporaneamente non disponibile. Riprova.';
    }
    if (!net.ways?.length || !(net.totalLengthM > 0)) {
      return 'Nessuna via idonea trovata per questa zona.';
    }
    return null;
  }

  // 1. Caso HTTP 502 / provider down -> net === null
  assert.equal(
    getUiErrorMessage(null),
    'Servizio rete stradale temporaneamente non disponibile. Riprova.',
  );
  assert.doesNotMatch(getUiErrorMessage(null), /nessuna via idonea/i, 'non deve mostrare "nessuna via idonea" per errore 502');

  // 2. Caso Overpass valido con 0 vie idonee -> net = { ways: [], totalLengthM: 0 }
  assert.equal(
    getUiErrorMessage({ ways: [], totalLengthM: 0 }),
    'Nessuna via idonea trovata per questa zona.',
  );

  // 3. Caso rete caricata con successo -> nessun errore
  assert.equal(
    getUiErrorMessage({ ways: [{ id: 1 }], totalLengthM: 150 }),
    null,
  );
});

test('copertura automatica (selectRoadsFromOrigin) procede correttamente dopo caricamento rete Cinisello', async () => {
  clearRoadNetworkCache();
  const elements = [
    { type: 'way', id: 1, tags: { highway: 'residential' }, geometry: [{ lat: 45.555, lon: 9.210 }, { lat: 45.556, lon: 9.211 }] },
    { type: 'way', id: 2, tags: { highway: 'residential' }, geometry: [{ lat: 45.556, lon: 9.211 }, { lat: 45.557, lon: 9.212 }] },
    { type: 'way', id: 3, tags: { highway: 'residential' }, geometry: [{ lat: 45.557, lon: 9.212 }, { lat: 45.558, lon: 9.213 }] },
    { type: 'way', id: 4, tags: { highway: 'residential' }, geometry: [{ lat: 45.558, lon: 9.213 }, { lat: 45.559, lon: 9.214 }] },
  ];

  installFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ elements }),
  }));

  const net = await resolveRoadNetwork('Cinisello Balsamo', CINISELLO_BOUNDARY);
  assert.ok(net && net.ways.length === 4);

  const origin = { lat: 45.555, lng: 9.210 };
  const autoCoverage = selectRoadsFromOrigin(net, origin, 50, []);
  assert.ok(autoCoverage.selectedWays.length > 0, 'deve selezionare vie per copertura automatica 50%');
  assert.ok(autoCoverage.selectedLengthM > 0, 'lunghezza selezionata deve essere > 0');
  assert.ok(autoCoverage.coverageMetricPercent > 0);
});

