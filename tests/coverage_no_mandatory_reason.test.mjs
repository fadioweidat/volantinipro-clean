// Ticket "CORREZIONE URGENTE ADMIN COVERAGE — RIMUOVERE MOTIVO OBBLIGATORIO
// + RIPRISTINARE COLORI PER OPERATORE". Test di contratto sorgente + test
// puri su getOperatorColor. Nessuna DB, nessuna migration.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { getOperatorColor, OPERATOR_PALETTE } from '../src/lib/geo/operatorColor.js';

const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');
const GM = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');

// ── A: nessun "Motivo (obbligatorio)" nella UI ─────────────────────────
test('A — nessun campo "Motivo (obbligatorio)" nel pannello', () => {
  assert.doesNotMatch(PANEL, /Motivo \(obbligatorio\)/);
  assert.doesNotMatch(PANEL, /Motivo della revoca \(obbligatorio\)/);
  assert.doesNotMatch(PANEL, /Il motivo e['’] obbligatorio/);
  assert.doesNotMatch(PANEL, /Il motivo della revoca e['’] obbligatorio/);
  // niente state / textarea del motivo
  assert.doesNotMatch(PANEL, /draftReason/);
  // resta solo "Note (facoltative)"
  assert.match(PANEL, /Note \(facoltative\)/);
});

// ── B: nessun window.prompt per il motivo (revoca inclusa) ─────────────
test('B — nessun window.prompt nel pannello', () => {
  assert.doesNotMatch(PANEL, /window\.prompt/);
  assert.doesNotMatch(PANEL, /\bprompt\(/);
});

// ── C: la revoca e' diretta e passa un reason interno neutro ───────────
test('C — handleRevoke diretto, reason interno "admin_revoked", nessun input utente', () => {
  const fn = PANEL.slice(PANEL.indexOf('const handleRevoke ='), PANEL.indexOf('const handleRevoke =') + 500);
  assert.match(fn, /revokeCoverageAdjustment\(\{ adjustmentId: adjustment\.id, reason: 'admin_revoked' \}\)/);
  assert.doesNotMatch(fn, /window\.prompt|window\.confirm/);
});

// ── C2: il salvataggio non blocca mai per assenza di testo ─────────────
test('C2 — handleSave: reason automatico da Note o "admin_adjustment", nessun return bloccante', () => {
  const fn = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke ='));
  assert.match(fn, /const autoReason = draftNotes\.trim\(\) \|\| 'admin_adjustment';/);
  assert.match(fn, /reason: autoReason/);
  assert.doesNotMatch(fn, /Il motivo e['’] obbligatorio/);
  // le 3 scritture (update, create area, create linea) usano autoReason
  assert.equal((fn.match(/reason: autoReason/g) || []).length, 3);
});

// ── D/E: colore per operatore deterministico e stabile ─────────────────
test('D/E — getOperatorColor deterministico, palette >= 10, stabile dopo rerender', () => {
  assert.ok(OPERATOR_PALETTE.length >= 10);
  const ids = ['op-A', 'op-B', 'op-C'];
  const c = ids.map(getOperatorColor);
  assert.equal(new Set(c).size, 3, '3 operatori -> 3 colori distinti');
  assert.deepEqual(c, ids.map(getOperatorColor), 'stesso id -> stesso colore (stabilita)');
  assert.ok(c.every((x) => OPERATOR_PALETTE.includes(x)));
});

// ── F: GPS e correzione manuale dello stesso operatore -> stesso colore ─
test('F — GPS track e correzione manuale usano la stessa chiave colore (operator_id)', () => {
  // GPS: getOperatorColor(driver_id)
  assert.match(GM, /getOperatorColor\(track\.session\.driver_id\)/);
  // manuale: operator_key = operator_id || assignment_id, colore = getOperatorColor(operator_key)
  assert.match(PANEL, /key: String\(o\.operatorId \|\| o\.assignmentId\)/);
  assert.match(PANEL, /return getOperatorColor\(operatorKey\)/);
  // stesso helper importato in entrambi
  assert.match(GM, /from '\.\.\/\.\.\/lib\/geo\/operatorColor\.js'/);
  assert.match(PANEL, /from '\.\.\/\.\.\/lib\/geo\/operatorColor\.js'/);
});

// ── G: legenda con NOMI operatori (GPS + manuali) + colore reale ───────
test('G — OperatorLegend: elenco nomi GPS reali + Admin manuali, non il solo contatore', () => {
  assert.match(PANEL, /function OperatorLegend\(/);
  assert.match(PANEL, /Operatori GPS reali/);
  assert.match(PANEL, /Operatori Admin manuali/);
  // usa nomi reali quando disponibili
  assert.match(PANEL, /op\.name \|\| `Operatore \$\{i \+ 1\}`/);
  assert.match(PANEL, /operatorLabelForKey\(key\)/);
  // pallino colorato con il colore dell'operatore (stesso della mappa)
  assert.match(PANEL, /borderRadius: 999, background: color/);
  assert.match(PANEL, /dot\(op\.color\)/);
  assert.match(PANEL, /dot\(manualOperatorColor\(key\)\)/);
  // GpsMonitor costruisce e passa gpsOperators (id + name + color) a entrambi i pannelli
  assert.match(GM, /const gpsOperators = useMemo\(/);
  assert.match(GM, /color: getOperatorColor\(id\)/);
  assert.equal((GM.match(/gpsOperators=\{gpsOperators\}/g) || []).length, 2);
});

// ── H: selettore operatore = tutti gli operatori della campagna ────────
test('H — selettore "Operatore associato" deriva da campaignOperators reali (tutti)', () => {
  assert.match(PANEL, /const operatorOptions = useMemo\(/);
  assert.match(PANEL, /Array\.isArray\(campaignOperators\) \? campaignOperators : \[\]/);
  assert.match(PANEL, /o\.operatorId \|\| o\.assignmentId/);
  assert.match(GM, /listCampaignAssignments\(campaignId\)/);
});

// ── I: GPS raw non modificato ─────────────────────────────────────────
test('I — nessuna scrittura su gps_tracking_points dal pannello', () => {
  assert.doesNotMatch(PANEL, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.match(PANEL, /NON modifica mai gps_tracking_points/);
});
