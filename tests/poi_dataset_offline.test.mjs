// Dataset POI OpenStreetMap preparato offline (2026-11-03).
// Verifiche senza rete e senza il dataset reale (fixture costruita qui):
//  - stessa semantica della query Overpass: tag, raggio, ordine nodi/way, cap;
//  - copertura: solo celle "in" -> risposta; confine/assente -> Overpass;
//  - zero reale (cella "in" vuota) distinto da "fuori copertura";
//  - aggiornamento atomico: hash o contenuto errati -> si tiene la versione
//    precedente, senza dataset valido si torna a Overpass;
//  - handler: risposta "osm_dataset" con la data OSM, nessuna chiamata Overpass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';

import { cellsForCircle, queryPoiDataset, validatePoiBundle } from '../src/lib/poi/poiDataset.js';
import { createPoiDatasetLoader, decodePoiDataset } from '../api/_lib/poiDatasetLoader.ts';
import { createPoiSearchHandler } from '../api/poi-search.ts';
import { getServiceTargetTags } from '../supabase/functions/_shared/poiSearchProxy.ts';

const CELL = 0.05;
const C = { lat: 45.5287, lng: 9.1709 };
const key = (lat, lng) => `${Math.floor(lng / CELL)}_${Math.floor(lat / CELL)}`;

// Fixture: POI veri nella forma del builder [id, lat, lon, tags].
const rows = {
  n: [
    [30, C.lat + 0.001, C.lng, { amenity: 'pharmacy', name: 'Farmacia A' }],
    [10, C.lat, C.lng + 0.001, { shop: 'supermarket', name: 'Super B' }],
    [20, C.lat + 0.05, C.lng, { amenity: 'pharmacy', name: 'Lontana 5.5 km' }],
    [40, C.lat, C.lng - 0.001, { shop: 'tobacco', name: 'Tabacchi (solo b2b)' }],
  ],
  w: [[5, C.lat - 0.001, C.lng, { amenity: 'school', name: 'Scuola C' }]],
};

function buildDataset({ statusOf = () => 'in', version = '2026-11-02' } = {}) {
  const cells = {};
  for (const kind of ['n', 'w']) {
    for (const row of rows[kind]) {
      const k = key(row[1], row[2]);
      cells[k] = cells[k] || { n: [], w: [] };
      cells[k][kind].push(row);
    }
  }
  for (const cell of Object.values(cells)) { cell.n.sort((a, b) => a[0] - b[0]); cell.w.sort((a, b) => a[0] - b[0]); }
  const manifestCells = {};
  // Tutta la zona attorno al centro: celle "in", vuote dove non ci sono POI.
  for (const k of cellsForCircle({ centerLat: C.lat, centerLng: C.lng, radiusKm: 8 }, CELL)) {
    manifestCells[k] = { s: statusOf(k), n: cells[k]?.n.length || 0, w: cells[k]?.w.length || 0 };
  }
  const bundle = { version, cellDeg: CELL, cells };
  const gz = gzipSync(Buffer.from(JSON.stringify(bundle)));
  const manifest = { schema: 1, version, osmTimestamp: '2026-11-02T21:21:26Z', cellDeg: CELL, cells: manifestCells,
    bundle: { file: 'poi-lombardia.json.gz', bytes: gz.length, sha256: createHash('sha256').update(gz).digest('hex') } };
  return { manifest, bundle, gz };
}

const D2D_TAGS = getServiceTargetTags('d2d', []);

test('query: tag del servizio, raggio, nodi per id poi way, nessun POI inventato', () => {
  const { manifest, bundle } = buildDataset();
  const r = queryPoiDataset({ manifest, cells: bundle.cells }, { centerLat: C.lat, centerLng: C.lng, radiusKm: 2, tags: D2D_TAGS, cap: 80 });
  assert.equal(r.covered, true);
  assert.deepEqual(r.elements.map((e) => `${e.type}/${e.id}`), ['node/10', 'node/30', 'way/5'],
    'tabacchi esclusi (non d2d), farmacia a 5.5 km esclusa, ordine come Overpass');
  assert.deepEqual(r.elements[2].center, { lat: C.lat - 0.001, lon: C.lng }, 'way in forma `out center`');
  assert.equal(r.elements[0].lat, C.lat);
});

test('query: cap come `out center <n>` (primi n nell\'ordine Overpass)', () => {
  const { manifest, bundle } = buildDataset();
  const r = queryPoiDataset({ manifest, cells: bundle.cells }, { centerLat: C.lat, centerLng: C.lng, radiusKm: 2, tags: D2D_TAGS, cap: 2 });
  assert.deepEqual(r.elements.map((e) => e.id), [10, 30]);
});

test('query: Business vede i tabacchi, Hand to Hand le scuole', () => {
  const { manifest, bundle } = buildDataset();
  const ds = { manifest, cells: bundle.cells };
  const b2b = queryPoiDataset(ds, { centerLat: C.lat, centerLng: C.lng, radiusKm: 2, tags: getServiceTargetTags('b2b', []), cap: 150 });
  assert.ok(b2b.elements.some((e) => e.id === 40));
  const h2h = queryPoiDataset(ds, { centerLat: C.lat, centerLng: C.lng, radiusKm: 2, tags: getServiceTargetTags('h2h', ['scuole']), cap: 150 });
  assert.deepEqual(h2h.elements.map((e) => e.id), [5]);
});

test('zero reale: celle "in" senza POI -> covered con elements []', () => {
  const { manifest, bundle } = buildDataset();
  const far = { centerLat: C.lat + 0.03, centerLng: C.lng + 0.04, radiusKm: 0.5 };
  const r = queryPoiDataset({ manifest, cells: bundle.cells }, { ...far, tags: D2D_TAGS, cap: 80 });
  assert.equal(r.covered, true);
  assert.deepEqual(r.elements, []);
});

test('copertura: cella di confine o fuori dataset -> non autorevole (mai zero falso)', () => {
  const border = buildDataset({ statusOf: (k) => (k === key(C.lat, C.lng) ? 'border' : 'in') });
  const r1 = queryPoiDataset({ manifest: border.manifest, cells: border.bundle.cells }, { centerLat: C.lat, centerLng: C.lng, radiusKm: 2, tags: D2D_TAGS, cap: 80 });
  assert.deepEqual(r1, { covered: false, reason: 'border_cell' });
  const { manifest, bundle } = buildDataset();
  const r2 = queryPoiDataset({ manifest, cells: bundle.cells }, { centerLat: C.lat, centerLng: C.lng, radiusKm: 20, tags: D2D_TAGS, cap: 80 });
  assert.deepEqual(r2, { covered: false, reason: 'outside_dataset' });
});

test('validazione pacchetto: versione o conteggi diversi dal manifest -> rifiutato', () => {
  const { manifest, bundle } = buildDataset();
  assert.equal(validatePoiBundle(manifest, bundle), null);
  assert.equal(validatePoiBundle(manifest, { ...bundle, version: 'altro' }), 'version_mismatch');
  const k = key(C.lat, C.lng);
  const broken = { ...bundle, cells: { ...bundle.cells, [k]: { n: bundle.cells[k].n.slice(1), w: bundle.cells[k].w } } };
  assert.equal(validatePoiBundle(manifest, broken), `cell_${k}`);
});

test('decodifica: hash del pacchetto diverso dal manifest -> errore', () => {
  const { manifest, gz } = buildDataset();
  assert.throws(() => decodePoiDataset(JSON.stringify({ ...manifest, bundle: { ...manifest.bundle, sha256: '0'.repeat(64) } }), gz, 't'), /SHA_MISMATCH/);
  assert.equal(decodePoiDataset(JSON.stringify(manifest), gz, 't').manifest.version, '2026-11-02');
});

test('loader da URL: carica la versione valida, ne rifiuta una corrotta e tiene la precedente', async () => {
  const good = buildDataset({ version: 'v1' });
  const next = buildDataset({ version: 'v2' });
  let serve = good;
  let corrupt = false;
  const logs = [];
  const fetchImpl = async (url) => {
    const body = url.endsWith('manifest.json') ? Buffer.from(JSON.stringify(serve.manifest)) : (corrupt ? Buffer.from('rotto') : serve.gz);
    return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
  };
  const realNow = Date.now;
  try {
    const load = createPoiDatasetLoader({ env: { POI_DATASET_BASE_URL: 'https://example.test/poi' }, fetchImpl, rootDir: mkdtempSync(join(tmpdir(), 'poi-')), log: (p) => logs.push(p) });
    assert.equal((await load()).manifest.version, 'v1');
    serve = next; corrupt = true;
    const t = realNow() + 7 * 3600 * 1000; Date.now = () => t;
    assert.equal((await load()).manifest.version, 'v1', 'v2 corrotta: resta v1');
    assert.ok(logs.some((l) => l.outcome === 'dataset_load_failed' && l.keptVersion === 'v1'));
    corrupt = false;
    const t2 = t + 7 * 3600 * 1000; Date.now = () => t2;
    assert.equal((await load()).manifest.version, 'v2', 'v2 valida: sostituisce v1');
  } finally {
    Date.now = realNow;
  }
});

test('loader senza fonti: null (il chiamante usa Overpass)', async () => {
  const load = createPoiDatasetLoader({ env: {}, rootDir: mkdtempSync(join(tmpdir(), 'poi-')) });
  assert.equal(await load(), null);
});

test('loader da file inclusi nella funzione (poi-dataset/)', async () => {
  const { manifest, gz } = buildDataset({ version: 'bundled-v' });
  const root = mkdtempSync(join(tmpdir(), 'poi-'));
  mkdirSync(join(root, 'poi-dataset'));
  writeFileSync(join(root, 'poi-dataset', 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'poi-dataset', 'poi-lombardia.json.gz'), gz);
  const ds = await createPoiDatasetLoader({ env: {}, rootDir: root })();
  assert.equal(ds.manifest.version, 'bundled-v');
  assert.equal(ds.origin, 'bundled');
});

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = String(v); return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.end = (b) => { res.body = b; return res; };
  return res;
}
async function call(handler, body) {
  const res = makeRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.4' }, body }, res);
  return JSON.parse(res.body);
}

test('handler: area coperta -> POI dal dataset con data OSM, Overpass non contattato', async () => {
  const { manifest, bundle } = buildDataset();
  const calls = [];
  const handler = createPoiSearchHandler({
    fetchImpl: async (url) => { calls.push(url); throw new Error('non deve essere chiamato'); },
    env: {}, log: () => {},
    getPoiDataset: async () => ({ manifest, cells: bundle.cells, origin: 'test' }),
  });
  const body = await call(handler, { centerLat: C.lat, centerLng: C.lng, radiusKm: 2, serviceType: 'd2d', targetSelection: [] });
  assert.equal(body.source, 'osm_dataset');
  assert.equal(body.fetchedAt, '2026-11-02T21:21:26Z');
  assert.equal(body.datasetVersion, '2026-11-02');
  assert.deepEqual(body.elements.map((e) => e.id), [10, 30, 5]);
  assert.equal(calls.length, 0);
});

test('handler: area fuori copertura -> Overpass come prima', async () => {
  const { manifest, bundle } = buildDataset();
  const calls = [];
  const handler = createPoiSearchHandler({
    fetchImpl: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ elements: [] }), text: async () => '' }; },
    env: {}, log: () => {},
    getPoiDataset: async () => ({ manifest, cells: bundle.cells, origin: 'test' }),
  });
  const body = await call(handler, { centerLat: C.lat, centerLng: C.lng, radiusKm: 20, serviceType: 'd2d', targetSelection: [] });
  assert.equal(body.source, 'live');
  assert.equal(calls.length, 1);
});

test('poi-dataset/ in git contiene solo il README: i dati non finiscono nel repository', () => {
  const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^\/poi-dataset\/\*$/m);
  assert.match(ignore, /^!\/poi-dataset\/README\.md$/m);
  assert.ok(existsSync(new URL('../poi-dataset/README.md', import.meta.url)));
});

test('loader da puntatore current.json: segue la versione indicata', async () => {
  const v = buildDataset({ version: 'v-pointer' });
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    let body;
    if (url === 'https://example.test/index/current.json') body = Buffer.from(JSON.stringify({ version: 'v-pointer', tag: 'poi-dataset-v', base: 'https://example.test/v' }));
    else if (url === 'https://example.test/v/manifest.json') body = Buffer.from(JSON.stringify(v.manifest));
    else if (url === 'https://example.test/v/poi-lombardia.json.gz') body = v.gz;
    else return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
  };
  const ds = await createPoiDatasetLoader({ env: { POI_DATASET_POINTER_URL: 'https://example.test/index/current.json' }, fetchImpl, rootDir: mkdtempSync(join(tmpdir(), 'poi-')) })();
  assert.equal(ds.manifest.version, 'v-pointer');
  assert.deepEqual(seen, ['https://example.test/index/current.json', 'https://example.test/v/manifest.json', 'https://example.test/v/poi-lombardia.json.gz']);
});

test('workflow: release del dataset mai "latest" (releases/latest serve l\'APK del driver)', () => {
  const wf = readFileSync(new URL('../.github/workflows/poi-dataset.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(wf, /--latest(?!=false)/);
  assert.match(wf, /--draft\b[\s\S]*gh release upload[\s\S]*--draft=false --latest=false[\s\S]*current\.json/,
    'bozza -> asset -> pubblica -> puntatore, in questo ordine');
  assert.match(wf, /test "\$expected" = "\$actual"/, 'MD5 dell\'estratto verificato');
});

test('poi-tags.json allineato alle coppie interrogate da poi-search', async () => {
  const { POI_TAGS } = await import('../supabase/functions/_shared/poiSearchProxy.ts');
  const expected = [...new Set(Object.values(POI_TAGS).flat().map(({ key, val }) => `${key}=${val}`))].sort();
  const file = JSON.parse(readFileSync(new URL('../scripts/poi-dataset/poi-tags.json', import.meta.url), 'utf8'));
  assert.deepEqual(file.pairs.map(({ key, val }) => `${key}=${val}`).sort(), expected);
});
