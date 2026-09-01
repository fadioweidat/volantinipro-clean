// Studio Mappa — ricerca comune + applicazione al Map Project.
// react-test-renderer + fetch mockato (nessuna rete reale nel runner).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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
  confirm: () => true,
};

// ── fetch Nominatim mockato ────────────────────────────────────────────
const NOMINATIM = {
  bergamo: [{
    place_id: 111, addresstype: 'city', type: 'administrative', class: 'boundary',
    display_name: 'Bergamo, Lombardia, Italia', lat: '45.6949', lon: '9.6699',
    address: { city: 'Bergamo', county: 'Bergamo', state: 'Lombardia', country_code: 'it', 'ISO3166-2-lvl6': 'IT-BG' },
  }],
  milano: [{
    place_id: 222, addresstype: 'city', type: 'administrative', class: 'boundary',
    display_name: 'Milano, Lombardia, Italia', lat: '45.4642', lon: '9.1900',
    address: { city: 'Milano', county: 'Milano', state: 'Lombardia', country_code: 'it', 'ISO3166-2-lvl6': 'IT-MI' },
  }],
  monza: [{
    place_id: 333, addresstype: 'town', type: 'administrative', class: 'boundary',
    display_name: 'Monza, Lombardia, Italia', lat: '45.5845', lon: '9.2744',
    address: { city: 'Monza', county: 'Monza e della Brianza', state: 'Lombardia', country_code: 'it', 'ISO3166-2-lvl6': 'IT-MB' },
  }],
};
globalThis.fetch = async (url) => {
  const u = String(url).toLowerCase();
  let rows = [];
  if (u.includes('nominatim')) {
    if (u.includes('bergamo')) rows = NOMINATIM.bergamo;
    else if (u.includes('milano')) rows = NOMINATIM.milano;
    else if (u.includes('monza')) rows = NOMINATIM.monza;
  }
  return { ok: true, json: async () => rows };
};

const { MunicipalitySearch } = await import('../src/pages/admin/map-studio/MunicipalitySearch.jsx');
const { useMapStudioProject } = await import('../src/pages/admin/map-studio/useMapStudioProject.js');
const { createProject, createOperator, createFeature } = await import('../src/pages/admin/map-studio/mapStudioProject.js');
const { loadProject } = await import('../src/pages/admin/map-studio/mapStudioStorage.js');
const { pointInBoundary } = await import('../src/pages/admin/map-studio/mapStudioGeometry.js');

function instText(inst) {
  if (inst == null) return '';
  if (typeof inst === 'string' || typeof inst === 'number') return String(inst);
  return (inst.children || []).map(instText).join('');
}

test('MunicipalitySearch: digitando "Bergamo" appare il risultato reale; select → onSelect con provincia/coord', async () => {
  const picks = [];
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(MunicipalitySearch, {
      debounceMs: 0,
      onSelect: (s) => picks.push(s),
    }));
  });

  const inputEl = renderer.root.findByProps({ 'aria-label': 'Cerca comune' });
  await act(async () => { inputEl.props.onChange({ target: { value: 'Bergamo' } }); });
  await act(async () => {}); // fa svuotare le microtask del fetch mock

  const buttons = renderer.root.findAllByType('button');
  const bergamoBtn = buttons.find((b) => instText(b).includes('Bergamo') && typeof b.props.onClick === 'function');
  assert.ok(bergamoBtn, 'il dropdown mostra Bergamo');

  await act(async () => { bergamoBtn.props.onClick(); });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].name, 'Bergamo');
  assert.equal(picks[0].province, 'BG', 'provincia dal codice ISO3166-2');
  assert.ok(Math.abs(picks[0].lat - 45.6949) < 1e-3);
  assert.ok(Math.abs(picks[0].lng - 9.6699) < 1e-3);
});

// host per pilotare useMapStudioProject
function Harness({ apiRef, seed }) {
  apiRef.current = useMapStudioProject(seed);
  return null;
}
function mount(seed) {
  const apiRef = { current: null };
  act(() => { TestRenderer.create(React.createElement(Harness, { apiRef, seed })); });
  return apiRef;
}

const bergamoBoundary = { type: 'Polygon', coordinates: [[[9.63, 45.66], [9.72, 45.66], [9.72, 45.73], [9.63, 45.73], [9.63, 45.66]]] };

test('setMunicipality: imposta comune/provincia/regione/center/boundary; center DENTRO il boundary; no Milano', () => {
  const seed = createProject({ name: 'X', operators: [createOperator({ index: 0 })] });
  const api = mount(seed);
  act(() => {
    api.current.ops.setMunicipality({
      name: 'Bergamo', province: 'BG', region: 'Lombardia',
      boundary: bergamoBoundary, center: [45.695, 9.67],
    });
  });
  const p = api.current.project;
  assert.equal(p.municipality, 'Bergamo');
  assert.equal(p.province, 'BG');
  assert.equal(p.region, 'Lombardia');
  assert.ok(p.boundary && p.boundary.type === 'Polygon');
  assert.equal(pointInBoundary(p.boundary, p.center), true, 'center dentro il confine di Bergamo');
  assert.notDeepEqual(p.center, [45.4642, 9.19], 'MAI il centro di Milano');
});

test('cambio comune con geometrie: clearFeatures svuota il vecchio comune; undo ripristina tutto', () => {
  const op = createOperator({ index: 0 });
  const seed = createProject({ name: 'X', municipality: 'Bergamo', operators: [op] });
  seed.features.push(createFeature({ operatorId: op.id, type: 'line', geometry: [[45.69, 9.67], [45.70, 9.68]] }));
  const api = mount(seed);
  assert.equal(api.current.project.features.length, 1);

  act(() => {
    api.current.ops.setMunicipality({ name: 'Milano', province: 'MI', region: 'Lombardia', boundary: null, center: [45.4642, 9.19], clearFeatures: true });
  });
  assert.equal(api.current.project.municipality, 'Milano');
  assert.equal(api.current.project.features.length, 0, 'geometrie del vecchio comune rimosse');

  act(() => { api.current.history.undo(); });
  assert.equal(api.current.project.municipality, 'Bergamo', 'undo ripristina il comune');
  assert.equal(api.current.project.features.length, 1, 'undo ripristina le geometrie');
});

test('Bergamo → Milano → Bergamo: nessuno stato stale (boundary/center sostituiti ogni volta)', () => {
  const seed = createProject({ name: 'X', operators: [createOperator({ index: 0 })] });
  const api = mount(seed);
  const milanoBoundary = { type: 'Polygon', coordinates: [[[9.10, 45.40], [9.28, 45.40], [9.28, 45.53], [9.10, 45.53], [9.10, 45.40]]] };

  act(() => { api.current.ops.setMunicipality({ name: 'Bergamo', province: 'BG', boundary: bergamoBoundary, center: [45.695, 9.67] }); });
  act(() => { api.current.ops.setMunicipality({ name: 'Milano', province: 'MI', boundary: milanoBoundary, center: [45.46, 9.19] }); });
  assert.equal(api.current.project.municipality, 'Milano');
  assert.equal(pointInBoundary(api.current.project.boundary, api.current.project.center), true);
  assert.equal(pointInBoundary(bergamoBoundary, api.current.project.center), false, 'niente residuo di Bergamo');

  act(() => { api.current.ops.setMunicipality({ name: 'Bergamo', province: 'BG', boundary: bergamoBoundary, center: [45.695, 9.67] }); });
  assert.equal(api.current.project.municipality, 'Bergamo');
  assert.equal(pointInBoundary(bergamoBoundary, api.current.project.center), true);
});

test('persistenza: save → reload mantiene comune / provincia / boundary / center', () => {
  const seed = createProject({ name: 'Persist comune', operators: [createOperator({ index: 0 })] });
  const api = mount(seed);
  act(() => { api.current.ops.setMunicipality({ name: 'Monza', province: 'MB', region: 'Lombardia', boundary: bergamoBoundary, center: [45.695, 9.67] }); });
  let id;
  act(() => { id = api.current.persistence.save().project.id; });

  const back = loadProject(id);
  assert.equal(back.municipality, 'Monza');
  assert.equal(back.province, 'MB');
  assert.equal(back.region, 'Lombardia');
  assert.ok(back.boundary && back.boundary.type === 'Polygon');
  assert.deepEqual(back.center, [45.695, 9.67]);
});

test('ProjectPanel: usa MunicipalitySearch e resolveMunicipalityBoundary, nessun fallback Milano', () => {
  const src = readFileSync(new URL('../src/pages/admin/map-studio/ProjectPanel.jsx', import.meta.url), 'utf8');
  assert.match(src, /import \{ MunicipalitySearch \}/);
  assert.match(src, /resolveMunicipalityBoundary\(sel\.name, \{ lat: sel\.lat, lng: sel\.lng \}\)/);
  assert.match(src, /Cambiando comune verranno rimosse le geometrie/);
  assert.match(src, /Confine non disponibile/);
  assert.doesNotMatch(src, /45\.4642|9\.19\b/, 'nessuna coordinata Milano hard-coded');
});
