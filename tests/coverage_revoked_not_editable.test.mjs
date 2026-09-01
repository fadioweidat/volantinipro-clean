// BUG RUNTIME — CORREZIONE_GIA_REVOCATA.
//
// Dopo il cleanup delle vecchie 62 righe automatic_verified (revoca eseguita
// FUORI dal pannello), il popup della Polyline mostrava ancora "Modifica" /
// "Revoca"; l'azione generava CORREZIONE_GIA_REVOCATA (l'RPC rifiuta un
// secondo revoke / un update su riga revocata).
//
// CAUSA: lo stato React `adjustments` del pannello era stale — nessuna
// ricarica quando il DB cambia dall'esterno. `activeAdjustments` conteneva
// ancora le righe con revoked_at=null (valore stale) -> rese come attive.
//
// FIX (contratto sorgente, nessuna DB in questo runner):
//  - activeAdjustments = SOLO revoked_at IS NULL (invariato, ribadito)
//  - refresh periodico di adjustments -> le revoche esterne spariscono
//  - handleRevoke: guardia no-second-revoke + rimozione ottimista + clear
//    editingId + CORREZIONE_GIA_REVOCATA trattato come non-errore
//  - startEditing / handleSave(update): rifiutano una riga revocata
//  - editingId azzerato se la riga in modifica viene revocata

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');

// ── attive vs revocate ────────────────────────────────────────────────
test('activeAdjustments = SOLO revoked_at IS NULL; le revocate sono lista a parte', () => {
  assert.match(PANEL, /const activeAdjustments = adjustments\.filter\(\(a\) => !a\.revoked_at\);/);
  assert.match(PANEL, /const revokedAdjustments = adjustments\.filter\(\(a\) => a\.revoked_at\);/);
  // storico: attive con azioni, revocate read-only
  assert.match(PANEL, /activeAdjustments\.map\(\(adj\) => \(\s*\n\s*<AdjustmentRow key=\{adj\.id\} adjustment=\{adj\} onEdit=\{[^}]*\} onRevoke=\{[^}]*\} \/>/);
  assert.match(PANEL, /revokedAdjustments\.map\(\(adj\) => \(\s*\n\s*<AdjustmentRow key=\{adj\.id\} adjustment=\{adj\} revoked \/>/);
});

test('AdjustmentRow: nessun pulsante Modifica/Revoca quando revoked', () => {
  const s = PANEL.indexOf('function AdjustmentRow(');
  const e = PANEL.indexOf('function CoverageMetric(');
  const row = PANEL.slice(s, e);
  assert.match(row, /\{!revoked && \(/);
  assert.match(row, /onClick=\{onEdit\}[^>]*>Modifica<\/button>/);
  assert.match(row, /onClick=\{onRevoke\}[^>]*>Revoca<\/button>/);
  // i pulsanti stanno DENTRO il ramo !revoked
  const guardIdx = row.indexOf('{!revoked && (');
  assert.ok(row.indexOf('>Modifica</button>') > guardIdx && row.indexOf('>Revoca</button>') > guardIdx);
});

// ── mappa: popup solo su righe ATTIVE ────────────────────────────────
test('mappa: Polyline/Polygon + popup Modifica/Revoca SOLO da activeAdjustments', () => {
  assert.match(PANEL, /\{activeAdjustments\.flatMap\(\(adj\) => \{/);
  // il popup con i pulsanti e' costruito dentro il map di activeAdjustments
  const block = PANEL.slice(PANEL.indexOf('{activeAdjustments.flatMap((adj) => {'), PANEL.indexOf('{activeAdjustments.flatMap((adj) => {') + 1600);
  assert.match(block, /onClick=\{\(\) => startEditing\(adj\)\}>Modifica<\/button>/);
  assert.match(block, /onClick=\{\(\) => handleRevoke\(adj\)\}>Revoca<\/button>/);
  // nessun map su `adjustments` grezzo per il rendering mappa
  assert.doesNotMatch(PANEL, /\{adjustments\.flatMap\(|\{adjustments\.map\(\(adj\) => \(\s*\n\s*<(Polyline|Polygon)/);
});

// ── refresh periodico: le revoche ESTERNE spariscono ─────────────────
test('mount effect: refresh periodico di adjustments (revoche esterne)', () => {
  const eff = PANEL.slice(PANEL.indexOf('const refresh = async () => {'), PANEL.indexOf('}, [campaignId]);') + 20);
  assert.match(eff, /const timer = window\.setInterval\(refresh, 20000\);/);
  assert.match(eff, /return \(\) => \{ cancelled = true; window\.clearInterval\(timer\); \};/);
  // il refresh ricarica listCoverageAdjustments + getFinalCoverage
  assert.match(eff, /listCoverageAdjustments\(campaignId\),\s*\n\s*getFinalCoverage\(campaignId\),/);
});

// ── handleRevoke: no-second-revoke + ottimista + graceful ────────────
test('handleRevoke: guardia, rimozione ottimista, clear editingId, CORREZIONE_GIA_REVOCATA non-errore, load() finale', () => {
  const fn = PANEL.slice(PANEL.indexOf('const handleRevoke ='), PANEL.indexOf('const activeAdjustments ='));
  assert.match(fn, /if \(!adjustment\?\.id \|\| adjustment\.revoked_at\) return;/);
  assert.match(fn, /setAdjustments\(\(prev\) => prev\.map\(\(a\) => \(\s*\n\s*a\.id === adjustment\.id\s*\n\s*\? \{ \.\.\.a, revoked_at: new Date\(\)\.toISOString\(\), revoke_reason: 'admin_revoked' \}/);
  assert.match(fn, /if \(editingId === adjustment\.id\) cancelCorrecting\(\);/);
  assert.match(fn, /if \(!\/CORREZIONE_GIA_REVOCATA\/i\.test\(err\?\.message \|\| ''\)\) \{\s*\n\s*window\.alert/);
  assert.match(fn, /\} finally \{\s*\n\s*await load\(\);/);
});

// ── startEditing / handleSave update: rifiutano riga revocata ────────
test('startEditing: rifiuta una riga revocata', () => {
  const fn = PANEL.slice(PANEL.indexOf('const startEditing ='), PANEL.indexOf('const startEditing =') + 500);
  assert.match(fn, /if \(!adjustment\?\.id \|\| adjustment\.revoked_at\) \{ setFormError\('Correzione revocata: non modificabile\.'\); return; \}/);
});

test('handleSave(update): CORREZIONE_GIA_REVOCATA -> chiude editor + reload, niente errore tecnico', () => {
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke ='));
  // ramo di update (editingId): il catch riconosce CORREZIONE_GIA_REVOCATA
  const branch = save.slice(save.indexOf('if (editingId) {'), save.indexOf('return;\n    }'));
  assert.match(branch, /\/CORREZIONE_GIA_REVOCATA\/i\.test\(err\?\.message \|\| ''\)/);
  assert.match(branch, /cancelCorrecting\(\);/);
  assert.match(branch, /await load\(\);/);
  assert.match(branch, /è stata revocata/);
});

test('editingId azzerato se la riga in modifica viene revocata (qui o altrove)', () => {
  assert.match(PANEL, /if \(!editingId\) return;\s*\n\s*const row = adjustments\.find\(\(a\) => a\.id === editingId\);\s*\n\s*if \(row && row\.revoked_at\) \{/);
  assert.match(PANEL, /if \(row && row\.revoked_at\) \{[\s\S]{0,120}cancelCorrecting\(\);/);
});

// ── gomma: solo su righe attive ─────────────────────────────────────
test('eraseNearest: cerca solo tra activeAdjustments; linea salvata -> split parziale, poligono -> revoca; guardie', () => {
  const fn = PANEL.slice(PANEL.indexOf('const eraseNearest'), PANEL.indexOf('const applyAutoSelectionFromCache'));
  assert.match(fn, /for \(const adj of activeAdjustments\)/);
  // linea salvata: GOMMA PARZIALE (handleSplitAdjustment), residui=[] -> revoca completa
  assert.match(fn, /if \(g\?\.type === 'LineString' \|\| g\?\.type === 'MultiLineString'\) \{[\s\S]{0,900}handleSplitAdjustment\(bestAdj, residuals\);/);
  // Polygon/MultiPolygon: revoca completa
  assert.match(fn, /handleRevoke\(bestAdj\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*setFormError/);
  // handleSplitAdjustment ha le stesse guardie di handleRevoke
  assert.match(PANEL, /const handleSplitAdjustment = async \(adjustment, residualLatLngs\) => \{\s*\n\s*if \(!adjustment\?\.id \|\| adjustment\.revoked_at\) return;/);
  assert.match(PANEL, /if \(editingId === adjustment\.id\) cancelCorrecting\(\);/);
});

// ── nessuna regressione sul batch automatic_verified ───────────────
test('NR — il salvataggio batch automatic_verified resta invariato', () => {
  assert.match(PANEL, /await createCoverageAdjustmentsBatch\(\{/);
  assert.match(PANEL, /setSourceLevel\('automatic_verified'\)/);
});
