// Studio Mappa — helper geometrici puri.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  haversineMeters,
  polylineLengthMeters,
  polygonAreaM2,
  pointToPolyline,
  pointToPolylineMeters,
  pointInRing,
  pointInBoundary,
  boundaryCentroid,
  areaOfBoundaryM2,
  moveVertex,
  insertVertexOnSegment,
  deleteVertex,
  splitLineAtVertex,
  splitLineAtPoint,
  joinLines,
  snapPoint,
  brushEraseLine,
  buildSpatialIndex,
  hitTestFeatures,
} from '../src/pages/admin/map-studio/mapStudioGeometry.js';

// linea E–W a lat 45, da lng 9.000 a 9.010 (~785 m), 11 vertici
function ewLine(n = 11, lat = 45, a = 9, b = 9.01) {
  return Array.from({ length: n }, (_, i) => [lat, a + ((b - a) * i) / (n - 1)]);
}

test('haversine + lunghezza: ~785 m per 0.01° lng a lat 45', () => {
  assert.ok(Math.abs(haversineMeters([45, 9], [45, 9.01]) - 786) < 20);
  assert.ok(Math.abs(polylineLengthMeters(ewLine()) - 786) < 20);
  assert.equal(polylineLengthMeters([[45, 9]]), 0);
});

test('area anello: quadrato ~1km lato → ~1 km²', () => {
  const km = 1000 / 111320;
  const ring = [[45, 9], [45 + km, 9], [45 + km, 9 + km / Math.cos(45 * Math.PI / 180)], [45, 9 + km / Math.cos(45 * Math.PI / 180)]];
  const a = polygonAreaM2(ring);
  assert.ok(a > 0.9e6 && a < 1.1e6, `atteso ~1e6 m², ottenuto ${a.toFixed(0)}`);
});

test('pointToPolyline: proiezione su segmento lungo senza vertici interni', () => {
  const seg = [[45, 9], [45, 9.02]];
  const r = pointToPolyline([45.0005, 9.01], seg);
  assert.equal(r.index, 0);
  assert.ok(r.t > 0.49 && r.t < 0.51);
  assert.ok(Math.abs(r.point[1] - 9.01) < 1e-4);
  assert.ok(r.distance > 40 && r.distance < 70, `~55 m atteso, ${r.distance.toFixed(1)}`);
  assert.equal(pointToPolylineMeters([46, 10], seg) > 100000, true);
});

test('pointInRing / pointInBoundary / centroid / area boundary', () => {
  const ring = [[45, 9], [45.1, 9], [45.1, 9.1], [45, 9.1]];
  assert.equal(pointInRing(ring, [45.05, 9.05]), true);
  assert.equal(pointInRing(ring, [46, 9.05]), false);
  const geo = { type: 'Polygon', coordinates: [[[9, 45], [9.1, 45], [9.1, 45.1], [9, 45.1], [9, 45]]] };
  assert.equal(pointInBoundary(geo, [45.05, 9.05]), true);
  assert.equal(pointInBoundary(geo, [45.5, 9.05]), false);
  const c = boundaryCentroid(geo);
  assert.ok(Math.abs(c[0] - 45.05) < 1e-6 && Math.abs(c[1] - 9.05) < 1e-6);
  assert.ok(areaOfBoundaryM2(geo) > 0);
  // nessun confine → nessun vincolo
  assert.equal(pointInBoundary(null, [0, 0]), true);
});

test('move / insert / delete vertex (min 2 punti)', () => {
  const l = ewLine(4);
  assert.deepEqual(moveVertex(l, 1, [45.5, 9.5])[1], [45.5, 9.5]);
  assert.equal(insertVertexOnSegment(l, 0, [45, 9.001]).length, 5);
  assert.equal(deleteVertex(l, 1).length, 3);
  assert.equal(deleteVertex([[45, 9], [45, 9.01]], 0).length, 2, 'non scende sotto 2 punti');
});

test('split al vertice: due meta condividono il vertice', () => {
  const l = ewLine(5);
  const [a, b] = splitLineAtVertex(l, 2);
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);
  assert.deepEqual(a[a.length - 1], b[0]);
  assert.deepEqual(splitLineAtVertex(l, 0), [l], 'split agli estremi = nessuno split');
});

test('split nel punto: inserisce vertice di taglio condiviso', () => {
  const l = [[45, 9], [45, 9.02]];
  const [a, b] = splitLineAtPoint(l, [45.0004, 9.01]);
  assert.equal(a.length, 2);
  assert.equal(b.length, 2);
  assert.deepEqual(a[1], b[0]);
  assert.ok(Math.abs(a[1][1] - 9.01) < 1e-4);
});

test('join: prova tutte le 4 orientazioni, tolleranza rispettata', () => {
  const a = [[45, 9], [45, 9.01]];
  // end→start
  assert.deepEqual(joinLines(a, [[45, 9.01], [45, 9.02]], 5), [[45, 9], [45, 9.01], [45, 9.02]]);
  // end→end (B invertita)
  assert.deepEqual(joinLines(a, [[45, 9.02], [45, 9.01]], 5), [[45, 9], [45, 9.01], [45, 9.02]]);
  // start→end
  assert.deepEqual(joinLines(a, [[45, 8.99], [45, 9]], 5), [[45, 8.99], [45, 9], [45, 9.01]]);
  // non contigue
  assert.equal(joinLines(a, [[45, 9.5], [45, 9.51]], 5), null);
});

test('snapPoint: aggancia entro tolleranza, altrimenti punto invariato', () => {
  const road = [[45, 9], [45, 9.02]];
  const near = snapPoint([45.00005, 9.01], [road], 15); // ~5.5 m dalla strada
  assert.ok(Math.abs(near[0] - 45) < 1e-4, 'agganciato alla strada');
  const far = snapPoint([45.01, 9.01], [road], 15);
  assert.deepEqual(far, [45.01, 9.01], 'troppo lontano: invariato');
  assert.deepEqual(snapPoint([45.01, 9.01], [road], 0), [45.01, 9.01], 'snap off');
});

test('brushEraseLine: fuori → [line], dentro tutto → [], taglio centrale → 2 residui', () => {
  const l = ewLine(21);
  assert.deepEqual(brushEraseLine(l, [46, 10], 25), [l]);
  assert.deepEqual(brushEraseLine(l, [45, 9.005], 5000), []);
  const mid = brushEraseLine(l, [45, 9.005], 120);
  assert.equal(mid.length, 2);
  assert.deepEqual(mid[0][0], [45, 9], 'primo residuo parte dall\'inizio');
  assert.deepEqual(mid[1][mid[1].length - 1], [45, 9.01], 'secondo residuo finisce alla fine');
  for (const seg of mid) assert.ok(seg.length >= 2);
  // taglio su un estremo → 1 residuo accorciato
  const end = brushEraseLine(l, [45, 9.01], 120);
  assert.equal(end.length, 1);
  assert.ok(polylineLengthMeters(end[0]) < polylineLengthMeters(l));
});

test('spatial index + hitTest: risultato identico con e senza indice, mai O(N^2)', () => {
  const features = [];
  for (let i = 0; i < 400; i += 1) {
    features.push({ id: `f${i}`, operatorId: 'op', type: 'line', lines: [ewLine(6, 45 + i * 0.002, 9, 9.01)] });
  }
  const idx = buildSpatialIndex(features);
  const probe = [45 + 137 * 0.002, 9.005];
  const withIdx = hitTestFeatures(features, probe, 30, idx);
  const noIdx = hitTestFeatures(features, probe, 30, null);
  assert.ok(withIdx && noIdx);
  assert.equal(withIdx.featureId, noIdx.featureId);
  assert.equal(withIdx.featureId, 'f137');
  // lontano da tutto → null
  assert.equal(hitTestFeatures(features, [40, 5], 30, idx), null);
});
