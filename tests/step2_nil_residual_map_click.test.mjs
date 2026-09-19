// Ticket: residuo NIL (A/B/C), ricerca NIL globale, click mappa add/remove.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankNilSearchResults } from '../src/lib/step2/milanoNilView.js';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const step2 = rd('../src/pages/public/configurator/Step2.jsx');
const map = rd('../src/components/Step2Map.jsx');
const comune = rd('../src/pages/public/configurator/step2/Step2ComunePanel.jsx');
const guidance = rd('../src/pages/public/configurator/step2/MilanoGuidance.jsx');
const summary = rd('../src/pages/public/configurator/step2/Step2SummaryPanel.jsx');

const row = (id, name) => ({ type: 'zone', zone: { id, name, isNil: true } });
const all = [row('1', 'BRUZZANO'), row('2', 'COMASINA'), row('3', 'AFFORI'), row('4', 'BRERA'),
  row('5', 'PORTA VENEZIA'), row('6', 'PORTA GARIBALDI - VARESINE'), row('7', 'PORTA TICINESE - CONCHETTA')];

test('ricerca sul dataset completo: comasina/affori/brera/porta', () => {
  assert.deepEqual(rankNilSearchResults(all, 'comasina').map(r => r.name), ['COMASINA']);
  assert.deepEqual(rankNilSearchResults(all, 'AFFORI').map(r => r.name), ['AFFORI']);
  assert.deepEqual(rankNilSearchResults(all, 'brera').map(r => r.name), ['BRERA']);
  assert.equal(rankNilSearchResults(all, 'porta').length, 3);
});

test('Step2: ricerca usa pool globale, non solo selezionate; toggle condiviso', () => {
  assert.match(step2, /rankNilSearchResults\(milanoGlobalNilRows/);
  assert.match(step2, /function toggleNilZone\(/);
  assert.match(step2, /toggle(Zone)?=\{toggleNilZoneStable\}|toggleZone=\{toggleNilZoneStable\}/);
});

test('Ricerca: azioni Aggiungi/Rimuovi visibili anche in Quartieri', () => {
  assert.match(guidance, /Rimuovi/);
  assert.match(guidance, /Aggiungi/);
  assert.match(guidance, /\(!isRadiusMode \|\| nilManualMode\) && !isCapMode/);
});

test('Mappa: poligoni NIL selezionabili con click handler', () => {
  assert.match(map, /isSelectableNil/);
  assert.match(map, /onToggleZone\?\.\(isSelectableNil \? z\.id :/);
});

test('Residuo: tre scelte A/B/C esplicite, nessun testo "rinforzare" generico', () => {
  assert.match(comune, /A · Automatico/);
  assert.match(comune, /B · Manuale/);
  assert.match(comune, /C · Secondo passaggio/);
  assert.match(comune, /coperto al 100%/);
  assert.match(comune, /da assegnare/);
  assert.doesNotMatch(comune, /rinforzare le zone migliori/);
});

test('Sidebar: Configurazione pronta dopo la decisione, blocco finche residuo pendente', () => {
  assert.match(step2, /residualBlocksContinue/);
  assert.match(step2, /step2ConfigReady=\{step2ConfigReady\}/);
  assert.match(summary, /Configurazione pronta/);
});

test('Nessun secondo stato di selezione: toggle usa setSelected', () => {
  const i = step2.indexOf('function toggleNilZone(');
  assert.match(step2.slice(i, i + 900), /setSelected\(/);
});
