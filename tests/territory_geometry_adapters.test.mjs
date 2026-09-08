import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { normalizeMilanoMunicipi, loadMilanoMunicipi, MUNICIPI_ATTRIBUTION } from '../src/lib/geo/territories/municipioMilano.js';
import { InvalidTerritoryGeometry } from '../src/lib/geo/territories/territoryTypes.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataset = JSON.parse(read('public/data/territories/milano-municipi-ds379.geojson'));
const records = normalizeMilanoMunicipi(dataset);
test('DS379: exactly nine unique Municipi, including 1, 4 and 9', () => {
  assert.equal(records.length, 9);
  assert.equal(new Set(records.map(r => r.id)).size, 9);
  assert.deepEqual(records.map(r => r.number), [1,2,3,4,5,6,7,8,9]);
  for (const number of [1,4,9]) assert.equal(records.find(r => r.number === number).name, `Municipio ${number}`);
});
test('all original geometries preserved; nonempty rings, bbox, centroid and area valid', () => {
  for (const r of records) {
    assert.equal(r.geometry, dataset.features.find(f => f.properties.MUNICIPIO === r.number).geometry);
    assert.ok(r.bbox.every(Number.isFinite));
    assert.ok(r.bbox[0] < r.bbox[2] && r.bbox[1] < r.bbox[3]);
    assert.ok(r.centroid[0] >= r.bbox[0] && r.centroid[0] <= r.bbox[2]);
    assert.ok(r.centroid[1] >= r.bbox[1] && r.centroid[1] <= r.bbox[3]);
    assert.ok(r.areaKm2 > 0);
    assert.equal(r.attribution, MUNICIPI_ATTRIBUTION);
    assert.equal(r.source.license, 'CC BY 4.0');
    for (const field of ['families','population','recommendedQuantity','coveragePct']) assert.equal(r[field], undefined);
  }
});
test('invalid counts, duplicate ids, CRS, empty/unclosed/NaN/reversed geometry rejected', () => {
  for (const mutate of [
    d => d.features.pop(),
    d => { d.features[0].properties.MUNICIPIO = d.features[1].properties.MUNICIPIO; },
    d => { d.crs.properties.name = 'EPSG:3857'; },
    d => { d.features[0].geometry.type = 'Point'; },
    d => { d.features[0].geometry.coordinates = []; },
    d => { d.features[0].geometry.coordinates[0].pop(); },
    d => { d.features[0].geometry.coordinates[0][0][0] = NaN; },
    d => { d.features[0].geometry.coordinates[0][0].reverse(); },
  ]) { const copy = structuredClone(dataset); mutate(copy); assert.throws(() => normalizeMilanoMunicipi(copy), InvalidTerritoryGeometry); }
});
test('loader rejects failures, propagates cancellation/timeout and caches only success', async () => {
  await assert.rejects(loadMilanoMunicipi({ fetchImpl: async () => ({ ok: false }) }));
  const aborter = new AbortController(); aborter.abort();
  await assert.rejects(loadMilanoMunicipi({ signal: aborter.signal }), { name: 'AbortError' });
  await assert.rejects(loadMilanoMunicipi({ timeoutMs: 5, fetchImpl: async (_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')))) }), { name: 'AbortError' });
  let calls = 0;
  const fetchImpl = async (_, options) => { calls++; assert.equal(options.cache, 'force-cache'); return { ok: true, json: async () => dataset }; };
  const first = await loadMilanoMunicipi({ fetchImpl });
  assert.equal(await loadMilanoMunicipi({ fetchImpl }), first);
  assert.equal(calls, 1);
});
test('adapter and preview cannot access campaign state or business services', () => {
  for (const path of ['src/lib/geo/territories/municipioMilano.js','src/lib/geo/territories/territoryTypes.js','src/pages/public/configurator/step2/TerritoryGeometryPreview.jsx']) {
    const source = read(path);
    assert.doesNotMatch(source, /useServiceAnalysis|analysis-istat|pricing|supabase|setData|setSelectedCaps|setNilManualMode|campaignZones|onNext|Step2Map/);
  }
  const preview = read('src/pages/public/configurator/step2/TerritoryGeometryPreview.jsx');
  assert.match(preview, /function TerritoryGeometryPreview\(\{ focusRequest = null \}\)/);
  assert.match(preview, /Dati demografici non ancora disponibili/);
});
test('Milano-only guidance: Varedo hidden, operational Municipio disabled, preview initially closed', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const { MilanoGuidance } = await vite.ssrLoadModule('/src/pages/public/configurator/step2/MilanoGuidance.jsx');
    const render = props => renderToStaticMarkup(React.createElement(MilanoGuidance, props));
    assert.equal(render({ visible: false }), '');
    const html = render({ visible: true });
    assert.match(html, /Visualizza Municipi 1–9/);
    assert.match(html, /disabled="" title="Suddivisione per Municipio/);
    assert.doesNotMatch(html, /data-testid="municipi-preview"/);
  } finally { await vite.close(); }
});
