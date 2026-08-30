// Ticket "GOMMA PARZIALE SU LINESTRING NON SALVATE" — test reali sull'helper
// puro splitPolylineByCircle + contratto sorgente sul wiring in
// CoverageAdjustmentPanel (solo bozze, mai righe salvate, mai GPS raw).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { splitPolylineByCircle, polylineLengthMeters } from '../src/lib/geo/splitPolylineByCircle.js';

const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');

// Linea E–W a lat 45, da lng 9.000 a lng 9.010 (~785 m), 11 vertici equidistanti.
function ewLine(n = 11, lat = 45, lng0 = 9.0, lng1 = 9.01) {
  return Array.from({ length: n }, (_, i) => [lat, lng0 + ((lng1 - lng0) * i) / (n - 1)]);
}
const mid = [45, 9.005];
const totalLen = polylineLengthMeters(ewLine());

const finitePairs = (segs) => segs.every((s) => s.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b)));
const ascendingLng = (seg) => seg.every((p, i) => i === 0 || p[1] >= seg[i - 1][1] - 1e-12);

// ── A: fuori dal cerchio -> invariata ─────────────────────────────────
test('A — cerchio lontano: linea originale invariata', () => {
  const r = splitPolylineByCircle(ewLine(), [46, 10], 25);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], ewLine());
});

// ── B: completamente dentro -> [] ────────────────────────────────────
test('B — cerchio che copre tutta la linea: []', () => {
  const r = splitPolylineByCircle(ewLine(), mid, 5000);
  assert.deepEqual(r, []);
});

// ── C: taglio centrale -> 2 LineString ──────────────────────────────
test('C — taglio al centro: 2 LineString, estremi originali preservati', () => {
  const r = splitPolylineByCircle(ewLine(), mid, 60);
  assert.equal(r.length, 2);
  assert.ok(finitePairs(r));
  assert.deepEqual(r[0][0], [45, 9.0], 'il primo pezzo parte dall\'inizio originale');
  assert.deepEqual(r[1][r[1].length - 1], [45, 9.01], 'il secondo pezzo finisce alla fine originale');
  // il buco al centro: fine pezzo1 e inizio pezzo2 distano ~2*raggio
  const gap = polylineLengthMeters([r[0][r[0].length - 1], r[1][0]]);
  assert.ok(gap > 90 && gap < 150, `buco ~120 m atteso, ottenuto ${gap.toFixed(0)}`);
});

// ── D: taglio all'estremita' -> 1 LineString accorciata ─────────────
test('D — taglio su un estremo: 1 LineString accorciata dallo stesso lato', () => {
  const r = splitPolylineByCircle(ewLine(), [45, 9.01], 80); // cerchio sull'ultimo vertice
  assert.equal(r.length, 1);
  assert.deepEqual(r[0][0], [45, 9.0]);
  assert.ok(polylineLengthMeters(r[0]) < totalLen - 60);
  assert.ok(r[0][r[0].length - 1][1] < 9.01, 'l\'estremo finale e\' stato tagliato');
});

// ── E: segmento lungo attraversato SENZA vertici interni ────────────
test('E — segmento lungo (2 soli vertici) tagliato a meta\': split corretto, non "distanza dal vertice"', () => {
  const longSeg = [[45, 9.0], [45, 9.02]]; // ~1570 m, nessun vertice vicino al centro
  const r = splitPolylineByCircle(longSeg, [45, 9.01], 40);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0][0], [45, 9.0]);
  assert.deepEqual(r[1][1], [45, 9.02]);
  assert.ok(r[0][1][1] < 9.01 && r[1][0][1] > 9.01, 'i punti di taglio sono ai lati del centro');
});

// ── F: raggi 5 / 25 / 50 -> risultati coerenti (monotoni) ───────────
test('F — raggio 5/25/50 m: lunghezza residua decrescente, coerente', () => {
  const lens = [5, 25, 50].map((rad) => {
    const segs = splitPolylineByCircle(ewLine(21), mid, rad);
    return segs.reduce((s, seg) => s + polylineLengthMeters(seg), 0);
  });
  assert.ok(lens[0] > lens[1] && lens[1] > lens[2], `residuo deve calare col raggio: ${lens.map((x) => x.toFixed(0))}`);
  // raggio 5 m rimuove ~10 m dai ~785 -> residuo vicino al totale
  assert.ok(Math.abs(lens[0] - totalLen) < 40);
});

// ── G: nessun residuo con < 2 punti ────────────────────────────────
test('G — nessun segmento residuo con meno di 2 punti', () => {
  for (const rad of [3, 7, 15, 33, 77, 200]) {
    for (const seg of splitPolylineByCircle(ewLine(9), [45, 9.002], rad)) {
      assert.ok(seg.length >= 2, `residuo degenere con raggio ${rad}`);
    }
  }
});

// ── H: ordine geografico preservato ────────────────────────────────
test('H — ordine dei punti preservato (lng crescente lungo ogni residuo)', () => {
  for (const seg of splitPolylineByCircle(ewLine(15), mid, 45)) {
    assert.ok(ascendingLng(seg));
  }
});

// ── guardie di input ──────────────────────────────────────────────
test('guardie — raggio <=0 -> [line]; linea <2 punti -> []; centro non valido -> [line]', () => {
  assert.deepEqual(splitPolylineByCircle(ewLine(), mid, 0), [ewLine()]);
  assert.deepEqual(splitPolylineByCircle(ewLine(), mid, -5), [ewLine()]);
  assert.deepEqual(splitPolylineByCircle([[45, 9]], mid, 25), []);
  assert.deepEqual(splitPolylineByCircle(ewLine(), [NaN, 9], 25), [ewLine()]);
});

test('polylineLengthMeters — ~785 m per 0.01° di longitudine a lat 45', () => {
  assert.ok(Math.abs(totalLen - 786) < 20, `atteso ~785 m, ottenuto ${totalLen.toFixed(0)}`);
  assert.equal(polylineLengthMeters([[45, 9]]), 0);
});

// ── contratto sorgente: wiring nel pannello ───────────────────────
test('PANEL — split applicato SOLO alle draftLines, righe salvate = revoca intera', () => {
  const eraseFn = PANEL.slice(PANEL.indexOf('const eraseNearest'), PANEL.indexOf('const loadAutomaticBase'));
  assert.match(eraseFn, /applyDraftLineSplit\(draftLines\[bestI\], pt\)/);
  assert.doesNotMatch(eraseFn, /prev\.filter\(\(_, i\) => i !== bestI\)/, 'niente piu\' rimozione intera della bozza');
  assert.match(eraseFn, /if \(bestAdj\) \{ handleRevoke\(bestAdj\); return; \}/, 'riga salvata -> revoca intera invariata');
});

test('PANEL — §5 ownership: i pezzi ereditano lo zone_id della linea originale', () => {
  const fn = PANEL.slice(PANEL.indexOf('const applyDraftLineSplit'), PANEL.indexOf('const eraseNearest'));
  assert.match(fn, /const pieces = splitPolylineByCircle\(original, pt, eraseRadiusM\)/);
  assert.match(fn, /const ownerZoneId = autoLineOwnership\.get\(original\)/);
  assert.match(fn, /pieces\.forEach\(\(p\) => next\.set\(p, ownerZoneId\)\)/);
});

test('PANEL — §6 lastAutoLines: la reference originale e\' sostituita dai pezzi', () => {
  const fn = PANEL.slice(PANEL.indexOf('const applyDraftLineSplit'), PANEL.indexOf('const eraseNearest'));
  assert.match(fn, /const wasAuto = lastAutoLines\.includes\(original\)/);
  assert.match(fn, /setLastAutoLines\(\(prev\) => \{[\s\S]{0,220}\.\.\.pieces/);
});

test('PANEL — §7 undo split-line ripristina ESATTAMENTE la linea originale', () => {
  assert.match(PANEL, /\{ kind: 'split-line', original, pieces, hadOwner, ownerZoneId, wasAuto \}/);
  const undoFn = PANEL.slice(PANEL.indexOf('const handleUndo'), PANEL.indexOf('const startEditing'));
  assert.match(undoFn, /last\.kind === 'split-line'/);
  assert.match(undoFn, /last\.original/);
  assert.match(undoFn, /next\.set\(last\.original, last\.ownerZoneId\)/);
});

test('PANEL — §8 KPI live ricalcolati dalla geometria residua (mai il FINALE)', () => {
  assert.match(PANEL, /const recomputeAutoKpi = \(nextDraftLines\)/);
  assert.match(PANEL, /reduce\(\(s, l\) => s \+ polylineLengthMeters\(l\), 0\)/);
  assert.match(PANEL, /coveragePct: totalM > 0 \? \(selM \/ totalM\) \* 100 : 0/);
  assert.match(PANEL, /recomputeAutoKpi\(nextDraftLines\)/);
});

test('PANEL — §9 preview: il click sul tratto in modalita\' gomma fa lo split nel punto cliccato', () => {
  assert.match(PANEL, /eventHandlers=\{tool === 'erase' \? \{ click: \(e\) => \{\s*applyDraftLineSplit\(line, \[e\.latlng\.lat, e\.latlng\.lng\]\)/);
});

test('PANEL — §11 GPS raw: helper puramente geometrico, nessuna scrittura GPS introdotta', () => {
  const src = readFileSync(new URL('../src/lib/geo/splitPolylineByCircle.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /supabase|fetch\(|gps_tracking|delivery_sessions|\.rpc\(/, 'l\'helper e\' puro, nessun accesso a dati');
  // il pannello non introduce nuove DELETE/UPDATE su tabelle GPS
  assert.doesNotMatch(PANEL, /from\(['"]gps_tracking_points['"]\)|delete\(\)[\s\S]{0,40}gps_tracking/);
  // la gomma GPS resta l'esclusione overlay esistente
  assert.match(PANEL, /gps_exclusion/);
  assert.match(PANEL, /NON modifica mai gps_tracking_points/);
});
