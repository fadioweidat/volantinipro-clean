// FOLLOW-UP STEP 2 — FIX P1-A.
// `selected` veniva riportato a "tutte le zone" ad ogni ricompute di
// `zonesInRadius` (identità array nuova anche a contenuto invariato),
// sovrascrivendo la selezione manuale NIL / custom / multi-zona parziale.
// resolveZoneAutoSelection() preserva le scelte manuali e auto-seleziona solo
// quando la lista di zone disponibili cambia davvero e non c'è nulla da
// preservare.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveZoneAutoSelection } from '../src/lib/step2/zoneSelection.js';

const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');

const NILS = Array.from({ length: 88 }, (_, i) => `nil_${i}`);

test('A. Comune standard: prima volta senza selezione -> auto-seleziona tutte le zone', () => {
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['api_0_cormano'],
    prevAvailableIds: [],
    currentSelected: [],
  });
  assert.deepEqual(out, ['api_0_cormano']);
});

test('A. Comune: cambio comune (Cormano -> Varedo) -> selezione si riallinea al nuovo comune', () => {
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['api_0_varedo'],
    prevAvailableIds: ['api_0_cormano'],
    currentSelected: ['api_0_cormano'],
  });
  assert.deepEqual(out, ['api_0_varedo']);
});

test('B. NIL BRUZZANO selezionata manualmente -> preservata su ricompute (stesso set NIL)', () => {
  const sel = ['nil_bruzzano'];
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: NILS.concat('nil_bruzzano'),
    prevAvailableIds: NILS.concat('nil_bruzzano'),
    currentSelected: sel,
  });
  assert.strictEqual(out, sel, 'stesso riferimento -> nessun re-render, selezione preservata');
});

test('C. Ciclo Via Oroboni -> BRUZZANO -> Milano completo -> BRUZZANO -> Raggio -> BRUZZANO', () => {
  const ALL = NILS.slice().concat('nil_bruzzano'); // 88 NIL + BRUZZANO
  // 1. indirizzo non confermato: 1 NIL contenente, nessuna selezione -> auto-select
  let sel = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ['nil_bruzzano'], prevAvailableIds: [], currentSelected: [] });
  assert.deepEqual(sel, ['nil_bruzzano']);
  // 2. conferma NIL BRUZZANO: il mode-handler azzera selected a [], poi il
  //    preselect NIL imposta [bruzzano]; la lista disponibili diventa tutte le NIL.
  //    L'effect gira PRIMA del preselect con selected=[] -> espande a tutte,
  //    poi il preselect narrow-a a [bruzzano]. Da qui in poi la lista è stabile.
  sel = ['nil_bruzzano'];
  sel = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ALL, prevAvailableIds: ALL, currentSelected: sel });
  assert.deepEqual(sel, ['nil_bruzzano'], 'BRUZZANO manuale preservata');
  // 3. "Milano comune completo": il mode-handler azzera selected a []
  sel = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ALL, prevAvailableIds: ALL, currentSelected: [] });
  assert.deepEqual(sel.slice().sort(), ALL.slice().sort(), 'Milano completo -> tutte le NIL');
  // 4. torna a NIL BRUZZANO: mode-handler azzera + preselect -> [bruzzano]
  sel = ['nil_bruzzano'];
  sel = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ALL, prevAvailableIds: ALL, currentSelected: sel });
  assert.deepEqual(sel, ['nil_bruzzano']);
  // 5. passa a Raggio: mode-handler azzera selected; zone nel raggio (comuni/NIL)
  sel = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ['api_0_milano', 'nil_bruzzano', 'nil_affori'], prevAvailableIds: ALL, currentSelected: [] });
  assert.deepEqual(sel, ['api_0_milano', 'nil_bruzzano', 'nil_affori'], 'Raggio -> tutte le zone nel raggio');
  // 6. torna a NIL: mode-handler azzera + preselect -> [bruzzano]
  sel = ['nil_bruzzano'];
  sel = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ALL, prevAvailableIds: ['api_0_milano', 'nil_bruzzano', 'nil_affori'], currentSelected: sel });
  assert.deepEqual(sel, ['nil_bruzzano'], 'BRUZZANO preservata anche dopo il giro Raggio');
});

test('D. Multi-zona con selezione parziale -> preservata (anche dopo refresh apiData)', () => {
  const partial = ['api_0_a', 'api_1_b'];
  // refresh apiData: stesse 3 zone, nuova identità array
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['api_0_a', 'api_1_b', 'api_2_c'],
    prevAvailableIds: ['api_0_a', 'api_1_b', 'api_2_c'],
    currentSelected: partial,
  });
  assert.strictEqual(out, partial, 'selezione parziale multi-comune preservata per riferimento');
});

test('D-bis. Multi-zona: aggiunta di un 4° comune quando erano selezionati TUTTI -> include il nuovo', () => {
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['a', 'b', 'c', 'd'],
    prevAvailableIds: ['a', 'b', 'c'],
    currentSelected: ['a', 'b', 'c'],
  });
  assert.deepEqual(out, ['a', 'b', 'c', 'd'], 'aveva tutti -> espande alla nuova lista');
});

test('D-ter. Multi-zona: aggiunta comune quando selezione era PARZIALE -> non forza il nuovo', () => {
  const partial = ['a', 'b'];
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['a', 'b', 'c', 'd'],
    prevAvailableIds: ['a', 'b', 'c'],
    currentSelected: partial,
  });
  assert.strictEqual(out, partial, 'selezione manuale parziale rispettata');
});

test('E. recompute apiData a parità di id NON ripristina tutte le zone e NON causa re-render', () => {
  // selezione = tutte
  const all = ['a', 'b', 'c'];
  let out = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ['a', 'b', 'c'], prevAvailableIds: ['a', 'b', 'c'], currentSelected: all });
  assert.strictEqual(out, all, 'stesso riferimento (no-op)');
  // selezione = sottoinsieme manuale
  const sub = ['a'];
  out = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: ['a', 'b', 'c'], prevAvailableIds: ['a', 'b', 'c'], currentSelected: sub });
  assert.strictEqual(out, sub, 'sottoinsieme manuale intatto, stesso riferimento');
});

test('5. id spariti dalla lista vengono scartati dalla selezione manuale', () => {
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['a', 'b', 'c'],
    prevAvailableIds: ['a', 'b', 'c', 'x'],
    currentSelected: ['a', 'x'],
  });
  assert.deepEqual(out, ['a'], 'x non più disponibile -> rimosso, a preservato');
});

test('nessuna zona utile -> selezione svuotata (e no-op se già vuota)', () => {
  assert.deepEqual(resolveZoneAutoSelection({ hasUsefulApiZones: false, availableIds: [], prevAvailableIds: ['a'], currentSelected: ['a', 'b'] }), []);
  const empty = [];
  assert.strictEqual(resolveZoneAutoSelection({ hasUsefulApiZones: false, availableIds: [], prevAvailableIds: [], currentSelected: empty }), empty);
});

test('Step2.jsx: l\'effect usa resolveZoneAutoSelection e NON piu\' setSelected(zonesInRadius.map(...)) incondizionato', () => {
  assert.match(step2, /import \{ resolveZoneAutoSelection \} from "\.\.\/\.\.\/\.\.\/lib\/step2\/zoneSelection\.js"/);
  assert.match(step2, /setSelected\(prev => resolveZoneAutoSelection\(\{/);
  assert.match(step2, /const prevAvailableZoneIdsRef = useRef\(\[\]\)/);
  assert.doesNotMatch(step2, /if \(hasUsefulApiZones\) \{\s*setSelected\(zonesInRadius\.map\(z => z\.id\)\);/);
});
