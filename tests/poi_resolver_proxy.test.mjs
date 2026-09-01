// Verifica che src/lib/services/poi-api.js (fetchPois) NON chiami piu' Overpass
// direttamente dal browser ma passi SOLO per il proxy same-project
// /functions/v1/poi-search, mantenendo invariato il contratto verso usePoi
// (array di POI mappati; empty != error). Gemello di
// tests/road_network_resolver_proxy.test.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

const { fetchPois } = await import('../src/lib/services/poi-api.js');

const OVERPASS_HOST_RE = [/overpass\.kumi\.systems/, /overpass-api\.de/, /overpass\.private\.coffee/, /\/api\/interpreter/];

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return calls;
}

const schoolEl = (id, name) => ({ type: 'node', id, lat: 45.55 + id * 1e-4, lon: 9.16, tags: { amenity: 'school', name } });

test('fetchPois chiama SOLO /functions/v1/poi-search, mai un host Overpass', async () => {
  const calls = installFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ elements: [schoolEl(2, 'Scuola B'), schoolEl(1, 'Scuola A')] }),
  }));

  const pois = await fetchPois({ centerLat: 45.551, centerLng: 9.163, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] });

  assert.equal(calls.length, 1, 'una sola richiesta: il fallback multi-provider e\' lato server');
  assert.match(calls[0].url, /\/functions\/v1\/poi-search$/);
  for (const re of OVERPASS_HOST_RE) assert.ok(!re.test(calls[0].url), `non deve contattare ${re}`);

  // Header anon key (come gli altri client src/api/*), body strutturato senza QL.
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'anon-test-key');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer anon-test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['centerLat', 'centerLng', 'radiusKm', 'serviceType', 'targetSelection'].sort());
  assert.equal(body.serviceType, 'd2d');
  assert.deepEqual(body.targetSelection, ['scuole']);
  assert.ok(!JSON.stringify(body).includes('['.concat('out:json')), 'il client non invia mai QL Overpass');

  // POI mappati + sort per priorita' (toPoi/dedup/sort invariati).
  assert.equal(pois.length, 2);
  assert.ok(pois.every((p) => p.category === 'Scuola'));
});

test('200 + elements [] -> zero attivita\' reali: ritorna [] senza lanciare', async () => {
  installFetch(async () => ({ ok: true, status: 200, json: async () => ({ elements: [] }) }));
  const pois = await fetchPois({ centerLat: 46.1, centerLng: 10.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] });
  assert.deepEqual(pois, []);
});

test('proxy 502 -> POI_SEARCH_UNAVAILABLE (error-state, non zero risultati)', async () => {
  installFetch(async () => ({ ok: false, status: 502, json: async () => ({ error: 'POI_SEARCH_UNAVAILABLE' }) }));
  await assert.rejects(
    () => fetchPois({ centerLat: 45.55, centerLng: 9.16, radiusKm: 3, serviceType: 'h2h', targetSelection: [] }),
    /POI_SEARCH_UNAVAILABLE/,
  );
});

test('errore di rete sul proxy -> POI_SEARCH_UNAVAILABLE, una sola chiamata', async () => {
  const calls = installFetch(async () => { throw new Error('NETWORK_DOWN'); });
  await assert.rejects(
    () => fetchPois({ centerLat: 45.55, centerLng: 9.16, radiusKm: 3, serviceType: 'b2b', targetSelection: [] }),
    /POI_SEARCH_UNAVAILABLE/,
  );
  assert.equal(calls.length, 1, 'nessun retry su host Overpass alternativi lato client');
});

// ── controllo statico sorgente: nessun literal Overpass nel path client POI ──
test('SORGENTE — poi-api.js e src/api/poiSearch.js non contengono host Overpass ne\' VITE_OVERPASS_ENDPOINT', () => {
  const src =
    readFileSync(new URL('../src/lib/services/poi-api.js', import.meta.url), 'utf8') +
    '\n' +
    readFileSync(new URL('../src/api/poiSearch.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /overpass\.kumi\.systems/, 'nessun endpoint kumi nel client');
  assert.doesNotMatch(src, /overpass-api\.de/, 'nessun endpoint overpass-api.de nel client');
  assert.doesNotMatch(src, /overpass\.private\.coffee/, 'nessun endpoint private.coffee nel client');
  assert.doesNotMatch(src, /VITE_OVERPASS_ENDPOINT/, 'il client non legge piu\' VITE_OVERPASS_ENDPOINT');
  assert.doesNotMatch(src, /\/api\/interpreter/, 'nessun path Overpass nel client');
  assert.match(src, /\/functions\/v1\/poi-search/, 'il client punta al proxy same-project');
});
