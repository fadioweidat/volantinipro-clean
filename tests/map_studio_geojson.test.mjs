// Studio Mappa — export / import GeoJSON. Round-trip che PRESERVA
// project metadata + operatorId/operatorName + style + source + geometry.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProject, createOperator, createFeature } from '../src/pages/admin/map-studio/mapStudioProject.js';
import {
  exportProjectToGeoJson,
  exportProjectToGeoJsonString,
  importProjectFromGeoJson,
} from '../src/pages/admin/map-studio/mapStudioGeoJson.js';

function sampleProject() {
  const p = createProject({
    name: 'Bergamo Demo',
    municipality: 'Bergamo',
    province: 'BG',
    region: 'Lombardia',
    boundary: { type: 'Polygon', coordinates: [[[9.6, 45.68], [9.72, 45.68], [9.72, 45.72], [9.6, 45.72], [9.6, 45.68]]] },
    center: [45.70, 9.66],
    operators: [createOperator({ index: 0, name: 'Op Blu' }), createOperator({ index: 1, name: 'Op Verde' })],
  });
  p.operators[0].style.lineWidth = 6;
  p.operators[0].style.lineStyle = 'dash';
  p.features.push(createFeature({ operatorId: p.operators[0].id, type: 'line', source: 'auto', geometry: [[45.69, 9.67], [45.70, 9.68], [45.71, 9.69]] }));
  p.features.push(createFeature({ operatorId: p.operators[1].id, type: 'polygon', source: 'manual', geometry: [[45.69, 9.61], [45.70, 9.61], [45.70, 9.63]] }));
  p.features.push(createFeature({ operatorId: p.operators[1].id, type: 'point', source: 'manual', geometry: [45.705, 9.655] }));
  return p;
}

test('export: FeatureCollection con metadata progetto + operatori', () => {
  const fc = exportProjectToGeoJson(sampleProject());
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.properties.project.name, 'Bergamo Demo');
  assert.equal(fc.properties.project.municipality, 'Bergamo');
  assert.ok(fc.properties.project.boundary);
  assert.equal(fc.properties.operators.length, 2);
  assert.equal(fc.features.length, 3);
  // GeoJSON usa [lng,lat]
  assert.deepEqual(fc.features[0].geometry.coordinates[0], [9.67, 45.69]);
  assert.equal(fc.features[0].properties.operatorName, 'Op Blu');
  assert.equal(fc.features[0].properties.source, 'auto');
});

test('T9 — round-trip export→import: geometrie / operatori / style / source identici', () => {
  const p = sampleProject();
  const roundtrip = importProjectFromGeoJson(exportProjectToGeoJsonString(p), { regenerateIds: false });
  assert.equal(roundtrip.ok, true);
  const q = roundtrip.project;

  assert.equal(q.name, p.name);
  assert.equal(q.municipality, p.municipality);
  assert.deepEqual(q.center, p.center);
  assert.ok(q.boundary && q.boundary.type === 'Polygon');

  assert.equal(q.operators.length, 2);
  assert.equal(q.operators[0].name, 'Op Blu');
  assert.equal(q.operators[0].style.lineWidth, 6);
  assert.equal(q.operators[0].style.lineStyle, 'dash');

  assert.equal(q.features.length, 3);
  const line = q.features.find((f) => f.type === 'line');
  assert.equal(line.source, 'auto');
  assert.equal(line.operatorId, q.operators[0].id);
  assert.deepEqual(line.geometry, [[45.69, 9.67], [45.70, 9.68], [45.71, 9.69]]);

  const poly = q.features.find((f) => f.type === 'polygon');
  assert.equal(poly.geometry.length >= 3, true);
  const pt = q.features.find((f) => f.type === 'point');
  assert.deepEqual(pt.geometry, [45.705, 9.655]);
});

test('import GeoJSON generico (no metadata): crea operatore "Importato"', () => {
  const generic = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[9.1, 45.1], [9.2, 45.2]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[9.3, 45.3], [9.4, 45.4]], [[9.5, 45.5], [9.6, 45.6]]] } },
    ],
  };
  const res = importProjectFromGeoJson(generic);
  assert.equal(res.ok, true);
  assert.equal(res.native, false);
  assert.equal(res.project.operators[0].name, 'Importato');
  assert.equal(res.project.features.length, 3, 'MultiLineString → 2 linee + 1 = 3');
  assert.ok(res.project.features.every((f) => f.type === 'line'));
});

test('import robusto: input non-FeatureCollection → errore, nessun crash', () => {
  assert.equal(importProjectFromGeoJson('{"type":"Point"}').ok, false);
  assert.equal(importProjectFromGeoJson('not json').ok, false);
  assert.equal(importProjectFromGeoJson(null).ok, false);
});
