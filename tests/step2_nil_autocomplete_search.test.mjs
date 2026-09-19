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
const guidance = readFileSync(new URL("../src/pages/public/configurator/step2/MilanoGuidance.jsx", import.meta.url), "utf8");
const search = readFileSync(new URL("../src/pages/public/configurator/step2/MilanoNilSearch.jsx", import.meta.url), "utf8");
const mapSrc = readFileSync(new URL("../src/components/Step2Map.jsx", import.meta.url), "utf8");
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

// ── Ticket "CERCA NIL": ricerca globale sopra la mappa ─────────────────────
const fullPool = [
  'BRUZZANO', 'COMASINA', 'AFFORI', 'BRERA', 'PORTA VENEZIA',
  'PORTA GARIBALDI - VARESINE', 'PORTA TICINESE - CONCHETTA', 'DUOMO',
].map((n, i) => row(`nil_${i}`, n));

test('A. la sorgente della ricerca e\' il dataset NIL completo (allMilanoNilRows da apiZones)', () => {
  assert.match(step2, /const allMilanoNilRows = useMemo\(/);
  assert.match(step2, /for \(const z of apiZones\)/);
  assert.match(step2, /rankNilSearchResults\(milanoGlobalNilRows, nilQuery, \{ limit: 20 \}\)/);
});

test('B. il sottoinsieme selezionato/visibile NON e\' sorgente di ricerca', () => {
  const i = step2.indexOf('const allMilanoNilRows = useMemo(');
  const block = step2.slice(i, i + 900);
  assert.doesNotMatch(block, /zonesInRadius|selZones|zoneRowsForList|globalNilZones|selected\b/);
  assert.doesNotMatch(step2, /rankNilSearchResults\((zoneRowsForList|selZones|zonesInRadius)/);
});

test('C. "comasina" trova COMASINA anche se nel pool esiste solo BRUZZANO selezionata (pool indipendente dalla selezione)', () => {
  assert.deepEqual(rankNilSearchResults(fullPool, 'comasina').map(r => r.name), ['COMASINA']);
});

test('D. "comas" trova COMASINA', () => {
  assert.deepEqual(rankNilSearchResults(fullPool, 'comas').map(r => r.name), ['COMASINA']);
});

test('E. "affori" trova AFFORI (accent/case-insensitive)', () => {
  assert.deepEqual(rankNilSearchResults(fullPool, 'AFFÓRI').map(r => r.name), ['AFFORI']);
});

test('F. "porta" restituisce piu\' risultati', () => {
  assert.equal(rankNilSearchResults(fullPool, 'porta').length, 3);
});

test('G. in caricamento: "Caricamento quartieri..." e nessun falso "Nessuna zona trovata"', () => {
  assert.match(search, /Caricamento quartieri\.\.\./);
  assert.match(search, /Impossibile caricare i quartieri di Milano/);
  assert.match(search, /Riprova/);
  assert.match(search, /const ready = poolStatus === "ready"/);
  assert.match(search, /ready && open && query \?/, 'la tendina (e "Nessuna zona trovata") esiste solo a pool pronto');
  assert.match(step2, /const nilSearchPoolStatus = allMilanoNilRows\.length > 0 \? "ready" : \(apiError && !apiLoading \? "error" : "loading"\)/);
});

test('H. Aggiungi usa il gestore canonico toggleNilZone (stesso `selected`)', () => {
  assert.match(step2, /onToggle=\{toggleNilZone\}/);
  const i = step2.indexOf('function toggleNilZone(');
  assert.match(step2.slice(i, i + 900), /setSelected\(/);
  assert.match(search, /"Aggiungi"/);
});

test('I. Rimuovi usa lo stesso gestore canonico', () => {
  assert.match(search, /"Rimuovi"/);
  assert.match(search, /onToggle\(result\.id\)/);
  assert.match(step2, /isSelected: selectedZoneIdSet\.has\(r\.id\)/);
});

test('J. selezionare un risultato inquadra la mappa senza cambiare la selezione', () => {
  const i = search.indexOf('const pick = (result)');
  const block = search.slice(i, i + 300);
  assert.match(block, /onFocusResult\(result\)/);
  assert.doesNotMatch(block, /onToggle/);
  assert.match(step2, /focusedNil=\{focusedNil\}/);
  assert.match(mapSrc, /focusNil = null/);
  assert.match(mapSrc, /map\.fitBounds\(b, \{ padding: \[40, 40\], maxZoom: 15/);
});

test('K. il campo di ricerca sta SOPRA la mappa', () => {
  const s = step2.indexOf('<MilanoNilSearch');
  const m = step2.indexOf('<Step2MapPanel');
  assert.ok(s > 0 && m > 0 && s < m, 'MilanoNilSearch precede Step2MapPanel');
  assert.match(search, /Aggiungi un quartiere \/ zona/);
  assert.match(search, /Cerca un quartiere di Milano e aggiungilo alla distribuzione\./);
  assert.match(search, /Cerca quartiere di Milano, es\. Comasina/);
});

test('L. la vecchia ricerca duplicata piu\' in basso e\' rimossa e il contatore sbagliato non esiste', () => {
  assert.doesNotMatch(guidance, /Trova una zona|zone trovate|nilQuery/);
  assert.equal((step2.match(/<MilanoNilSearch/g) || []).length, 1);
  assert.doesNotMatch(search, /zone trovate/);
});

