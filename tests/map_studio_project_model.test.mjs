// Studio Mappa — modello progetto: factory, normalizzazione, colori stabili.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createProject,
  createOperator,
  createFeature,
  normalizeProject,
  operatorColorForIndex,
  STUDIO_OPERATOR_PALETTE,
  DEFAULT_LAYERS,
} from '../src/pages/admin/map-studio/mapStudioProject.js';

test('createProject: default coerenti, 1 operatore, layers completi, status draft', () => {
  const p = createProject();
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.status, 'draft');
  assert.equal(p.operators.length, 1);
  assert.equal(p.features.length, 0);
  assert.deepEqual(Object.keys(p.layers).sort(), Object.keys(DEFAULT_LAYERS).sort());
  assert.equal(p.auto.operatorId, p.operators[0].id);
  assert.ok(p.createdAt && p.updatedAt);
});

test('colori operatore: deterministici, N > 4 supportati, ciclo su palette', () => {
  const colors = Array.from({ length: 6 }, (_, i) => operatorColorForIndex(i));
  assert.equal(new Set(colors.slice(0, 6)).size, 6, '6 operatori → 6 colori distinti');
  assert.equal(operatorColorForIndex(0), operatorColorForIndex(STUDIO_OPERATOR_PALETTE.length), 'ciclo dopo la palette');
  // 4 operatori virtuali con colori diversi (prova T2)
  const four = [0, 1, 2, 3].map((i) => createOperator({ index: i }));
  assert.equal(new Set(four.map((o) => o.color)).size, 4);
});

test('normalizeProject: colma i campi mancanti, scarta geometrie rotte, rimappa operatorId', () => {
  const raw = {
    name: 'X',
    operators: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    features: [
      { type: 'line', operatorId: 'a', geometry: [[45, 9], [45, 9.01]] },
      { type: 'line', operatorId: 'ghost', geometry: [[45, 9], [45, 9.02]] }, // operatorId inesistente → fallback
      { type: 'line', operatorId: 'b', geometry: [[999, 999]] }, // geometria rotta → scartata
      { type: 'polygon', operatorId: 'b', geometry: [[45, 9], [45.1, 9]] }, // < 3 punti → scartata
    ],
    layers: { boundary: { visible: false, opacity: 2 } },
  };
  const p = normalizeProject(raw);
  assert.equal(p.operators.length, 2);
  assert.equal(p.features.length, 2, 'due feature valide, due scartate');
  assert.equal(p.features[1].operatorId, 'a', 'operatorId fantasma → primo operatore');
  assert.equal(p.layers.boundary.visible, false);
  assert.equal(p.layers.boundary.opacity, 1, 'opacity clampata a [0,1]');
  assert.ok(p.layers.network, 'layer mancanti aggiunti');
});

test('normalizeProject: input non oggetto → null', () => {
  assert.equal(normalizeProject(null), null);
  assert.equal(normalizeProject(42), null);
});

test('createFeature: id stabile, campi obbligatori', () => {
  const f = createFeature({ operatorId: 'op1', type: 'line', geometry: [[45, 9], [45, 9.1]] });
  assert.ok(f.id.startsWith('ft_'));
  assert.equal(f.source, 'manual');
  assert.equal(f.locked, false);
});
