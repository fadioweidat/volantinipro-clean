// Studio Mappa — T10 smoke performance con 2500 linee.
// Misura: build indice spaziale, hit-test singolo, KPI, snapshot undo/redo.
// Nessuna asserzione fragile su millisecondi assoluti: si verifica solo che
// resti nell'ordine "interattivo" (< soglie larghe) e che NON sia O(N^2).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProject, createOperator, createFeature } from '../src/pages/admin/map-studio/mapStudioProject.js';
import { buildSpatialIndex, hitTestFeatures } from '../src/pages/admin/map-studio/mapStudioGeometry.js';
import { computeKpi } from '../src/pages/admin/map-studio/mapStudioKpi.js';
import { snapshotOf, applySnapshot } from '../src/pages/admin/map-studio/useMapStudioHistory.js';

function bigProject(nLines = 2500) {
  const ops = Array.from({ length: 6 }, (_, i) => createOperator({ index: i }));
  const p = createProject({
    name: 'PERF',
    municipality: 'Big',
    boundary: { type: 'Polygon', coordinates: [[[9, 45], [9.5, 45], [9.5, 45.5], [9, 45.5], [9, 45]]] },
    operators: ops,
  });
  for (let i = 0; i < nLines; i += 1) {
    const lat = 45 + (i % 400) * 0.001;
    const lng = 9 + Math.floor(i / 400) * 0.02;
    p.features.push(createFeature({
      operatorId: ops[i % 6].id,
      type: 'line',
      source: i % 3 === 0 ? 'auto' : 'manual',
      geometry: [[lat, lng], [lat + 0.0005, lng + 0.004], [lat + 0.001, lng + 0.008]],
    }));
  }
  return p;
}

test('T10 — 2500 linee: build indice + 200 hit-test + KPI + undo entro limiti interattivi', () => {
  const p = bigProject(2500);
  assert.equal(p.features.length, 2500);

  const shapes = p.features.map((f) => ({ id: f.id, operatorId: f.operatorId, type: 'line', lines: [f.geometry] }));

  const t0 = performance.now();
  const index = buildSpatialIndex(shapes);
  const tIndex = performance.now() - t0;

  const t1 = performance.now();
  let hits = 0;
  for (let k = 0; k < 200; k += 1) {
    const lat = 45 + (k % 400) * 0.001 + 0.0005;
    const lng = 9 + Math.floor((k * 7) % 6) * 0.02 + 0.004;
    if (hitTestFeatures(shapes, [lat, lng], 30, index)) hits += 1;
  }
  const tHit = performance.now() - t1;

  const t2 = performance.now();
  const kpi = computeKpi(p, { totalNetworkM: 500000, selectedNetworkM: 400000, networkPercentLabel: '80% della rete stradale selezionata' });
  const tKpi = performance.now() - t2;

  const t3 = performance.now();
  const snap = snapshotOf(p);
  const reverted = applySnapshot({ ...p, features: [] }, snap);
  const tSnap = performance.now() - t3;

  // limiti larghi: l'obiettivo e' escludere regressioni O(N^2) / freeze.
  assert.ok(tIndex < 800, `build index ${tIndex.toFixed(0)}ms`);
  assert.ok(tHit < 500, `200 hit-test ${tHit.toFixed(0)}ms`);
  assert.ok(tKpi < 3000, `KPI ${tKpi.toFixed(0)}ms`);
  assert.ok(tSnap < 50, `snapshot+apply ${tSnap.toFixed(0)}ms`);
  assert.equal(reverted.features.length, 2500, 'undo ripristina tutte le 2500 linee');
  assert.ok(hits > 0, 'almeno qualche hit-test centra una linea');
  assert.equal(kpi.counts.lines, 2500);

  // eslint-disable-next-line no-console
  console.log(`[map-studio perf] index=${tIndex.toFixed(0)}ms hit200=${tHit.toFixed(0)}ms kpi=${tKpi.toFixed(0)}ms snap=${tSnap.toFixed(0)}ms`);
});

test('hit-test con indice NON degrada linearmente col numero di feature (no O(N^2))', () => {
  const mk = (n) => {
    const p = bigProject(n);
    return p.features.map((f) => ({ id: f.id, operatorId: f.operatorId, type: 'line', lines: [f.geometry] }));
  };
  const probe = [45.2005, 9.104];
  const bench = (shapes) => {
    const idx = buildSpatialIndex(shapes);
    const s = performance.now();
    for (let k = 0; k < 300; k += 1) hitTestFeatures(shapes, probe, 30, idx);
    return performance.now() - s;
  };
  const small = bench(mk(500));
  const big = bench(mk(2500));
  // 5x i dati NON deve costare ~25x (O(N^2)); tolleranza ampia per rumore CI.
  assert.ok(big < small * 8 + 50, `500→${small.toFixed(1)}ms  2500→${big.toFixed(1)}ms`);
});
