import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TR from 'react-test-renderer';
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
test('Milano-only guidance: Varedo hidden, operational Municipio disabled, preview initially closed (dentro accordion avanzato)', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  const previousActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const { MilanoGuidance } = await vite.ssrLoadModule('/src/pages/public/configurator/step2/MilanoGuidance.jsx');
    const Preview = (await vite.ssrLoadModule('/src/pages/public/configurator/step2/TerritoryGeometryPreview.jsx')).default;
    const render = props => renderToStaticMarkup(React.createElement(MilanoGuidance, props));
    assert.equal(render({ visible: false }), '');
    const html = render({ visible: true });
    // Dal flusso guidato Milano l'anteprima Municipi sta nell'accordion "dettagli avanzati", chiuso di default.
    assert.match(html, /Mostra dettagli avanzati \(Municipio, confini\)/);
    assert.doesNotMatch(html, /Nascondi dettagli avanzati/);
    assert.doesNotMatch(html, /Visualizza Municipi 1–9/);
    assert.doesNotMatch(html, /data-testid="municipi-preview"/);
    // Il Municipio operativo resta disabilitato.
    assert.match(html, /disabled="" title="Suddivisione per Municipio/);

    // Controllo positivo: il componente di anteprima, una volta montato, ha il trigger chiuso e nessun pannello.
    const previewHtml = renderToStaticMarkup(React.createElement(Preview));
    assert.match(previewHtml, /<button type="button" aria-expanded="false"[^>]*>Visualizza Municipi 1–9<\/button>/);
    assert.doesNotMatch(previewHtml, /data-testid="municipi-preview"/);

    // Espansione reale dell'accordion (solo toggle: NON si clicca il trigger dell'anteprima, che avvierebbe il fetch GeoJSON).
    const txt = n => (typeof n === 'string' ? n : n.children.map(txt).join(''));
    let renderer;
    TR.act(() => { renderer = TR.create(React.createElement(MilanoGuidance, { visible: true })); });
    const buttons = () => renderer.root.findAll(n => n.type === 'button');
    TR.act(() => { buttons().find(b => txt(b).includes('Mostra dettagli avanzati')).props.onClick(); });
    const expanded = JSON.stringify(renderer.toJSON());
    assert.ok(expanded.includes('Visualizza Municipi 1–9') && expanded.includes('Nascondi dettagli avanzati'), 'anteprima montata dopo l espansione');
    assert.ok(!expanded.includes('municipi-preview'), 'il pannello resta chiuso finche non si clicca il trigger');
    TR.act(() => { buttons().find(b => txt(b).includes('Nascondi dettagli avanzati')).props.onClick(); });
    assert.ok(!JSON.stringify(renderer.toJSON()).includes('Visualizza Municipi'), 'richiudendo l accordion l anteprima sparisce');
  } finally {
    if (previousActEnv === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT; else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnv;
    await vite.close();
  }
});
