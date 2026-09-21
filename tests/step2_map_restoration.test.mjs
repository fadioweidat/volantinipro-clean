import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MilanoTerritorySummary } from '../src/pages/public/configurator/step2/MilanoTerritorySummary.jsx';
import { residentialRows } from '../src/lib/step2/businessZoneHelpers.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const step2 = read('../src/pages/public/configurator/Step2.jsx');

test('Milano client restores canonical map inputs instead of removing unselected polygons', () => {
  assert.match(step2, /mapCoverageZones=\{mapCoverageZones\}/);
  assert.match(step2, /zonesWithCoords=\{zonesWithCoords\}/);
  assert.doesNotMatch(step2, /mapCoverageZones=\{milanoClientView \? \[\]/);
  assert.doesNotMatch(step2, /mapSelectedNils|localSelectedNils/);
  assert.match(step2, /toggleZone=\{toggleNilZoneStable\}/);
  assert.match(step2, /hasUnconfirmedAddressPoint \? allMilanoNilRows\.map\(row => row\.zone\) : zonesInRadius/);
  assert.match(step2, /return nilManualMode \? next : next\.length \? next : base/);
});

test('Radius summary labels the existing family-share metric and exposes intersected NIL names', () => {
  const municipalities = residentialRows([
    {id:'milano',name:'Milano',families:600},
    {id:'bresso',name:'Bresso',families:300},
    {id:'cormano',name:'Cormano',families:100},
  ]);
  const html = renderToStaticMarkup(React.createElement(MilanoTerritorySummary, {
    mode:'radius',hasSelection:true,radiusKm:3,radiusMunicipalities:municipalities,
    radiusNils:[{code:'83',name:'BRUZZANO'},{code:'82',name:'COMASINA'}],
    viewModel:{hasUsableCoverageData:true,primaryFamiliesValue:1000,recommendedFlyersValue:1100},
    truthModel:{},quantity:1000,coverageLabel:'91%',areaLabel:'12 km²',actions:{},
  }));
  assert.match(html,/Quota delle famiglie stimate nel raggio/);
  assert.match(html,/Milano<\/span><strong>60%/);
  assert.match(html,/Bresso<\/span><strong>30%/);
  assert.match(html,/Cormano<\/span><strong>10%/);
  assert.match(html,/Comuni coinvolti<\/dt><dd>3/);
  assert.match(html,/2 NIL interessati/);
  assert.match(html,/BRUZZANO/);
  assert.doesNotMatch(html,/<details[^>]*\sopen/);
});

test('Layer visibility and canonical selection remain separate controls', () => {
  const panel = read('../src/pages/public/configurator/step2/Step2MapPanel.jsx');
  const toolbar = panel.slice(panel.indexOf('aria-label="Layer della mappa"'),panel.indexOf('{/* MAPPA GRANDE'));
  assert.match(toolbar,/setActiveMapLayers/);
  assert.doesNotMatch(toolbar,/setSelected|toggleNilZone/);
  assert.match(toolbar,/map-toggle-comuni/);
  assert.match(toolbar,/map-toggle-nil/);
});
