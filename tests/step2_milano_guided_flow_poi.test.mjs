// TICKET — STEP 2 MILANO GUIDED DISTRIBUTION FLOW + RADIUS NIL BREAKDOWN + POI ICONS
// Test suite verificando l'esperienza guidata Milano, il breakdown NIL in modalita' raggio,
// la ricerca autocomplete quartieri, le icone POI per attivita' e lo stato degradato discreto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import TR from 'react-test-renderer';
import { MilanoNilSearch } from '../src/pages/public/configurator/step2/MilanoNilSearch.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Testo di un albero react-test-renderer (toJSON).
const flat = (j) => (Array.isArray(j) ? j.map(flat).join(' ') : j == null ? '' : typeof j === 'string' ? j : flat(j.children));

const step2map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
const guidance = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoGuidance.jsx', import.meta.url), 'utf8');
const contextCard = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoAddressContextCard.jsx', import.meta.url), 'utf8');
const step2Src = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');

// ── 1. Indirizzo di partenza & copy in chiaro per il cliente ──────────────────
test('1. MilanoAddressContextCard: mostra "Zona di partenza", spiegazione NIL in chiaro e label NIL', () => {
  assert.match(contextCard, /Zona di partenza:/);
  assert.match(contextCard, /Milano è divisa in zone chiamate NIL\. Non devi conoscerle: le individuiamo automaticamente dal tuo indirizzo\./);
  assert.match(contextCard, /Quartiere \/ zona di Milano \(NIL\)/);
  assert.match(contextCard, /data-testid="milano-address-context"/);
});

// ── 2. Tre scelte di distribuzione Milano ────────────────────────────────────
test('2. MilanoGuidance: offre le 3 modalita\' Milano + Municipio con badge trasparente', () => {
  assert.match(guidance, /Milano completo/);
  assert.match(guidance, /NIL \/ Quartiere/);
  assert.match(guidance, /Raggio/);
  assert.match(guidance, /Municipio · Disponibile prossimamente/);
});

// ── 3. Radius mode NIL breakdown ─────────────────────────────────────────────
test('3. MilanoGuidance: in modalita\' Raggio mostra la ripartizione per singola zona/NIL', () => {
  assert.match(guidance, /isRadiusMode && Array\.isArray\(zonesAllocation\)/);
  assert.match(guidance, /Ripartizione zone nel raggio/);
  assert.match(guidance, /Fabbisogno:/);
  assert.match(guidance, /Mancano.*per 100%/);
});

// ── 4. Ricerca quartieri / zone con autocomplete e toggle Aggiungi/Rimuovi ────
test('4. MilanoNilSearch: ricerca quartieri con label, placeholder, combobox/listbox e toggle Aggiungi/Rimuovi (runtime)', () => {
  const calls = [];
  const results = [
    { id: 'n1', name: 'Comasina', isSelected: false },
    { id: 'n2', name: 'Bovisa', isSelected: true },
  ];
  let renderer;
  TR.act(() => {
    renderer = TR.create(React.createElement(MilanoNilSearch, {
      query: 'co',
      results,
      poolStatus: 'ready',
      onToggle: (id) => calls.push(['toggle', id]),
      onFocusResult: (r) => calls.push(['focus', r.id]),
      onQueryChange: (q) => calls.push(['query', q]),
    }));
  });
  assert.match(flat(renderer.toJSON()), /Aggiungi un quartiere \/ zona/);
  const input = renderer.root.findByProps({ role: 'combobox' });
  assert.equal(input.props.placeholder, 'Cerca quartiere di Milano, es. Comasina');
  assert.equal(input.props['aria-autocomplete'], 'list');
  assert.equal(input.props['aria-expanded'], false);
  assert.equal(renderer.root.findAllByProps({ role: 'listbox' }).length, 0, 'listbox solo dopo focus/digitazione');

  TR.act(() => { input.props.onFocus(); });
  assert.equal(renderer.root.findByProps({ role: 'combobox' }).props['aria-expanded'], true);
  assert.equal(renderer.root.findAllByProps({ role: 'listbox' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ role: 'option' }).length, 2);

  // Toggle: zona non selezionata -> "Aggiungi", selezionata -> "Rimuovi"
  const toggles = renderer.root.findAll((n) => n.type === 'button' && n.props['data-nil-toggle']);
  assert.deepEqual(toggles.map((b) => b.props['data-nil-toggle']), ['add', 'remove']);
  assert.deepEqual(toggles.map((b) => b.children.join('')), ['Aggiungi', 'Rimuovi']);
  TR.act(() => { toggles[0].props.onClick({ stopPropagation() {} }); });
  assert.deepEqual(calls, [['toggle', 'n1'], ['focus', 'n1']]);
});

test('4b. La ricerca NIL vive in MilanoNilSearch (sopra la mappa, montata da Step2): MilanoGuidance non contiene piu il campo', () => {
  assert.doesNotMatch(guidance, /role="combobox"|role="listbox"|Vuoi aggiungere un altro quartiere\?/);
  assert.match(guidance, /La ricerca NIL vive in MilanoNilSearch\.jsx/);
  assert.match(step2Src, /<MilanoNilSearch\b/);
});

// ── 5. Dettagli avanzati collassabili ────────────────────────────────────────
test('5. MilanoGuidance: include accordion "Mostra dettagli avanzati" per non appesantire la UX', () => {
  assert.match(guidance, /Mostra dettagli avanzati/);
  assert.match(guidance, /Nascondi dettagli avanzati/);
  assert.match(guidance, /setShowAdvanced/);
});

// ── 6. Icone POI coerenti con l'attività Step 1 in D2D e H2H/B2B ─────────────
test('6. Step2Map.jsx: informationalPoiIcon riceve e usa la categoria attivita\' (palestre, scuole, retail, ecc.)', () => {
  assert.match(step2map, /function informationalPoiIcon\(L, color, category = ''\)/);
  assert.match(step2map, /const symbol = poiCategorySymbol\(category\);/);
  assert.match(step2map, /informationalPoiIcon\(L, item\.color \|\| categoryColor\(item\.category\), item\.category\)/);
  // poiCategorySymbol include categorie principali
  assert.match(step2map, /palestra.*fitness.*🏋/);
  assert.match(step2map, /scuol.*🎓/);
  assert.match(step2map, /supermerc.*negozio.*retail.*🛒/);
  assert.match(step2map, /ristor.*🍽/);
  assert.match(step2map, /farmac.*⚕/);
});

// ── 7. Stato fallimento POI discreto e non bloccante ─────────────────────────
test('7. Step2Map.jsx: notifica POI non bloccante in posizione discreta con retry', () => {
  assert.match(step2map, /poiFetchFailed && \(/);
  assert.match(step2map, /Attività commerciali temporaneamente non disponibili\. La configurazione può continuare\./);
  assert.match(step2map, /onClick=\{onRetryPoi\}/);
  assert.match(step2map, /position: 'absolute', right: 10, bottom: 12/);
});
