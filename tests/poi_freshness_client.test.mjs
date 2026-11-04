// Client POI — tre esiti distinti (2026-11-03):
//  - aggiornati: POI letti ora (o dalla cache fresca del server), stale:false;
//  - dalla cache: Overpass non risponde, ultimo dato verificato con la data;
//  - non disponibili: nessun dato, errore POI_SEARCH_UNAVAILABLE.
// Mai un errore trasformato in "zero attivita'" confermato.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, beforeEach } from 'node:test';

process.env.VITE_POI_SEARCH_URL = '/api/poi-search';

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}
globalThis.localStorage = memoryStorage();

const { fetchPoiSearch, fetchPoiSearchElements } = await import('../src/api/poiSearch.js');
const { describePoiAge, fetchPoisWithFreshness } = await import('../src/lib/services/poi-api.js');

const PARAMS = { centerLat: 45.5287, centerLng: 9.1709, radiusKm: 3, serviceType: 'd2d', targetSelection: [] };
const el = (id) => ({ type: 'node', id, lat: 45.53, lon: 9.17, tags: { shop: 'supermarket', name: `Supermercato ${id}` } });
const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 502, json: async () => body });

beforeEach(() => globalThis.localStorage.clear());

test('aggiornati: live con fetchedAt, salvati come copia locale', async () => {
  globalThis.fetch = reply({ elements: [el(1)], source: 'live', fetchedAt: '2026-11-03T10:00:00.000Z' });
  const r = await fetchPoiSearch(PARAMS);
  assert.deepEqual(r, { elements: [el(1)], stale: false, fetchedAt: '2026-11-03T10:00:00.000Z', source: 'live' });
  assert.equal(globalThis.localStorage.length, 1);
});

test('dalla cache del server: stale:true con la data della lettura originale', async () => {
  globalThis.fetch = reply({ elements: [el(2)], degraded: true, stale: true, source: 'cache', fetchedAt: '2026-11-03T07:00:00.000Z' });
  const r = await fetchPoiSearch(PARAMS);
  assert.deepEqual(r, { elements: [el(2)], stale: true, fetchedAt: '2026-11-03T07:00:00.000Z', source: 'cache' });
  assert.equal(globalThis.localStorage.length, 0, 'un dato in cache non rinnova la copia locale');
});

test('server indisponibile ma copia locale recente: stale:true, mai presentato come aggiornato', async () => {
  const fetchedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  globalThis.fetch = reply({ elements: [el(3)], source: 'live', fetchedAt });
  await fetchPoiSearch(PARAMS);
  globalThis.fetch = reply({ elements: [], temporaryUnavailable: true, source: 'none' });
  const r = await fetchPoiSearch(PARAMS);
  assert.deepEqual(r, { elements: [el(3)], stale: true, fetchedAt, source: 'live' }, 'la copia locale ricorda la fonte originale, ma e\x27 stale');
});

test('server indisponibile, copia locale oltre 7 giorni: non disponibile', async () => {
  const fetchedAt = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  globalThis.fetch = reply({ elements: [el(4)], source: 'live', fetchedAt });
  await fetchPoiSearch(PARAMS);
  globalThis.fetch = async () => { throw new Error('network'); };
  await assert.rejects(fetchPoiSearch(PARAMS), /POI_SEARCH_UNAVAILABLE/);
});

test('non disponibili senza copia: errore, non zero confermato', async () => {
  globalThis.fetch = reply({ elements: [], temporaryUnavailable: true, source: 'none' });
  await assert.rejects(fetchPoiSearch(PARAMS), /POI_SEARCH_UNAVAILABLE/);
  globalThis.fetch = reply({}, false);
  await assert.rejects(fetchPoiSearch(PARAMS), /POI_SEARCH_UNAVAILABLE/);
});

test('zero attivita\' reali: elements [] aggiornati, nessun errore', async () => {
  globalThis.fetch = reply({ elements: [], source: 'live', fetchedAt: '2026-11-03T10:00:00.000Z' });
  assert.deepEqual(await fetchPoiSearch(PARAMS), { elements: [], stale: false, fetchedAt: '2026-11-03T10:00:00.000Z', source: 'live' });
});

test('contratto storico: fetchPoiSearchElements restituisce ancora solo gli elementi', async () => {
  globalThis.fetch = reply({ elements: [el(5)], source: 'live', fetchedAt: '2026-11-03T10:00:00.000Z' });
  assert.deepEqual(await fetchPoiSearchElements(PARAMS), [el(5)]);
});

test('fetchPoisWithFreshness: POI convertiti + stale/fetchedAt', async () => {
  globalThis.fetch = reply({ elements: [el(6)], stale: true, source: 'cache', fetchedAt: '2026-11-03T07:00:00.000Z' });
  const r = await fetchPoisWithFreshness(PARAMS);
  assert.equal(r.stale, true);
  assert.equal(r.fetchedAt, '2026-11-03T07:00:00.000Z');
  assert.equal(r.pois.length, 1);
  assert.equal(r.pois[0].name, 'Supermercato 6');
});

test('describePoiAge: eta\' leggibile', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  assert.equal(describePoiAge('2026-11-03T11:59:30.000Z', now), 'pochi istanti fa');
  assert.equal(describePoiAge('2026-11-03T11:48:00.000Z', now), '12 minuti fa');
  assert.equal(describePoiAge('2026-11-03T11:00:00.000Z', now), "un'ora fa");
  assert.equal(describePoiAge('2026-11-03T09:00:00.000Z', now), '3 ore fa');
  assert.equal(describePoiAge('2026-11-01T12:00:00.000Z', now), '2 giorni fa');
  assert.equal(describePoiAge('non una data', now), null);
});

test('Step 2: badge "ultimo aggiornamento disponibile" distinto da errore e da zero', () => {
  const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
  assert.match(step2, /const poiStaleAge = !poiLoading && !poiError && poiStale \?/);
  assert.match(map, /!loadingPois && !poiFetchFailed && poiStaleAge &&/);
  assert.match(map, /Attività commerciali dall'ultimo aggiornamento disponibile \(\{poiStaleAge\}\)/);
});
