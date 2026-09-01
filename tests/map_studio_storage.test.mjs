// Studio Mappa — persistenza localStorage (save/load/save-as/duplicate/
// rename/archive/list). Polyfill memory-backed di window.localStorage,
// stessa convenzione di tests/driver_white_page_recovery.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
globalThis.window = { localStorage: makeMemoryStorage() };

const {
  newProject, saveProject, loadProject, listProjects, saveProjectAs,
  duplicateProject, renameProject, archiveProject, deleteProject,
  getLastProjectId,
} = await import('../src/pages/admin/map-studio/mapStudioStorage.js');
const { createFeature } = await import('../src/pages/admin/map-studio/mapStudioProject.js');

test('save → load: round-trip identico (geometrie, operatori, layers)', () => {
  const p = newProject({ name: 'Bergamo Demo', municipality: 'Bergamo' });
  p.features.push(createFeature({ operatorId: p.operators[0].id, type: 'line', geometry: [[45.69, 9.67], [45.70, 9.68]] }));
  const res = saveProject(p);
  assert.equal(res.ok, true);
  assert.equal(res.project.status, 'saved');

  const back = loadProject(p.id);
  assert.equal(back.name, 'Bergamo Demo');
  assert.equal(back.municipality, 'Bergamo');
  assert.equal(back.features.length, 1);
  assert.deepEqual(back.features[0].geometry, [[45.69, 9.67], [45.7, 9.68]]);
  assert.equal(getLastProjectId(), p.id);
});

test('listProjects: elenco leggero ordinato per updatedAt desc', () => {
  const a = saveProject(newProject({ name: 'Alpha' })).project;
  const b = saveProject(newProject({ name: 'Beta' })).project;
  const list = listProjects();
  assert.ok(list.length >= 2);
  const ids = list.map((x) => x.id);
  assert.ok(ids.indexOf(b.id) < ids.indexOf(a.id) || list[0].id === b.id);
  assert.equal(typeof list[0].features, 'number');
});

test('saveProjectAs / duplicate: nuovo id, stessa geometria', () => {
  const src = newProject({ name: 'Src', municipality: 'Monza' });
  src.features.push(createFeature({ operatorId: src.operators[0].id, type: 'line', geometry: [[45.58, 9.27], [45.59, 9.28]] }));
  saveProject(src);
  const copy = saveProjectAs(src, 'Src copia').project;
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.name, 'Src copia');
  assert.equal(copy.features.length, 1);
  const dup = duplicateProject(src.id, 'Src dup').project;
  assert.notEqual(dup.id, src.id);
  assert.equal(dup.municipality, 'Monza');
});

test('rename / archive / delete', () => {
  const p = saveProject(newProject({ name: 'Vecchio' })).project;
  assert.equal(renameProject(p.id, 'Nuovo').project.name, 'Nuovo');
  assert.equal(archiveProject(p.id, true).project.status, 'archived');
  assert.equal(archiveProject(p.id, false).project.status, 'saved');
  assert.equal(deleteProject(p.id).ok, true);
  assert.equal(loadProject(p.id), null);
});

test('storage assente: nessun crash, ritorni difensivi', async () => {
  const saved = globalThis.window;
  globalThis.window = undefined;
  // re-import fresco non necessario: le funzioni rileggono safeStorage() ogni volta
  assert.deepEqual(listProjects(), []);
  assert.equal(loadProject('x'), null);
  const r = saveProject(newProject({ name: 'y' }));
  assert.equal(r.ok, false);
  globalThis.window = saved;
});
