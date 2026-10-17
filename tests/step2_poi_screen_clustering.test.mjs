import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterPoiOnScreen } from '../src/lib/map/clusterPoiOnScreen.js';
import { readFileSync } from 'node:fs';
const point = (id, lng, lat = 0) => ({ id, lng, lat, priority: 1, color: 'green', category: 'gym' });
const project = p => ({ x: p.lng, y: p.lat });
test('residential GIS readiness ignores optional sectors while operational services wait', () => {
  const source = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
  const expression = source.match(/const gisLoading = (.*);/)[1];
  const gate = new Function('city', 'apiLoading', 'sectorsLoading', 'poiIsOperationalData', 'poiLoading', `return ${expression};`);
  assert.equal(gate({}, false, true, false, true), false);
  assert.equal(gate({}, true, false, false, false), true);
  assert.equal(gate({}, false, true, true, false), true);
  assert.equal(gate({}, false, false, true, true), true);
  assert.equal(gate(null, true, true, true, true), false);
});
test('nearby points across a cell boundary share one readable bubble', () => {
  const points = [point('a', 43), point('b', 45), point('c', 130)];
  const before = structuredClone(points);
  const result = clusterPoiOnScreen(points, project);
  assert.equal(result.length, 2);
  assert.equal(result[0].count, 2);
  assert.deepEqual(result[0].pois.map(p => p.id), ['a', 'b']);
  assert.equal(result[1].id, 'c');
  assert.deepEqual(points, before);
});
test('zooming in reveals individual points; zooming out groups them', () => {
  const points = [point('a', 0), point('b', 20)];
  assert.equal(clusterPoiOnScreen(points, project).length, 1);
  assert.equal(clusterPoiOnScreen(points, p => ({ x: p.lng * 4, y: p.lat * 4 })).length, 2);
});
test('every source point appears exactly once after multiple centre merges', () => {
  const points = Array.from({ length: 90 }, (_, i) => point(String(i), i % 10 * 19, Math.floor(i / 10) * 19));
  const result = clusterPoiOnScreen(points, project);
  const ids = result.flatMap(r => r.isCluster ? r.pois.map(p => p.id) : [r.id]);
  assert.equal(ids.length, points.length);
  assert.equal(new Set(ids).size, points.length);
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    assert.ok(Math.hypot(result[i].lng-result[j].lng, result[i].lat-result[j].lat) >= 44);
  }
});
