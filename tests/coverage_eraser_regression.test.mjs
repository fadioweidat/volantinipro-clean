// Ticket "AUDIT + SEMPLIFICAZIONE EDITOR COPERTURA ADMIN" — subset sicuro
// (§1 gomma, §2 cerchio, §3 percentuale automatica). Test di contratto
// sorgente + comportamento sull'helper geometrico gia' esistente.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { splitPolylineByCircle } from '../src/lib/geo/splitPolylineByCircle.js';

const SRC = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');

// ── A/B: cerchio renderizzato quando la gomma e' attiva + segue il mouse ──
test('A/B — EraseCursorCapture: mousemove DOM sul container + Circle in pane dedicato', () => {
  assert.match(SRC, /function EraseCursorCapture\(\{ active, radiusM \}\)/);
  // DOM mousemove: risale dai figli SVG -> scatta anche sopra le linee di copertura
  assert.match(SRC, /const el = map\.getContainer\(\);/);
  assert.match(SRC, /el\.addEventListener\('mousemove', onMove\)/);
  assert.match(SRC, /map\.mouseEventToLatLng\(event\)/);
  assert.match(SRC, /el\.removeEventListener\('mousemove', onMove\)/);
  assert.match(SRC, /el\.addEventListener\('mouseleave', onLeave\)/);
  // NON usa piu' useMapEvents({ mousemove }) per il cerchio
  assert.doesNotMatch(SRC, /useMapEvents\(\{\s*mousemove\(event\) \{ if \(active\) onMove/);
});

test('§2 — cerchio in pane con z-index sopra overlayPane/markerPane, stile molto evidente', () => {
  assert.match(SRC, /map\.createPane\('vp-erase-pane'\)/);
  assert.match(SRC, /p\.style\.zIndex = 660/, 'sopra overlayPane 400 e markerPane 600');
  assert.match(SRC, /p\.style\.pointerEvents = 'none'/);
  assert.match(SRC, /<Circle\s+center=\{pt\}\s+radius=\{radiusM\}\s+pane="vp-erase-pane"\s+interactive=\{false\}/);
  assert.match(SRC, /color: '#ef4444', weight: 3, opacity: 0\.95, fillColor: '#ef4444', fillOpacity: 0\.2, dashArray: '6 5'/);
});

test('F — raggio visivo del cerchio = eraseRadiusM (nessun valore hardcoded)', () => {
  assert.match(SRC, /<EraseCursorCapture active=\{correcting && tool === 'erase'\} radiusM=\{eraseRadiusM\} \/>/);
  assert.match(SRC, /radius=\{radiusM\}/);
  assert.match(SRC, /const ERASE_RADIUS_M = eraseRadiusM;/);
  assert.doesNotMatch(SRC, /const ERASE_RADIUS_M = 35/);
});

// ── E: click su linea visibile NON restituisce falso "nessun tratto" ────
test('E/§1 — hit-test affidabile: handler <Polyline> primario + guardia anti doppio-fire + tolleranza generosa', () => {
  // il click sul tratto (hit-test preciso di Leaflet) marca il timestamp e ferma la propagazione
  assert.match(SRC, /justErasedRef\.current = Date\.now\(\);\s*\n\s*L\.DomEvent\.stopPropagation\(e\);\s*\n\s*applyDraftLineSplit\(line, \[e\.latlng\.lat, e\.latlng\.lng\]\)/);
  // il catch-all del map non rielabora lo stesso click
  assert.match(SRC, /if \(Date\.now\(\) - justErasedRef\.current < 80\) return;/);
  // fallback map: tolleranza generosa (>=30 m) per un click "sopra la linea" ma non esattamente sulla centerline
  assert.match(SRC, /const LINE_TOL_M = Math\.max\(ERASE_RADIUS_M, 30\);/);
  assert.match(SRC, /let bestI = -1; let bestD = LINE_TOL_M;/);
  // tratto reso piu' spesso in modalita' gomma -> bersaglio piu' facile
  assert.match(SRC, /weight: tool === 'erase' \? 8 : 3/);
});

// ── C/D/P: partial erase funziona sulla bozza, indipendente dal livello UI ──
test('C/D — partial erase sulla bozza automatica, via applyDraftLineSplit (helper puro, indipendente dal tab)', () => {
  assert.match(SRC, /applyDraftLineSplit\(draftLines\[bestI\], pt\)/);
  assert.match(SRC, /const pieces = splitPolylineByCircle\(original, pt, eraseRadiusM\)/);
  // eraseNearest NON dipende da sourceLevel: itera draftLines direttamente
  const fn = SRC.slice(SRC.indexOf('const eraseNearest'), SRC.indexOf('const handleCloseShape'));
  assert.doesNotMatch(fn, /sourceLevel/, 'la gomma sulla bozza non deve dipendere dal livello selezionato');
});

test('P — comportamento split invariato (taglio centrale -> 2 LineString, fuori -> invariata)', () => {
  const line = Array.from({ length: 11 }, (_, i) => [45, 9 + i * 0.001]);
  assert.equal(splitPolylineByCircle(line, [45, 9.005], 60).length, 2);
  assert.deepEqual(splitPolylineByCircle(line, [46, 10], 25), [line]);
});

// ── G/H/I: percentuale automatica sempre visibile in modalita' automatica ──
test('G — controlli "Copertura automatica" NON gated sul selettore livello (autoConfigVisible)', () => {
  assert.match(SRC, /const autoContext = defaultSourceLevel === 'automatic_verified' \|\| simple;/);
  assert.match(SRC, /const autoConfigVisible = autoContext \|\| sourceLevel === 'automatic_verified';/);
  assert.match(SRC, /\{correcting && !editingId && autoConfigVisible && \(/);
  assert.match(SRC, /\{autoKpi && autoConfigVisible && \(/);
});

test('H — preset 50/60/70/80/90/100 presenti + slider + input numerico', () => {
  assert.match(SRC, /AUTO_PCT_PRESETS\s*=\s*\[50,\s*60,\s*70,\s*80,\s*90,\s*100\]/);
  assert.match(SRC, /AUTO_PCT_PRESETS\.map\(\(p\) => \(\s*\n\s*<button[^>]*onClick=\{\(\) => setAutoPct\(p\)\}/);
  assert.match(SRC, /type="range" min=\{1\} max=\{100\}/);
  assert.match(SRC, /type="number" min=\{1\} max=\{100\}/);
});

test('I — CTA generazione unica (un solo bottone che chiama loadAutomaticBase)', () => {
  const loadBtns = SRC.match(/onClick=\{loadAutomaticBase\}/g) || [];
  assert.equal(loadBtns.length, 1, 'una sola CTA "Genera/Carica copertura automatica"');
});

// ── J: nessuna duplicazione del workflow automatico (audit, non fix in questo subset) ──
test('J — audit: un solo punto che genera la copertura automatica (loadAutomaticBase)', () => {
  const defs = SRC.match(/const loadAutomaticBase = async/g) || [];
  assert.equal(defs.length, 1);
});

// ── N: GPS raw immutabile ────────────────────────────────────────────
test('N — GPS raw: nessuna scrittura su gps_tracking_points; gps_exclusion resta overlay', () => {
  assert.doesNotMatch(SRC, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.match(SRC, /gps_exclusion/);
  assert.match(SRC, /NON modifica mai gps_tracking_points/);
});

// ── O/Q: multi-zona + undo invariati (contratto) ────────────────────
test('O — multi-zona invariata: mergeRoadNetworks + assignWayZoneId + Promise.allSettled', () => {
  assert.match(SRC, /mergeRoadNetworks\(settled\)/);
  assert.match(SRC, /assignWayZoneId\(w\.geometry, multiZonesEligible, fallbackZoneId\)\.zoneId/);
  assert.match(SRC, /Promise\.allSettled\(/);
});

test('Q — undo invariato: split-line ripristina la LineString originale', () => {
  assert.match(SRC, /\{ kind: 'split-line', original, pieces, hadOwner, ownerZoneId, wasAuto \}/);
  assert.match(SRC, /last\.kind === 'split-line'/);
  assert.match(SRC, /const restored = \[\.\.\.without\.slice\(0, insertAt\), last\.original, \.\.\.without\.slice\(insertAt\)\]/);
});
