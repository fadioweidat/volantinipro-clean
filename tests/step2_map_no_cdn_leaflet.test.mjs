// TICKET — REGRESSION LEAFLET CDN: Step2Map non deve piu' caricare Leaflet
// (js/css/icone marker) da unpkg.com a runtime. Deve usare il pacchetto npm
// bundlato, come tutti gli altri componenti mappa. Audit statico sorgente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('nessun riferimento runtime a unpkg / CDN Leaflet in Step2Map', () => {
  assert.doesNotMatch(src, /unpkg\.com/);
  assert.doesNotMatch(src, /cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet/);
  // niente iniezione script/link CDN per Leaflet
  assert.doesNotMatch(src, /createElement\(['"]script['"]\)[\s\S]{0,200}leaflet/i);
  assert.doesNotMatch(src, /createElement\(['"]link['"]\)[\s\S]{0,200}leaflet/i);
  assert.doesNotMatch(src, /script\.src\s*=\s*['"]https?:/);
});

test('Leaflet + CSS + icone marker dal pacchetto npm bundlato', () => {
  assert.match(src, /^import L from 'leaflet';/m);
  assert.match(src, /^import 'leaflet\/dist\/leaflet\.css';/m);
  assert.match(src, /import markerIconUrl from 'leaflet\/dist\/images\/marker-icon\.png'/);
  assert.match(src, /import markerIconRetinaUrl from 'leaflet\/dist\/images\/marker-icon-2x\.png'/);
  assert.match(src, /import markerShadowUrl from 'leaflet\/dist\/images\/marker-shadow\.png'/);
  assert.match(src, /iconUrl: markerIconUrl/);
  assert.match(src, /iconRetinaUrl: markerIconRetinaUrl/);
  assert.match(src, /shadowUrl: markerShadowUrl/);
});

test('nessun uso di window.L (Leaflet e\' il modulo importato)', () => {
  assert.doesNotMatch(src, /window\.L\b/);
  assert.doesNotMatch(src, /const L = window\.L/);
  // bonifica di eventuali tag CDN residui da versioni precedenti
  assert.match(src, /getElementById\('vp-leaflet-js'\)\?\.remove\(\)/);
});

test('leaflet e\' una dipendenza npm; nessun tag Leaflet in index.html', () => {
  assert.ok(pkg.dependencies.leaflet, 'leaflet deve essere in dependencies');
  assert.doesNotMatch(index, /leaflet/i);
  assert.doesNotMatch(index, /unpkg\.com/);
});
