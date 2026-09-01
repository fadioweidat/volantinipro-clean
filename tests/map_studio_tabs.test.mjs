// Studio Mappa — mapping tab → pannello (bug "tab Operatori mostra strumenti
// Manuali"). Contratto sorgente su MapStudioPage + render reale di
// OperatorsPanel (nessuna dipendenza leaflet).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

const PAGE = readFileSync(new URL('../src/pages/admin/map-studio/MapStudioPage.jsx', import.meta.url), 'utf8');

// ── contratto sorgente: mapping 1:1, toolbar solo su Manuale ──────────
test('MapStudioPage: renderActivePanel mappa OGNI tab a un solo pannello', () => {
  const fn = PAGE.slice(PAGE.indexOf('function renderActivePanel()'), PAGE.indexOf('return (\n    <AdminLayout'));
  const pairs = [
    ["case 'project':", 'MapStudioProjectPanel'],
    ["case 'operators':", 'OperatorsPanel'],
    ["case 'design':", 'OperatorStylePanel'],
    ["case 'manual':", 'ManualToolsPanel'],
    ["case 'auto':", 'AutoCoveragePanel'],
    ["case 'layers':", 'LayersPanel'],
    ["case 'kpi':", 'KpiPanel'],
    ["case 'sim':", 'SimulationPanel'],
  ];
  for (const [caseStr, panel] of pairs) {
    const i = fn.indexOf(caseStr);
    assert.ok(i >= 0, `manca ${caseStr}`);
    const seg = fn.slice(i, i + 400);
    assert.match(seg, new RegExp(`<${panel}\\b`), `${caseStr} deve rendere <${panel}>`);
  }
});

test('MapStudioPage: il tab operators rende SOLO OperatorsPanel (mai ManualToolsPanel)', () => {
  const fn = PAGE.slice(PAGE.indexOf("case 'operators':"), PAGE.indexOf("case 'design':"));
  assert.match(fn, /<OperatorsPanel\b/);
  assert.doesNotMatch(fn, /<ManualToolsPanel\b/);
  assert.doesNotMatch(fn, /<MapStudioToolbar\b/);
});

test('MapStudioPage: MapStudioToolbar montata SOLO nel tab manual, non sempre', () => {
  // niente <MapStudioToolbar ...> senza la guardia tab === 'manual'
  assert.doesNotMatch(PAGE, /\n\s*<MapStudioToolbar drawing=\{drawing\} history=\{store\.history\} \/>\n\s*\n\s*\{tab/); // vecchio pattern "sempre montato"
  assert.match(PAGE, /\{tab === 'manual' && <MapStudioToolbar drawing=\{drawing\} history=\{store\.history\} \/>\}/);
  // una sola occorrenza del componente
  assert.equal((PAGE.match(/<MapStudioToolbar\b/g) || []).length, 1);
  // e nessuna chain "{tab === '...' && <Panel" residua (tutto passa da renderActivePanel)
  assert.doesNotMatch(PAGE, /\{tab === 'operators' && </);
  assert.doesNotMatch(PAGE, /\{tab === 'project' && </);
});

// ── render reale di OperatorsPanel (4 operatori, click, colori) ──────
const { OperatorsPanel } = await import('../src/pages/admin/map-studio/OperatorsPanel.jsx');
const { createProject, createOperator } = await import('../src/pages/admin/map-studio/mapStudioProject.js');

function instText(inst) {
  if (inst == null) return '';
  if (typeof inst === 'string' || typeof inst === 'number') return String(inst);
  return (inst.children || []).map(instText).join('');
}

test('OperatorsPanel: 4 operatori → 4 righe con nome + swatch colore; click "Disegna con" → setActiveOperatorId', () => {
  const project = createProject({
    name: 'T',
    operators: [0, 1, 2, 3].map((i) => createOperator({ index: i, name: `Operatore ${i + 1}` })),
  });
  const calls = [];
  const drawing = { activeOperatorId: project.operators[0].id, setActiveOperatorId: (id) => calls.push(id) };
  const ops = {
    addOperator: () => {}, updateOperator: () => {}, removeOperator: () => {}, reassignColors: () => {},
  };

  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(OperatorsPanel, {
      project, ops, drawing, soloOperatorId: null, setSoloOperatorId: () => {},
    }));
  });

  // titolo "Operatori (4)"
  assert.ok(instText(renderer.root).includes('Operatori (4)'));

  // 4 input nome, con i valori giusti
  const nameInputs = renderer.root.findAllByType('input').filter((n) => typeof n.props.value === 'string' && /Operatore \d/.test(n.props.value));
  assert.equal(nameInputs.length, 4);
  assert.deepEqual(nameInputs.map((n) => n.props.value), ['Operatore 1', 'Operatore 2', 'Operatore 3', 'Operatore 4']);

  // ogni operatore ha uno swatch col suo colore (span con background = op.color)
  const colors = project.operators.map((o) => o.color);
  assert.equal(new Set(colors).size, 4, '4 colori distinti');
  const spans = renderer.root.findAllByType('span').filter((s) => s.props.style && colors.includes(s.props.style.background));
  assert.ok(spans.length >= 4, 'swatch colore per ogni operatore');

  // click "Disegna con" del 3° operatore
  const disegnaBtns = renderer.root.findAllByType('button').filter((b) => /Disegna con|In disegno/.test(instText(b)));
  assert.equal(disegnaBtns.length, 4);
  act(() => { disegnaBtns[2].props.onClick(); });
  assert.deepEqual(calls, [project.operators[2].id], 'setActiveOperatorId chiamato con il 3° operatore');
});
