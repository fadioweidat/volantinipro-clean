// FIX FINALE ADMIN GPS — operatori canonici + copertura automatica reattiva %.
//
// - Comportamento PURO su selectRoadsFromOrigin / mergeRoadNetworks / getOperatorColor.
// - Contratto SORGENTE su GpsMonitor.jsx + CoverageAdjustmentPanel.jsx.
// Nessuna DB, nessuna migration, nessun raw GPS toccato.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { selectRoadsFromOrigin } from '../src/lib/geo/originRadialSelection.js';
import { mergeRoadNetworks } from '../src/lib/geo/mergeRoadNetworks.js';
import { getOperatorColor, UNASSIGNED_OPERATOR_COLOR } from '../src/lib/geo/operatorColor.js';

const GM = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');

// Rete stradale sintetica: n vie da wayLen m, a distanza crescente dall'origine.
function syntheticNetwork(n = 200, wayLen = 100) {
  const ways = [];
  for (let i = 0; i < n; i += 1) {
    const lat = 45.0;
    const lng0 = 9.0 + i * 0.01;
    ways.push({ id: i + 1, geometry: [[lat, lng0], [lat, lng0 + 0.001]], lengthM: wayLen });
  }
  return { ways, totalLengthM: n * wayLen };
}
const ORIGIN = { lat: 45.0, lng: 9.0 };
const PCTS = [50, 60, 70, 80, 90, 100];

// ══════════════════════════ §18 — OPERATORI ══════════════════════════

test('§18-A — "OPERATORI: N" usa gli operatori ASSEGNATI, mai il numero di sessioni GPS', () => {
  // conteggio canonico da assegnazioni reali
  assert.match(GM, /const assignedOperatorCount = canonicalOperators\.filter\(\(o\) => o\.assigned\)\.length;/);
  assert.match(GM, /const operatorsWithGpsCount = canonicalOperators\.filter\(\(o\) => o\.hasGps\)\.length;/);
  // header pannello: OPERATORI: {assignedOperatorCount} (+ CON GPS opzionale)
  assert.match(GM, /OPERATORI: \{assignedOperatorCount\}\{operatorsWithGpsCount > 0 \? ` · CON GPS: \$\{operatorsWithGpsCount\}` : ''\}/);
  // il vecchio conteggio da sessioni non deve piu' essere l'intestazione
  assert.doesNotMatch(GM, /Operatori · \{sessionTracks\.length\}/);
});

test('§18-A — canonicalOperators: fonte primaria = assegnazioni reali, hasGps = driver_id fra le sessioni', () => {
  assert.match(GM, /const canonicalOperators = useMemo\(\(\) => \{/);
  assert.match(GM, /for \(const o of campaignOperators\) \{/);
  assert.match(GM, /hasGps: o\.operatorId \? gpsDriverIds\.has\(o\.operatorId\) : false/);
  assert.match(GM, /assigned: true/);
  // 4 assegnati / 1 GPS => assignedOperatorCount = 4 (indipendente dalle sessioni):
  // la formula filtra su o.assigned, non su sessionTracks.
  assert.match(GM, /canonicalOperators\.filter\(\(o\) => o\.assigned\)\.length/);
});

test('§18-B — legenda OPERATORI CAMPAGNA: elenca TUTTI gli operatori canonici col nome reale', () => {
  assert.match(GM, /OPERATORI CAMPAGNA/);
  assert.match(GM, /canonicalOperators\.map\(\(op\) => \(/);
  assert.match(GM, /\{op\.displayName\}/);
  // pallino col colore stabile dell'operatore
  assert.match(GM, /background: op\.color/);
  // il pannello ha la sua sezione "Operatori campagna" da campaignOperators
  assert.match(PANEL, /<p style=\{groupTitle\}>Operatori campagna \(\{assignedOperators\.length\}\)<\/p>/);
  assert.match(PANEL, /const assignedOperators = \(Array\.isArray\(campaignOperators\) \? campaignOperators : \[\]\)/);
});

test('§18-C — nome reale quando disponibile, fallback "Operatore <short-id>" (mai "Operatore <indice>")', () => {
  assert.match(GM, /export function shortOperatorId\(value\) \{/);
  assert.match(GM, /displayName: o\.name \|\| `Operatore \$\{shortOperatorId\(key\)\}`/);
  // riga sessione: nome canonico, poi short-id del driver, e solo in ultima
  // istanza (sessione senza driver_id) l'indice.
  assert.match(GM, /const rowTitle = canonOp\?\.displayName/);
  assert.match(GM, /track\.session\?\.driver_id \? `Operatore \$\{shortOperatorId\(track\.session\.driver_id\)\}` : `Operatore \$\{index \+ 1\}`/);
});

test('§18-D/E — colore STABILE per operatore: getOperatorColor ovunque, mai trackColor(index) per la lista canonica', () => {
  // deterministico
  const a = getOperatorColor('op-777');
  assert.equal(a, getOperatorColor('op-777'));
  assert.equal(getOperatorColor(' op-777 '), a);
  // GpsMonitor: colore canonico da getOperatorColor(key)
  assert.match(GM, /color: getOperatorColor\(key\)/);
  // riga sessione: colore da operatore canonico o getOperatorColor(driver_id)
  assert.match(GM, /const color = canonOp\?\.color\s*\n\s*\|\| \(track\.session\?\.driver_id \? getOperatorColor\(track\.session\.driver_id\) : trackColor\(index\)\)/);
  // stesso operatore -> stesso colore su traccia GPS (polyline) e su correzione manuale
  assert.match(GM, /track\.session\?\.driver_id \? getOperatorColor\(track\.session\.driver_id\) : trackColor\(index\)/);
  assert.match(PANEL, /function manualOperatorColor\(operatorKey\) \{[\s\S]{0,220}return getOperatorColor\(operatorKey\)/);
});

test('§18-F — selettore "Operatore associato": TUTTI gli operatori assegnati (non solo quelli con GPS)', () => {
  assert.match(PANEL, />\s*Operatore associato/);
  assert.match(PANEL, /const operatorOptions = useMemo\(/);
  assert.match(PANEL, /\.filter\(\(o\) => o && \(o\.operatorId \|\| o\.assignmentId\)\)/);
  // le opzioni renderizzano un pulsante per ciascun operatore reale
  assert.match(PANEL, /\)\.map\(\(opt\) => \(/);
  assert.match(PANEL, /onClick=\{\(\) => setSelectedOperatorKey\(opt\.key\)\}/);
});

test('§18-G — Admin non associato = colore NEUTRO separato, non un colore operatore', () => {
  assert.equal(getOperatorColor(null), UNASSIGNED_OPERATOR_COLOR);
  assert.equal(getOperatorColor(''), UNASSIGNED_OPERATOR_COLOR);
  assert.match(PANEL, /if \(!operatorKey \|\| operatorKey === ADMIN_OPERATOR_KEY\) return UNASSIGNED_OPERATOR_COLOR;/);
  assert.match(PANEL, /const ADMIN_OPERATOR_KEY = 'admin';/);
});

test('§18-H — la copertura AUTOMATICA non usa un colore operatore (viola fisso, distinto)', () => {
  // preview draft automatica: viola #a855f7 fisso (o rosso in gomma), mai getOperatorColor
  assert.match(PANEL, /draftLines\.map\(\(line, i\) => \([\s\S]{0,260}color: tool === 'erase' \? '#dc2626' : '#a855f7'/);
  const draftBlock = PANEL.slice(PANEL.indexOf('draftLines.map((line, i)'), PANEL.indexOf('draftLines.map((line, i)') + 400);
  assert.doesNotMatch(draftBlock, /getOperatorColor|manualOperatorColor/);
});

// ══════════════════════ §19 — COPERTURA AUTOMATICA % ══════════════════════

for (let k = 0; k < PCTS.length; k += 1) {
  const pct = PCTS[k];
  test(`§19-A${k + 1} — ${pct}% produce vie > 0`, () => {
    const sel = selectRoadsFromOrigin(syntheticNetwork(200, 100), ORIGIN, pct, []);
    assert.ok(sel.selectedWays.length > 0, `${pct}% deve selezionare almeno una via`);
    assert.ok(sel.selectedLengthM > 0);
  });
}

test('§19-B — lunghezza selezionata monotona: 50 ≤ 60 ≤ 70 ≤ 80 ≤ 90 ≤ 100', () => {
  const net = syntheticNetwork(200, 100);
  const lens = PCTS.map((p) => selectRoadsFromOrigin(net, ORIGIN, p, []).selectedLengthM);
  for (let i = 1; i < lens.length; i += 1) {
    assert.ok(lens[i] >= lens[i - 1], `regressione a ${PCTS[i]}%: ${lens[i]} < ${lens[i - 1]}`);
  }
  // e cresce davvero da 50 a 100 (non piatta)
  assert.ok(lens[lens.length - 1] > lens[0]);
});

test('§19-C — 70% -> 80% cambia le vie selezionate (currentAutoLines diverse)', () => {
  const net = syntheticNetwork(200, 100);
  const a = selectRoadsFromOrigin(net, ORIGIN, 70, []);
  const b = selectRoadsFromOrigin(net, ORIGIN, 80, []);
  assert.notEqual(a.selectedWays.length, b.selectedWays.length);
  assert.ok(b.selectedLengthM > a.selectedLengthM);
});

test('§19-C(src) — effetto reattivo su autoPct: rifa SOLO la selezione dalla rete in cache, senza Overpass/conferma', () => {
  // ref di cache della rete risolta
  assert.match(PANEL, /const autoNetRef = useRef\(null\);/);
  // helper puro che riapplica la percentuale
  assert.match(PANEL, /const applyAutoSelectionFromCache = \(pctRaw, \{ pushUndo = false \} = \{\}\) => \{/);
  assert.match(PANEL, /const sel = selectRoadsFromOrigin\(net, origin, pct, gpsPath\);/);
  // effetto: dipende SOLO da autoPct, guardato da autoNetRef, niente confirm
  const effStart = PANEL.indexOf('useEffect(() => {\n    if (!correcting || editingId) return;\n    if (!autoNetRef.current) return;');
  assert.ok(effStart > 0, 'effetto reattivo su autoPct assente');
  const eff = PANEL.slice(effStart, effStart + 320);
  assert.match(eff, /applyAutoSelectionFromCache\(autoPct, \{ pushUndo: false \}\);/);
  assert.match(eff, /\}, \[autoPct\]\); \/\/ eslint-disable-line/);
  assert.doesNotMatch(eff, /window\.confirm|resolveRoadNetwork|resolveNetworksBatched/);
  // loadAutomaticBase popola la cache e delega all'helper
  assert.match(PANEL, /autoNetRef\.current = \{\s*\n\s*net,\s*\n\s*origin,/);
  assert.match(PANEL, /const loadedCount = applyAutoSelectionFromCache\(autoPct, \{ pushUndo: true \}\);/);
});

test('§19-D — la preview riceve currentAutoLines (draftLines) come Polyline', () => {
  assert.match(PANEL, /draftLines\.map\(\(line, i\) => \(\s*\n\s*<Polyline key=\{`draft-line-\$\{i\}`\} positions=\{line\}/);
  // l'helper sostituisce SOLO le vie automatiche precedenti, mai le linee a mano
  assert.match(PANEL, /setDraftLines\(\(prev\) => \[\.\.\.prev\.filter\(\(l\) => !lastAutoLines\.includes\(l\)\), \.\.\.lines\]\);/);
  assert.match(PANEL, /setLastAutoLines\(lines\);/);
});

test('§19-E — i KPI usano la STESSA selezione delle linee (sel)', () => {
  assert.match(PANEL, /setAutoKpi\(\{\s*\n\s*requestedPct: pct,\s*\n\s*ways: selectedWays\.length,\s*\n\s*selectedKm: sel\.selectedLengthM \/ 1000,\s*\n\s*totalKm: net\.totalLengthM \/ 1000,\s*\n\s*coveragePct: sel\.coverageMetricPercent,/);
});

test('§19-F — SAVE salva esattamente le linee della preview, in UNA sola RPC batch atomica', () => {
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke = async'));
  // ogni draftLine -> { geometry: <LineString>, zone_id } nel payload batch
  assert.match(save, /draftLines\.map\(\(line\) => \(\{\s*\n\s*geometry: latLngsToLineStringGeoJson\(line\),/);
  assert.match(save, /createCoverageAdjustmentsBatch\(\{/);
  assert.match(save, /lines: linesPayload/);
  // NIENTE più una RPC per via (loop sequenziale con partial-commit)
  assert.doesNotMatch(save, /for \(const line of draftLines\)/);
  assert.doesNotMatch(save, /selectRoadsFromOrigin/, 'il salvataggio NON ricalcola una percentuale diversa');
});

test('§19-G — multi-zona: se una zona fallisce, le altre producono comunque vie', () => {
  const zoneA = { ways: [{ id: 1, geometry: [[45, 9], [45, 9.001]], lengthM: 100 }], totalLengthM: 100 };
  const merged = mergeRoadNetworks([
    { zoneId: 'a', network: zoneA },
    { zoneId: 'b', network: null }, // zona fallita
  ]);
  assert.equal(merged.ways.length, 1);
  assert.equal(merged.failedZoneCount, 1);
  assert.equal(merged.loadedZoneCount, 1);
  assert.ok(merged.totalLengthM > 0);
  // il pannello mostra l'avviso zone fallite, non azzera le altre
  assert.match(PANEL, /Zone non caricate \(\{autoMulti\.failedZoneCount\}\)/);
});

test('§19-H — origine non valida => errore leggibile, mai selezione vuota silenziosa', () => {
  assert.match(PANEL, /setAutoBaseState\(\{ loading: false, error: 'Punto di partenza non disponibile: scegli "Centro comune" o clicca sulla mappa\.', loaded: 0 \}\)/);
  assert.match(PANEL, /setAutoOriginError\('Punto di partenza fuori dalla zona selezionata\.'\)/);
  assert.match(PANEL, /setAutoOriginError\('Punto di partenza fuori da tutte le zone della campagna\.'\)/);
});

test('§19-I — preview automatica visibile: opacity > 0 e weight sufficiente', () => {
  assert.match(PANEL, /draftLines\.map\(\(line, i\) => \([\s\S]{0,320}weight: tool === 'erase' \? 8 : 3, opacity: 0\.9/);
});

test('§19-J — raw GPS immutabile: nessun insert/update/delete su gps_tracking_points', () => {
  assert.doesNotMatch(PANEL, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.doesNotMatch(GM, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  // l'helper reattivo legge points (props) in sola lettura
  const h = PANEL.slice(PANEL.indexOf('const applyAutoSelectionFromCache'), PANEL.indexOf('const applyAutoSelectionFromCache') + 400);
  assert.match(h, /filterValidGpsPoints\(points\)\.valid\.map/);
});

// ── non-regressione mirata ──────────────────────────────────────────────
test('NR — niente window.prompt per revoca, revoca diretta senza input', () => {
  assert.doesNotMatch(PANEL, /window\.prompt/);
  // revoca diretta con reason interno neutro (nessun testo chiesto all'Admin)
  assert.match(PANEL, /reason: 'admin_revoked'/);
  assert.match(PANEL, /Azione diretta: nessun popup, nessun testo richiesto all'Admin/);
  // nessun input/textarea con label "motivo" reso obbligatorio
  assert.doesNotMatch(PANEL, /required[\s\S]{0,40}[Mm]otivo/);
});

test('NR — reattivo su autoPct non tocca undo/tool/salvataggio', () => {
  const h = PANEL.slice(PANEL.indexOf('const applyAutoSelectionFromCache'), PANEL.indexOf('useEffect(() => {\n    if (!correcting || editingId) return;'));
  // pushUndo:false dal path reattivo => nessun setUndoStack incondizionato
  assert.match(PANEL, /if \(pushUndo\) setUndoStack\(\(prev\) => \[\.\.\.prev, \.\.\.lines\.map\(\(\) => \(\{ kind: 'line' \}\)\)\]\);/);
  assert.ok(h.length > 0);
});
