// Ticket "OPERATORI REALI + TRACCIA MANUALE UNIFORME".
// Test puri su getOperatorColor + contratto sorgente su CoverageAdjustmentPanel
// e GpsMonitor. Nessuna DB, nessuna migration.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { getOperatorColor, OPERATOR_PALETTE, UNASSIGNED_OPERATOR_COLOR } from '../src/lib/geo/operatorColor.js';

const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');
const GM = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');
const COVEDIT = readFileSync(new URL('../src/pages/admin/CoverageEditor.jsx', import.meta.url), 'utf8');

// ── D: colore deterministico per operator_id ────────────────────────────
test('D — getOperatorColor: deterministico, stabile, dalla palette', () => {
  const a = getOperatorColor('op-123');
  assert.equal(a, getOperatorColor('op-123'), 'stesso id -> stesso colore');
  assert.equal(getOperatorColor(' op-123 '), a, 'trim');
  assert.ok(OPERATOR_PALETTE.includes(a));
  assert.equal(getOperatorColor(null), UNASSIGNED_OPERATOR_COLOR);
  assert.equal(getOperatorColor(''), UNASSIGNED_OPERATOR_COLOR);
});

test('C/D — supporta 12+ operatori senza collisione entro i primi 12', () => {
  assert.equal(OPERATOR_PALETTE.length, 12);
  const ids = Array.from({ length: 12 }, (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`);
  const colors = ids.map(getOperatorColor);
  // le 12 chiavi devono coprire quasi tutta la palette (nessun crollo su 1-2 colori)
  assert.ok(new Set(colors).size >= 8, `distribuzione debole: ${new Set(colors).size}/12`);
  // oltre i 12 continua a funzionare (ciclo), sempre deterministico
  assert.equal(getOperatorColor('extra-op'), getOperatorColor('extra-op'));
});

// ── E: stesso operatore = stesso colore GPS e manuale ──────────────────
test('E — GpsMonitor usa getOperatorColor(driver_id) per la traccia GPS (stesso colore del manuale)', () => {
  assert.match(GM, /import \{ getOperatorColor \} from '\.\.\/\.\.\/lib\/geo\/operatorColor\.js'/);
  assert.match(GM, /track\.session\?\.driver_id \? getOperatorColor\(track\.session\.driver_id\) : trackColor\(index\)/);
  // il pannello usa la stessa funzione per il colore operatore
  assert.match(PANEL, /import \{ getOperatorColor, UNASSIGNED_OPERATOR_COLOR \} from '\.\.\/\.\.\/lib\/geo\/operatorColor\.js'/);
  assert.match(PANEL, /function manualOperatorColor\(operatorKey\) \{[\s\S]{0,200}return getOperatorColor\(operatorKey\)/);
});

// ── A/B: operatori reali, nessun MAN-01..04 ───────────────────────────
test('A/B — operatori derivati da campaignOperators reali, nessun MAN-0N hardcoded', () => {
  assert.match(PANEL, /campaignOperators = \[\]/);
  assert.match(PANEL, /const operatorOptions = useMemo\(/);
  assert.match(PANEL, /o\.operatorId \|\| o\.assignmentId/);
  assert.doesNotMatch(PANEL, /manualOperatorKeyFor/);
  assert.doesNotMatch(PANEL, /MAX_MANUAL_OPERATORS/);
  assert.doesNotMatch(PANEL, />Operatori Admin manuali</);
  assert.doesNotMatch(PANEL, /useState\('MAN-01'\)|setSelectedOperatorKey\('MAN-01'\)/);
  assert.doesNotMatch(PANEL, /`MAN-\$\{/); // nessuna GENERAZIONE di chiavi MAN-0N (i commenti che le nominano vanno bene)
  // GpsMonitor carica gli assignment reali (per la lista operatori canonica);
  // l'Editor Copertura Avanzato li passa al pannello di correzione.
  assert.match(GM, /import \{ listCampaignAssignments \} from '\.\.\/\.\.\/lib\/services\/admin-api\.js'/);
  assert.match(GM, /listCampaignAssignments\(campaignId\)/);
  assert.match(GM, /const campaignOperators = useMemo\(/);
  assert.match(COVEDIT, /const campaignOperators = useMemo\(/);
  assert.match(COVEDIT, /campaignOperators=\{campaignOperators\}/);
});

test('C — quantita\' operatori dinamica (map sugli assignment, nessun conteggio fisso)', () => {
  assert.match(PANEL, /\.map\(\(o, i\) => \(\{[\s\S]{0,200}key: String\(o\.operatorId \|\| o\.assignmentId\)/);
  assert.doesNotMatch(PANEL, /Array\.from\(\{ length: manualOperatorCount \}/);
  assert.doesNotMatch(PANEL, /Array\.from\(\{ length: MAX_MANUAL_OPERATORS \}/);
});

// ── F: metadata operatore reale ──────────────────────────────────────
test('F — il salvataggio scrive operator_id/assignment_id reali in metadata (mai access_token)', () => {
  const matches = PANEL.match(/operator_key: selectedOperatorKey, operator_id: selectedOperator\?\.operatorId \|\| null, assignment_id: selectedOperator\?\.assignmentId \|\| null, admin_operator: true/g) || [];
  assert.ok(matches.length >= 2, 'metadata reale in create area + create linea');
  assert.doesNotMatch(PANEL, /access_token/);
  // GpsMonitor non passa access_token nel payload operatori
  const opMemo = GM.slice(GM.indexOf('const campaignOperators = useMemo'), GM.indexOf('const campaignOperators = useMemo') + 500);
  assert.doesNotMatch(opMemo, /access_token/);
});

test('10 — default operatore = quello della zona selezionata se determinabile', () => {
  assert.match(PANEL, /const defaultOperatorKey = useMemo\(/);
  assert.match(PANEL, /operatorOptions\.find\(\(o\) => o\.zoneId && o\.zoneId === zoneId\)/);
  assert.match(PANEL, /setSelectedOperatorKey\(defaultOperatorKey\)/);
});

// ── G: default tool = Linea ─────────────────────────────────────────
test('G — drawMode default = line', () => {
  assert.match(PANEL, /const \[drawMode, setDrawMode\] = useState\('line'\)/);
  assert.doesNotMatch(PANEL, /const \[drawMode, setDrawMode\] = useState\('area'\)/);
});

// ── H/I/J: vertex marker solo durante editing, piccoli, mai nel cliente ──
test('H/I — vertex marker solo con tool matita, piccoli (radius 3)', () => {
  assert.match(PANEL, /\{correcting && tool === 'draw' && activeVertices\.map\(\(v, i\) => \(/);
  assert.match(PANEL, /\{correcting && tool === 'draw' && activeLine\.map\(\(v, i\) => \(/);
  assert.doesNotMatch(PANEL, /activeVertices\.map\(\(v, i\) => \(\s*\n\s*<CircleMarker key=\{i\} center=\{v\} radius=\{5\}/);
  assert.match(PANEL, /center=\{v\} radius=\{3\}/);
});

test('J — preview Cliente: i vertex marker sono gated su `correcting` (editor Admin) -> mai nel cliente', () => {
  // ogni CircleMarker di vertice e' dentro `correcting && ...`
  assert.doesNotMatch(PANEL, /\n\s*\{activeVertices\.map/);
  assert.doesNotMatch(PANEL, /\n\s*\{activeLine\.map/);
});

// ── K/L: cliente uniforme, provenance interna distinta ──────────────
test('K/L — copertura finale con stile UNICO (VERIFIED_COVERAGE_STYLE), provenance interna via source', () => {
  assert.match(PANEL, /pathOptions=\{VERIFIED_COVERAGE_STYLE\}/);
  // Admin mantiene la distinzione interna per source
  assert.match(PANEL, /source = sourceLevel/);
  assert.match(PANEL, /'automatic_verified'/);
  assert.match(PANEL, /'manual_verified'/);
});

// ── M/N/O: non-regressione ─────────────────────────────────────────
test('M/N/O — multi-zona, partial eraser, undo invariati', () => {
  assert.match(PANEL, /mergeRoadNetworks\(settled\)/);
  assert.match(PANEL, /const pieces = splitPolylineByCircle\(original, pt, eraseRadiusM\)/);
  assert.match(PANEL, /last\.kind === 'split-line'/);
});

// ── P/Q: GPS raw + final coverage engine ─────────────────────────────
test('P/Q — GPS raw immutabile, motore final coverage non toccato', () => {
  assert.doesNotMatch(PANEL, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.match(PANEL, /NON modifica mai gps_tracking_points/);
  assert.doesNotMatch(PANEL, /\.rpc\(\s*['"]calculate_campaign_final_coverage/, 'il pannello non chiama il motore final coverage');
});
