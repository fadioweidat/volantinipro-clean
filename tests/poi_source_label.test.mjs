// Etichetta della fonte POI (2026-11-04): con il dataset offline la fonte e'
// "OpenStreetMap — aggiornamento <data OSM>", non piu' "OpenStreetMap / Overpass".
// Copre popup (poi.source), analisi H2H/Business (sources -> Step 4 -> PDF) e
// tabella fonti di Step 2. Overpass live resta con l'etichetta di sempre.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.VITE_POI_SEARCH_URL = '/api/poi-search';

const { poiSourceLabel, fetchPoisWithFreshness, OVERPASS_SOURCE_LABEL } = await import('../src/lib/services/poi-api.js');
const { fetchPoiAnalysis } = await import('../src/lib/analysis/poiAnalysisAdapter.js');
// dataSources.js legge import.meta.env al caricamento (solo Vite): la sua mappa
// SOURCE_ALIASES e normalizeDataSourceLabel si verificano dal sorgente.
const dataSourcesSrc = readFileSync(new URL('../src/lib/dataSources.js', import.meta.url), 'utf8');
const aliases = dataSourcesSrc.slice(dataSourcesSrc.indexOf('SOURCE_ALIASES'), dataSourcesSrc.indexOf('export function normalizeDataSourceLabel'));
const { mapQuoteDataToPdfModel, generateQuotePdfBytes } = await import('../src/lib/pdf/generateQuotePdf.js');

const OSM_AT = '2026-11-02T21:21:26Z';
const el = (id, tags) => ({ type: 'node', id, lat: 45.53 + id / 1e4, lon: 9.17, tags });
const reply = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const PARAMS = { centerLat: 45.5287, centerLng: 9.1698, radiusKm: 2, serviceType: 'b2b', targetSelection: [] };
const ELEMENTS = [el(1, { amenity: 'pharmacy', name: 'Farmacia A' }), el(2, { amenity: 'cafe', name: 'Bar B' })];

test('etichetta: dataset offline con la data OSM in ora italiana, altrimenti quella di sempre', () => {
  assert.equal(poiSourceLabel({ source: 'osm_dataset', fetchedAt: OSM_AT }), 'OpenStreetMap — aggiornamento 02/11/2026');
  // 23:30 UTC del 2 novembre e' gia' il 3 novembre in Italia.
  assert.equal(poiSourceLabel({ source: 'osm_dataset', fetchedAt: '2026-11-02T23:30:00Z' }), 'OpenStreetMap — aggiornamento 03/11/2026');
  assert.equal(poiSourceLabel({ source: 'live', fetchedAt: OSM_AT }), OVERPASS_SOURCE_LABEL);
  assert.equal(poiSourceLabel({ source: 'cache', fetchedAt: OSM_AT }), OVERPASS_SOURCE_LABEL);
  assert.equal(poiSourceLabel({}), 'OpenStreetMap / Overpass');
  assert.equal(poiSourceLabel({ source: 'osm_dataset', fetchedAt: 'non una data' }), 'OpenStreetMap');
});

test('popup: ogni POI dal dataset porta la fonte datata; da Overpass resta invariata', async () => {
  globalThis.localStorage = undefined;
  globalThis.fetch = reply({ elements: ELEMENTS, source: 'osm_dataset', fetchedAt: OSM_AT, datasetVersion: '2026-11-02' });
  const ds = await fetchPoisWithFreshness(PARAMS);
  assert.equal(ds.sourceLabel, 'OpenStreetMap — aggiornamento 02/11/2026');
  assert.deepEqual([...new Set(ds.pois.map((p) => p.source))], ['OpenStreetMap — aggiornamento 02/11/2026']);

  globalThis.fetch = reply({ elements: ELEMENTS, source: 'live', fetchedAt: '2026-11-04T10:00:00Z' });
  const live = await fetchPoisWithFreshness(PARAMS);
  assert.deepEqual([...new Set(live.pois.map((p) => p.source))], ['OpenStreetMap / Overpass']);
});

test('analisi H2H/Business: sources e provider seguono la fonte reale', async () => {
  globalThis.fetch = reply({ elements: ELEMENTS, source: 'osm_dataset', fetchedAt: OSM_AT });
  const a = await fetchPoiAnalysis({ lat: 45.5287, lng: 9.1698, radiusKm: 2, service: 'b2b' });
  assert.deepEqual(a.sources, ['OpenStreetMap — aggiornamento 02/11/2026']);
  assert.ok(a.metadata.nearby_activities.every((x) => x.provider === 'OpenStreetMap — aggiornamento 02/11/2026'));

  globalThis.fetch = reply({ elements: ELEMENTS, source: 'live', fetchedAt: '2026-11-04T10:00:00Z' });
  const b = await fetchPoiAnalysis({ lat: 45.5287, lng: 9.1698, radiusKm: 2, service: 'b2b' });
  assert.deepEqual(b.sources, ['OpenStreetMap'], 'live: invariato, Step 2 lo mostra come "OpenStreetMap / Overpass"');
  assert.ok(aliases.includes('OpenStreetMap: "OpenStreetMap / Overpass"'), 'alias live invariato');
});

test('Step 2 non riscrive l\'etichetta datata; il PDF la riporta (trattino lungo reso con "-" come ogni testo del PDF)', () => {
  const label = 'OpenStreetMap — aggiornamento 02/11/2026';
  assert.doesNotMatch(aliases, /aggiornamento/, 'nessun alias riscrive l\x27etichetta datata');
  assert.match(dataSourcesSrc, /return SOURCE_ALIASES[source] || source;/);
  const model = mapQuoteDataToPdfModel({ sources: [label, 'ISTAT'] });
  assert.ok(model.sources.includes(label));
  const pdf = Buffer.from(generateQuotePdfBytes({ sources: [label] })).toString('latin1');
  assert.match(pdf, /OpenStreetMap - aggiornamento 02\/11\/2026/);
  assert.doesNotMatch(pdf, /OpenStreetMap \/ Overpass/);
});

test('Step 2: tabella fonti e Business usano l\'etichetta di usePoi, nessun testo fisso', () => {
  const src = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
  assert.match(src, /name: "POI",\s*\n?\s*source: poiSourceLabel,/);
  assert.match(src, /`\$\{poiSourceLabel\} \(tag POI\)`/);
  assert.doesNotMatch(src, /"OpenStreetMap \/ Overpass"/);
});
