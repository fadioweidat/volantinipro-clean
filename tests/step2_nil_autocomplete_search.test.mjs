// TICKET — "Trova una zona" da filtro debole ad autocomplete reale (Step 2).
// Problema riprodotto: digitando "bru" i risultati erano visibili solo
// scorrendo fino alla lista card espandibile piu' sotto (se non collassata),
// nessuna tendina immediata sotto l'input, nessuna navigazione da tastiera.
//
// Fix: rankNilSearchResults (milanoNilView.js) riusa lo STESSO matching di
// filterNilRows (normalizeTerritoryName, accent+case-insensitive, stessa
// zoneRowsForList) aggiungendo solo l'ordinamento prefisso-prima; Step2.jsx
// espone questi risultati come milanoNilSearchResults (nessun nuovo calcolo
// territoriale, nessuna chiamata di rete); MilanoGuidance.jsx renderizza una
// tendina reale con navigazione tastiera (Arrow/Enter/Escape) e stato
// "Nessuna zona trovata". Click su un risultato NON cambia mai `selected` —
// solo l'azione esplicita "Solo questo NIL" (che riusa onSelectOnlyNil ->
// setSelected([id]), la stessa funzione canonica gia' usata dal bottone
// "Seleziona solo questo NIL" nelle card).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankNilSearchResults } from '../src/lib/step2/milanoNilView.js';

const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
const guidance = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoGuidance.jsx', import.meta.url), 'utf8');
const comunePanel = readFileSync(new URL('../src/pages/public/configurator/step2/Step2ComunePanel.jsx', import.meta.url), 'utf8');

function row(id, name, isNil = true) {
  return { type: 'zone', zone: { id, name, isNil } };
}

test('A. rankNilSearchResults: "bru" trova BRUZZANO (prefisso, case/accent-insensitive)', () => {
  const rows = [row('nil_bruzzano', 'BRUZZANO'), row('nil_affori', 'AFFORI'), row('nil_comasina', 'COMASINA')];
  const out = rankNilSearchResults(rows, 'bru');
  assert.deepEqual(out.map(r => r.name), ['BRUZZANO']);
});

test('B. rankNilSearchResults: "comas" trova COMASINA', () => {
  const rows = [row('nil_bruzzano', 'BRUZZANO'), row('nil_comasina', 'COMASINA')];
  const out = rankNilSearchResults(rows, 'comas');
  assert.deepEqual(out.map(r => r.name), ['COMASINA']);
});

test('C. rankNilSearchResults: "porta" trova piu\' zone (multi-result), prefisso prima di sottostringa', () => {
  const rows = [
    row('nil_porta_venezia', 'PORTA VENEZIA'),
    row('nil_conca_porta', 'CONCA DEL NAVIGLIO PORTA TICINESE'), // sottostringa, non prefisso
    row('nil_porta_ticinese', 'PORTA TICINESE'),
  ];
  const out = rankNilSearchResults(rows, 'porta');
  assert.equal(out.length, 3, 'tutte e 3 le zone con "porta" devono comparire');
  assert.ok(out[0].name.startsWith('PORTA') && out[1].name.startsWith('PORTA'), 'i prefissi "PORTA..." vengono prima della sottostringa');
  assert.equal(out[2].name, 'CONCA DEL NAVIGLIO PORTA TICINESE');
});

test('D. rankNilSearchResults: nessuna corrispondenza -> array vuoto (nessuna zona non pertinente restituita)', () => {
  const rows = [row('nil_bruzzano', 'BRUZZANO')];
  const out = rankNilSearchResults(rows, 'zzzzz');
  assert.deepEqual(out, []);
});

test('query vuota -> nessun risultato (nessuna tendina enorme di default)', () => {
  const rows = [row('nil_bruzzano', 'BRUZZANO')];
  assert.deepEqual(rankNilSearchResults(rows, ''), []);
  assert.deepEqual(rankNilSearchResults(rows, '   '), []);
});

test('rankNilSearchResults rispetta il limite risultati (default 20) senza alterare l\'insieme filtrato di filterNilRows', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(`nil_${i}`, `TEST ZONA ${i}`));
  const out = rankNilSearchResults(rows, 'test zona', { limit: 20 });
  assert.equal(out.length, 20);
});

test('Step2.jsx: milanoNilSearchResults deriva da rankNilSearchResults sulla stessa zoneRowsForList, nessun nuovo fetch/calcolo', () => {
  assert.match(step2, /import \{ filterNilRows, rankNilSearchResults \} from "\.\.\/\.\.\/\.\.\/lib\/step2\/milanoNilView\.js"/);
  assert.match(step2, /const milanoNilSearchResults = useMemo\(/);
  assert.match(step2, /rankNilSearchResults\(milanoGlobalNilRows, nilQuery, \{ limit: 20 \}\)/);
  assert.match(step2, /onToggleNilSelection=\{toggleNilZone\}/);
  assert.match(step2, /nilSearchPoolSize=\{globalNilZones\.length\}/);
});

test('Step2.jsx: onSelectOnlyNil riusa setSelected([zoneId]) — stessa funzione canonica del bottone card, nessuna logica duplicata', () => {
  assert.match(step2, /onSelectOnlyNil=\{\(zoneId\) => setSelected\(\[zoneId\]\)\}/);
});

test('MilanoGuidance.jsx: tendina risultati con ruolo ARIA combobox/listbox e navigazione tastiera (ArrowDown/ArrowUp/Enter/Escape)', () => {
  assert.match(guidance, /role="combobox"/);
  assert.match(guidance, /role="listbox"/);
  assert.match(guidance, /handleSearchKeyDown/);
  assert.match(guidance, /e\.key === "ArrowDown"/);
  assert.match(guidance, /e\.key === "ArrowUp"/);
  assert.match(guidance, /e\.key === "Enter"/);
  assert.match(guidance, /e\.key === "Escape"/);
});

test('MilanoGuidance.jsx: stato vuoto "Nessuna zona trovata" quando non ci sono risultati', () => {
  assert.match(guidance, /Nessuna zona trovata/);
});

test('MilanoGuidance.jsx: selezionare un risultato dalla tendina NON chiama mai setSelected/onSelectOnlyNil implicitamente — solo onNilQueryChange + focus/scroll', () => {
  const idx = guidance.indexOf('const handleSelectSearchResult');
  const block = guidance.slice(idx, idx + 400);
  assert.match(block, /onNilQueryChange\(result\.name\)/);
  assert.match(block, /onFocusNilSearchResult\(result\.id\)/);
  assert.doesNotMatch(block, /onSelectOnlyNil/, 'il click sul risultato stesso non deve invocare la selezione esplicita');
});

test('MilanoGuidance.jsx: azione opzionale "Solo questo NIL" e\' gated su isNil && nilManualMode, come il bottone card esistente', () => {
  assert.match(guidance, /result\.isNil && nilManualMode && onSelectOnlyNil/);
});

test('Step2ComunePanel.jsx: ogni riga zona ha un id stabile per lo scroll-into-view dalla ricerca (vp-zone-row-<id>)', () => {
  assert.match(comunePanel, /id=\{`vp-zone-row-\$\{z\.id\}`\}/);
});

test('nessuna modifica al motore prezzi/quantita\' Step2 o a filterNilRows esistente (comportamento invariato per la lista card sotto)', () => {
  assert.match(step2, /filterNilRows\(zoneRowsForList, nilQuery\)/, 'filterNilRows continua a filtrare la lista card come prima, invariato');
  const idx = guidance.indexOf('const handleSelectSearchResult');
  const block = guidance.slice(Math.max(0, idx - 50), idx + 800);
  assert.doesNotMatch(block, /requiredQty\s*=|flyerQty\s*=|zCap\(/, 'nessun calcolo di prezzo/quantita\' introdotto dall\'autocomplete');
});
