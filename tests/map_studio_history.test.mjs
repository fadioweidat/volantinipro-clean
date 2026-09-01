// Studio Mappa — undo / redo (T6) + persistenza (T4) via react-test-renderer.
// Polyfill memory-backed di window.localStorage, come
// tests/driver_white_page_recovery.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
globalThis.window = {
  localStorage: makeMemoryStorage(),
  setTimeout: (fn) => 0,
  clearTimeout: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { useMapStudioProject } = await import('../src/pages/admin/map-studio/useMapStudioProject.js');
const { createProject, createOperator, createFeature } = await import('../src/pages/admin/map-studio/mapStudioProject.js');
const { loadProject } = await import('../src/pages/admin/map-studio/mapStudioStorage.js');

// host component che espone l'API dell'hook a un ref esterno
function Harness({ apiRef, seed }) {
  const api = useMapStudioProject(seed);
  apiRef.current = api;
  return null;
}

function mount(seed) {
  const apiRef = { current: null };
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness, { apiRef, seed }));
  });
  return { apiRef, renderer };
}

test('T6 — undo torna prima della modifica, redo la riapplica', () => {
  const seed = createProject({ name: 'History', operators: [createOperator({ index: 0 })] });
  const { apiRef } = mount(seed);

  assert.equal(apiRef.current.project.features.length, 0);

  act(() => { apiRef.current.ops.addFeature({ operatorId: seed.operators[0].id, type: 'line', geometry: [[45, 9], [45, 9.01]] }); });
  assert.equal(apiRef.current.project.features.length, 1);
  assert.equal(apiRef.current.history.canUndo, true);

  act(() => { apiRef.current.history.undo(); });
  assert.equal(apiRef.current.project.features.length, 0, 'undo → torna a 0 elementi');
  assert.equal(apiRef.current.history.canRedo, true);

  act(() => { apiRef.current.history.redo(); });
  assert.equal(apiRef.current.project.features.length, 1, 'redo → 1 elemento');
});

test('T5+T6 — gomma parziale poi undo: sequenza split → undo ripristina la linea intera', () => {
  const op = createOperator({ index: 0 });
  const seed = createProject({ name: 'Erase', operators: [op] });
  seed.features.push(createFeature({ operatorId: op.id, type: 'line', geometry: [
    [45, 9.0], [45, 9.002], [45, 9.004], [45, 9.006], [45, 9.008], [45, 9.01],
  ] }));
  const { apiRef } = mount(seed);
  assert.equal(apiRef.current.project.features.length, 1);
  const srcId = apiRef.current.project.features[0].id;

  // replaceFeature simula l'esito della gomma parziale (2 residui)
  act(() => {
    apiRef.current.ops.replaceFeature(srcId, [
      { operatorId: op.id, type: 'line', source: 'manual', geometry: [[45, 9.0], [45, 9.002]] },
      { operatorId: op.id, type: 'line', source: 'manual', geometry: [[45, 9.008], [45, 9.01]] },
    ], 'erase', 'Gomma parziale');
  });
  assert.equal(apiRef.current.project.features.length, 2, 'linea spezzata in 2 residui');

  act(() => { apiRef.current.history.undo(); });
  assert.equal(apiRef.current.project.features.length, 1, 'undo → linea intera ripristinata');
  assert.equal(apiRef.current.project.features[0].geometry.length, 6);
});

test('T4 — save poi reload da storage: progetto identico', () => {
  const op = createOperator({ index: 0, name: 'Blu' });
  const seed = createProject({ name: 'Persist', municipality: 'Bergamo', operators: [op] });
  const { apiRef } = mount(seed);
  act(() => { apiRef.current.ops.addFeature({ operatorId: op.id, type: 'line', geometry: [[45.69, 9.67], [45.70, 9.68]] }); });

  let savedId;
  act(() => { const r = apiRef.current.persistence.save(); savedId = r.project.id; });
  assert.ok(savedId);
  assert.equal(apiRef.current.dirty, false, 'salvato → non piu\' dirty');

  const reloaded = loadProject(savedId);
  assert.equal(reloaded.name, 'Persist');
  assert.equal(reloaded.municipality, 'Bergamo');
  assert.equal(reloaded.features.length, 1);
  assert.deepEqual(reloaded.features[0].geometry, [[45.69, 9.67], [45.7, 9.68]]);
  assert.equal(reloaded.operators[0].name, 'Blu');
});

test('T2 — 4+ operatori, colori distinti, persistiti al reload', () => {
  const seed = createProject({ name: 'Ops', operators: [createOperator({ index: 0 })] });
  const { apiRef } = mount(seed);
  act(() => { apiRef.current.ops.addOperator({}); });
  act(() => { apiRef.current.ops.addOperator({}); });
  act(() => { apiRef.current.ops.addOperator({}); });
  assert.equal(apiRef.current.project.operators.length, 4);
  const colors = apiRef.current.project.operators.map((o) => o.color);
  assert.equal(new Set(colors).size, 4, '4 colori distinti');

  let id;
  act(() => { id = apiRef.current.persistence.save().project.id; });
  const back = loadProject(id);
  assert.deepEqual(back.operators.map((o) => o.color), colors, 'colori stabili dopo reload');
});
