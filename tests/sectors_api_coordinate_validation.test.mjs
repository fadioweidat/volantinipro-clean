// Regressione: fetchSectors non deve mai raggiungere RPC/rete con coordinate mancanti o non valide.
// Deterministico e offline: fetch e' sostituito da uno spy e le variabili Supabase sono valori finti locali.
// Nessuna chiamata reale a Supabase (lo spy non inoltra nulla al fetch vero).
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSectors } from '../src/lib/services/sectors-api.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const MOCK_RESULT = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { id: 's1' } }] };

let calls = [];
let savedFetch;
let savedUrl;
let savedKey;

beforeEach(() => {
  calls = [];
  savedFetch = globalThis.fetch;
  savedUrl = process.env.VITE_SUPABASE_URL;
  savedKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.VITE_SUPABASE_ANON_KEY = 'fake-anon-key-for-tests';
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => MOCK_RESULT, text: async () => '' };
  };
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = savedUrl;
  if (savedKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = savedKey;
});

const call = (centerLat, centerLng) => fetchSectors({ serviceType: 'd2d', centerLat, centerLng });

const INVALID_VALUES = [
  ['null', null],
  ['undefined', undefined],
  ['empty string', ''],
  ['spaces', '   '],
  ['tab/newline', String.fromCharCode(9, 10)],
  ['false', false],
  ['true', true],
  ['empty array', []],
  ['array with number', [45]],
  ['empty object', {}],
  ['object with valueOf', { valueOf: () => 45 }],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['bigint', 45n],
  ['text', 'abc'],
  ['hex string', '0x10'],
  ['exponent string', '1e1'],
  ['binary string', '0b1'],
  ['comma decimal', '45,5'],
  ['double sign', '--1'],
  ['NaN string', 'NaN'],
  ['Infinity string', 'Infinity'],
];

test('invalid latitude never reaches RPC/fetch and returns the empty collection', async () => {
  for (const [name, value] of INVALID_VALUES) {
    calls.length = 0;
    const result = await call(value, 9.19);
    assert.deepEqual(result, EMPTY, 'lat ' + name);
    assert.equal(calls.length, 0, 'lat ' + name + ' must not call fetch');
  }
});

test('invalid longitude never reaches RPC/fetch and returns the empty collection', async () => {
  for (const [name, value] of INVALID_VALUES) {
    calls.length = 0;
    const result = await call(45.46, value);
    assert.deepEqual(result, EMPTY, 'lng ' + name);
    assert.equal(calls.length, 0, 'lng ' + name + ' must not call fetch');
  }
});

test('both coordinates missing or null never reach RPC/fetch', async () => {
  assert.deepEqual(await call(null, null), EMPTY);
  assert.deepEqual(await call(undefined, undefined), EMPTY);
  assert.deepEqual(await fetchSectors({ serviceType: 'd2d' }), EMPTY);
  assert.equal(calls.length, 0);
});

test('out-of-range coordinates never reach RPC/fetch', async () => {
  const cases = [[-90.0001, 0], [90.0001, 0], [0, -180.0001], [0, 180.0001], [91, 9], [45, 181], [-91, -181], ['90.0001', 0], [0, '-180.0001']];
  for (const [lat, lng] of cases) {
    calls.length = 0;
    assert.deepEqual(await call(lat, lng), EMPTY, lat + ',' + lng);
    assert.equal(calls.length, 0, lat + ',' + lng + ' must not call fetch');
  }
});

test('valid zero coordinates DO reach the mocked RPC with 0,0 (0 is not "missing")', async () => {
  const result = await call(0, 0);
  assert.deepEqual(result, MOCK_RESULT);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/get_map_sectors$/);
  assert.equal(calls[0].body.p_center_lat, 0);
  assert.equal(calls[0].body.p_center_lng, 0);
});

test('zero on one axis only is valid', async () => {
  await call(0, 9.19);
  await call(45.46, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual([calls[0].body.p_center_lat, calls[0].body.p_center_lng], [0, 9.19]);
  assert.deepEqual([calls[1].body.p_center_lat, calls[1].body.p_center_lng], [45.46, 0]);
});

test('geographic boundary values are accepted', async () => {
  const cases = [[-90, 0], [90, 0], [0, -180], [0, 180], [-90, -180], [90, 180]];
  for (const [lat, lng] of cases) {
    calls.length = 0;
    const result = await call(lat, lng);
    assert.deepEqual(result, MOCK_RESULT, lat + ',' + lng);
    assert.equal(calls.length, 1, lat + ',' + lng);
    assert.equal(calls[0].body.p_center_lat, lat);
    assert.equal(calls[0].body.p_center_lng, lng);
  }
});

test('normal coordinates are sent unchanged with the normalised service type and radius', async () => {
  const result = await fetchSectors({ serviceType: 'door_to_door', centerLat: 45.5186, centerLng: 9.1762, radiusKm: 5 });
  assert.deepEqual(result, MOCK_RESULT);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { p_service_type: 'd2d', p_center_lat: 45.5186, p_center_lng: 9.1762, p_radius_km: 5 });
});

test('valid decimal numeric strings keep working (backward compatible) and are converted to numbers', async () => {
  const cases = [['45.46', '9.19', 45.46, 9.19], [' 45.46 ', ' 9.19 ', 45.46, 9.19], ['0', '0', 0, 0], ['-0.5', '+10', -0.5, 10], ['.5', '5.', 0.5, 5], ['-90', '180', -90, 180]];
  for (const [lat, lng, expectedLat, expectedLng] of cases) {
    calls.length = 0;
    const result = await call(lat, lng);
    assert.deepEqual(result, MOCK_RESULT, JSON.stringify([lat, lng]));
    assert.equal(calls.length, 1);
    assert.strictEqual(calls[0].body.p_center_lat, expectedLat);
    assert.strictEqual(calls[0].body.p_center_lng, expectedLng);
  }
});

test('rpc error path is unchanged for valid input (returns null)', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await call(45.46, 9.19), null);
  } finally {
    console.warn = originalWarn;
  }
});
