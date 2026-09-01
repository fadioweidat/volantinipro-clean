// Studio Mappa — KPI: RETE % e AREA % SEMPRE due metriche separate.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProject, createOperator, createFeature } from '../src/pages/admin/map-studio/mapStudioProject.js';
import { computeKpi, estimateCoveredAreaM2, DEFAULT_KPI_CONFIG } from '../src/pages/admin/map-studio/mapStudioKpi.js';

function projectWithLines() {
  const p = createProject({
    name: 'KPI',
    municipality: 'Testville',
    boundary: { type: 'Polygon', coordinates: [[[9, 45], [9.05, 45], [9.05, 45.05], [9, 45.05], [9, 45]]] },
    operators: [createOperator({ index: 0, name: 'A' }), createOperator({ index: 1, name: 'B' })],
  });
  // 2 linee dentro il confine
  p.features.push(createFeature({ operatorId: p.operators[0].id, type: 'line', source: 'manual', geometry: [[45.01, 9.01], [45.01, 9.03]] }));
  p.features.push(createFeature({ operatorId: p.operators[1].id, type: 'line', source: 'auto', geometry: [[45.02, 9.01], [45.03, 9.02]] }));
  p.features.push(createFeature({ operatorId: p.operators[0].id, type: 'point', source: 'manual', geometry: [45.02, 9.02] }));
  return p;
}

test('RETE % e AREA % sono chiavi DISTINTE, entrambe presenti', () => {
  const kpi = computeKpi(projectWithLines(), null);
  assert.ok('network' in kpi && 'area' in kpi);
  assert.ok('selectedPercent' in kpi.network, 'RETE %');
  assert.ok('coveredPercent' in kpi.area, 'AREA %');
  // senza automatico: RETE % = null, AREA % comunque calcolata
  assert.equal(kpi.network.selectedPercent, null);
  assert.notEqual(kpi.area.coveredPercent, null);
  assert.ok(kpi.area.municipalityKm2 > 0);
  assert.ok(kpi.area.coveredKm2 > 0);
});

test('con risultato automatico: RETE % popolata dai km rete, indipendente da AREA %', () => {
  const p = projectWithLines();
  const network = { totalNetworkM: 100000, selectedNetworkM: 80000, networkPercentLabel: '80% della rete stradale selezionata' };
  const kpi = computeKpi(p, network);
  assert.equal(kpi.network.selectedPercent, 80);
  assert.equal(kpi.network.totalKm, 100);
  assert.equal(kpi.network.selectedKm, 80);
  assert.equal(kpi.network.label, '80% della rete stradale selezionata');
  // AREA % resta la stima areale, non 80
  assert.notEqual(kpi.area.coveredPercent, 80);
});

test('counts + per-operatore + tempo stimato', () => {
  const kpi = computeKpi(projectWithLines(), null);
  assert.equal(kpi.counts.lines, 2);
  assert.equal(kpi.counts.points, 1);
  assert.equal(kpi.counts.operators, 2);
  assert.equal(kpi.perOperator.length, 2);
  assert.ok(kpi.perOperator[0].km >= 0 && kpi.perOperator[1].km >= 0);
  assert.ok(kpi.totalEstimatedHours >= 0);
  assert.ok(kpi.drawnKm > 0);
});

test('estimateCoveredAreaM2: 0 senza linee; >0 e clippata al confine', () => {
  const boundary = { type: 'Polygon', coordinates: [[[9, 45], [9.05, 45], [9.05, 45.05], [9, 45.05], [9, 45]]] };
  assert.equal(estimateCoveredAreaM2([], boundary).areaM2, 0);
  const inside = estimateCoveredAreaM2([[[45.01, 9.01], [45.01, 9.04]]], boundary, DEFAULT_KPI_CONFIG);
  assert.ok(inside.areaM2 > 0);
  // linea totalmente FUORI dal confine → area coperta clippata ~ 0
  const outside = estimateCoveredAreaM2([[[46, 10], [46, 10.04]]], boundary, DEFAULT_KPI_CONFIG);
  assert.equal(outside.areaM2, 0);
});
