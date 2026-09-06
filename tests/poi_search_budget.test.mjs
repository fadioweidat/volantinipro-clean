// TICKET — "POI SEARCH TOO SLOW + 502".
// I POI sono arricchimento OPZIONALE: non devono mai far percepire Step 2 come
// lento. Verifiche:
//  1. fetchRoadsWithFallback rispetta `deadlineMs` (budget TOTALE): non prova
//     tutti i provider oltre la deadline, lancia con deadlineExceeded.
//  2. src/api/poiSearch.js ha un timeout client (abort) e non resta appeso.
//  3. src/api/poiSearch.js tratta 200 { temporaryUnavailable: true } come
//     fallimento (badge "temporaneamente non disponibili"), NON come "0 POI".
//  4. src/api/poiSearch.js serve gli elements di un degrado con stale.
//  5. Step2.jsx: poiLoading NON gata piu' gisLoading per residenziale/D2D.
//  6. Step2Map.jsx: niente overlay a tutto schermo (inset:0) mentre i POI caricano.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fetchRoadsWithFallback } from '../supabase/functions/_shared/roadNetworkProxy.ts';

process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

const EPS = ['https://a.example/api/interpreter', 'https://b.example/api/interpreter', 'https://c.example/api/interpreter'];

// fetch che non risolve mai finche' non viene abortito (simula provider appeso).
function hangingFetch() {
  return (_url, init) => new Promise((_resolve, reject) => {
    const sig = init && init.signal;
    if (sig) sig.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

test('deadlineMs: budget totale rispettato — non prova tutti i provider, lancia deadlineExceeded', async () => {
  const t0 = Date.now();
  const err = await fetchRoadsWithFallback({
    fetchImpl: hangingFetch(),
    endpoints: EPS,
    query: 'Q',
    timeoutMs: 3500,
    deadlineMs: Date.now() + 1000,
  }).then(() => null, (e) => e);
  const elapsed = Date.now() - t0;
  assert.ok(err, 'deve lanciare');
  assert.equal(err.deadlineExceeded, true, 'flag deadlineExceeded');
  assert.ok(err.attempts <= 2, `max 1-2 provider tentati, non 3 (attempts=${err.attempts})`);
  assert.ok(elapsed < 2200, `deve chiudere entro ~budget, non 3x3500ms (elapsed=${elapsed}ms)`);
});

test('senza deadlineMs: comportamento invariato (prova tutti i provider entro i loro timeout)', async () => {
  const t0 = Date.now();
  const err = await fetchRoadsWithFallback({
    fetchImpl: hangingFetch(),
    endpoints: EPS,
    query: 'Q',
    timeoutMs: 120,
  }).then(() => null, (e) => e);
  const elapsed = Date.now() - t0;
  assert.ok(err, 'deve lanciare');
  assert.equal(err.attempts, 3, 'tutti e 3 i provider tentati');
  assert.ok(elapsed < 1500 && elapsed >= 300, `~3x120ms (elapsed=${elapsed}ms)`);
});

// ── client poiSearch.js ──────────────────────────────────────────────────
function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  return calls;
}

const { fetchPoiSearchElements } = await import('../src/api/poiSearch.js');

test('timeout client: una risposta appesa viene abortita, lancia POI_SEARCH_UNAVAILABLE (no hang)', async () => {
  process.env.POI_SEARCH_CLIENT_TIMEOUT_MS = '150';
  installFetch((_url, init) => new Promise((_res, rej) => {
    const sig = init && init.signal;
    if (sig) sig.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const t0 = Date.now();
  await assert.rejects(
    () => fetchPoiSearchElements({ centerLat: 45.55, centerLng: 9.16, radiusKm: 3, serviceType: 'd2d', targetSelection: [] }),
    /POI_SEARCH_UNAVAILABLE/,
  );
  assert.ok(Date.now() - t0 < 800, 'chiude subito dopo il timeout client, non resta appeso');
  delete process.env.POI_SEARCH_CLIENT_TIMEOUT_MS;
});

test('200 { temporaryUnavailable: true } -> fallimento (non "0 POI")', async () => {
  installFetch(async () => ({ ok: true, status: 200, json: async () => ({ elements: [], temporaryUnavailable: true, degraded: true, reason: 'upstream_timeout' }) }));
  await assert.rejects(
    () => fetchPoiSearchElements({ centerLat: 45.55, centerLng: 9.16, radiusKm: 3, serviceType: 'd2d', targetSelection: [] }),
    /POI_SEARCH_UNAVAILABLE/,
  );
});

test('200 degradato CON stale (elements popolati) -> si servono comunque', async () => {
  const el = { type: 'node', id: 1, lat: 45.55, lon: 9.16, tags: { amenity: 'school' } };
  installFetch(async () => ({ ok: true, status: 200, json: async () => ({ elements: [el], degraded: true, stale: true, reason: 'upstream_unavailable' }) }));
  const out = await fetchPoiSearchElements({ centerLat: 45.55, centerLng: 9.16, radiusKm: 3, serviceType: 'd2d', targetSelection: [] });
  assert.deepEqual(out, [el]);
});

// ── UI non bloccante ─────────────────────────────────────────────────────
const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
const step2map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');

test('Step2.jsx: poiLoading NON gata gisLoading per residenziale/D2D (solo H2H/B2B)', () => {
  assert.match(step2, /const poiIsOperationalData = isBusinessStep2 \|\| isMovementStep2;/);
  assert.match(step2, /const gisLoading = Boolean\(city && \(apiLoading \|\| sectorsLoading \|\| \(poiIsOperationalData && poiLoading\)\)\);/);
  // il vecchio gate che includeva sempre poiLoading/civici/transport non c'e' piu'
  assert.doesNotMatch(step2, /apiLoading \|\| sectorsLoading \|\| poiLoading \|\| civiciLoading \|\| transportLoading/);
});

test('Step2Map.jsx: nessun overlay a tutto schermo mentre i POI caricano', () => {
  // il blocco `loadingPois &&` non deve piu' contenere inset: 0 / backdropFilter / pointerEvents auto
  const idx = step2map.indexOf('city && loadingPois && (');
  assert.ok(idx > 0, 'esiste il ramo loadingPois');
  const block = step2map.slice(idx, idx + 900);
  assert.doesNotMatch(block, /inset:\s*0/);
  assert.doesNotMatch(block, /backdropFilter/);
  assert.doesNotMatch(block, /pointerEvents:\s*'auto'/);
  assert.match(block, /pointerEvents:\s*'none'/);
  assert.match(block, /Caricamento attività\.\.\./);
});
