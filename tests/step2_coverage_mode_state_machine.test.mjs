// TICKET — STEP 2 COVERAGE MODE STATE MACHINE.
// Modello unico per Zona: zone.coverage.mode + zone.coverage.address
// persistente; switch NIL/Raggio/Comune reversibili senza reinserire
// l'indirizzo; nessun ranking/priorità stale al cambio modalità.
// Audit statico sul sorgente (Step2.jsx è un componente React con analisi
// live e canvas: non montabile in node:test — stesso approccio dei test
// step2_* esistenti).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/pages/public/configurator/step2/Step2ComunePanel.jsx', import.meta.url), 'utf8');

test('address context PERSISTENTE: coverage.address con label/lat/lng/municipality/nearestNil*', () => {
  assert.match(step2, /const coverageAddress = activeZoneForRadius\?\.coverage\?\.address \|\| data\.coverage\?\.address \|\| null/);
  assert.match(step2, /const persistCoverageAddress = useCallback\(/);
  for (const f of ['label', 'lat', 'lng', 'municipality', 'nearestNilId', 'nearestNilName']) {
    assert.match(step2, new RegExp(`${f}:`), `persistCoverageAddress deve gestire ${f}`);
  }
  // scritto dopo la ricerca indirizzo e completato quando containingNil risolve
  assert.match(step2, /persistCoverageAddress\(\{ label: pointLabel, lat: sp\.lat, lng: sp\.lng, municipality: "Milano" \}\)/);
  assert.match(step2, /persistCoverageAddress\(\{ nearestNilId: containingNil\.code \|\| null, nearestNilName: containingNil\.name \}\)/);
});

test('switchToComuneMode NON cancella piu\' il contesto indirizzo', () => {
  const fn = step2.slice(step2.indexOf('const switchToComuneMode ='), step2.indexOf('const switchToNilMode ='));
  assert.doesNotMatch(fn, /setSelectedSearchPoint\(null\)/, 'comune mode non deve azzerare selectedSearchPoint');
  assert.match(fn, /setComuniPriorityOrder\(\[\]\)/);
  assert.match(fn, /setNilManualMode\(false\)/);
});

test('switchToRadiusMode ripristina il punto dal contesto persistente + azzera priorità', () => {
  const fn = step2.slice(step2.indexOf('const switchToRadiusMode ='), step2.indexOf('const switchToComuneMode ='));
  assert.match(fn, /restoreSearchPointFromCoverageAddress\(\)/);
  assert.match(fn, /setComuniPriorityOrder\(\[\]\)/);
  assert.match(fn, /setNilManualMode\(false\)/);
});

test('switchToNilMode esiste, reversibile, riusa nearestNil senza rifare la ricerca', () => {
  assert.match(step2, /const switchToNilMode = \(\) => \{/);
  const fn = step2.slice(step2.indexOf('const switchToNilMode ='), step2.indexOf('const switchToCapMode ='));
  assert.match(fn, /restoreSearchPointFromCoverageAddress\(\)/);
  assert.match(fn, /setNilManualMode\(true\)/);
  assert.match(fn, /const nilName = coverageAddress\?\.nearestNilName \|\| null/);
  assert.match(fn, /setPendingNilPreselectName\(nilName\)/);
  assert.match(fn, /coverageMode: "nil"/);
  assert.match(fn, /comuniPriorityOrder: \[\]/);
  // NON rifà geocoding: nessuna fetch / resolveMilanoCity nel body
  assert.doesNotMatch(fn, /resolveMilanoCity|fetch\(|geocode/i);
});

test('restoreSearchPointFromCoverageAddress: usa coverage.address quando manca il punto, mai reinserimento', () => {
  const fn = step2.slice(step2.indexOf('const restoreSearchPointFromCoverageAddress ='), step2.indexOf('const switchToRadiusMode ='));
  assert.match(fn, /if \(selectedSearchPoint && Number\.isFinite\(Number\(selectedSearchPoint\.lat\)\)/);
  assert.match(fn, /coverageAddress && Number\.isFinite\(Number\(coverageAddress\.lat\)\)/);
  assert.match(fn, /setSelectedSearchPoint\(sp\)/);
});

test('no stale ranking: comuniPriorityOrder azzerato in TUTTI i cambi modalità (locale + data)', () => {
  const switches = ['switchToRadiusMode', 'switchToComuneMode', 'switchToNilMode'];
  for (const s of switches) {
    const start = step2.indexOf(`const ${s} =`);
    const body = step2.slice(start, start + 2200);
    assert.match(body, /setComuniPriorityOrder\(\[\]\)/, `${s}: reset locale comuniPriorityOrder`);
    assert.match(body, /comuniPriorityOrder: \[\]/, `${s}: reset comuniPriorityOrder nel data merge`);
  }
});

test('coverageMode per Zona propagato ai pannelli + switcher permanente', () => {
  assert.match(step2, /switchToNilMode=\{switchToNilMode\}/);
  assert.match(step2, /coverageMode=\{coverageMode\}/);
  assert.match(step2, /coverageAddress=\{coverageAddress\}/);
  // Step2ComunePanel: switcher SEMPRE reso (fuori da hasUnconfirmedAddressPoint)
  assert.match(panel, /<CoverageModeSwitcher/);
  assert.match(panel, /function CoverageModeSwitcher\(\{ coverageAddress, coverageMode, nearestNilName, switchToNilMode, switchToRadiusMode, switchToComuneMode \}\)/);
  assert.match(panel, /if \(!hasAddress\) return null;/);
  // tre modalità, una attiva evidenziata da coverageMode
  assert.match(panel, /coverageMode === "nil"/);
  assert.match(panel, /coverageMode === "radius"/);
  assert.match(panel, /coverageMode === "municipality"/);
});

test('quantità 10.000 NON toccata dai cambi modalità (nessun reset di availableFlyers/manualFlyers negli switch)', () => {
  for (const s of ['switchToRadiusMode', 'switchToComuneMode', 'switchToNilMode']) {
    const start = step2.indexOf(`const ${s} =`);
    const body = step2.slice(start, start + 2200);
    assert.doesNotMatch(body, /setAvailableFlyers\(|setManualFlyers\(/, `${s} non deve resettare la quantità`);
  }
});
